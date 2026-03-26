import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import {
  prisma,
  Prisma,
  JobStatus,
  RemotePolicy,
  EmploymentType,
  SkillLevel,
  ShortlistStage,
  ApplicationStatus,
} from '@verihire/database';
import {
  CreateJobDto,
  UpdateJobDto,
  AddJobSkillDto,
  SearchJobsDto,
  ShortlistCandidateDto,
  UpdateShortlistDto,
  ApplyToJobDto,
  UpdateApplicationDto,
} from './dto/job.dto';
import { ConfigService } from '@nestjs/config';
import { ResumeAnalysisService } from '../resume-analysis/resume-analysis.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly aiApiKey: string;
  private readonly aiModel: string;
  private readonly aiBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly resumeAnalysisService: ResumeAnalysisService,
    private readonly notificationsService: NotificationsService
  ) {
    this.aiApiKey = this.configService.get<string>('openai.apiKey') || '';
    this.aiModel = this.configService.get<string>('openai.model') || 'llama-3.3-70b-versatile';
    this.aiBaseUrl = this.configService.get<string>(
      'openai.baseUrl',
      'https://api.groq.com/openai/v1'
    );
  }
  // ===== Job CRUD =====

  async createJob(recruiterId: string, data: CreateJobDto) {
    // Get recruiter's company
    const recruiter = await prisma.recruiterProfile.findUnique({
      where: { id: recruiterId },
      select: { companyId: true },
    });

    if (!recruiter?.companyId) {
      throw new BadRequestException('Please create your company profile before posting jobs');
    }

    return prisma.job.create({
      data: {
        recruiterId,
        companyId: recruiter.companyId,
        title: data.title,
        description: data.description,
        requirements: data.requirements,
        responsibilities: data.responsibilities,
        locationCity: data.locationCity,
        locationCountry: data.locationCountry,
        remotePolicy: data.remotePolicy as RemotePolicy,
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        salaryCurrency: data.salaryCurrency || 'USD',
        employmentType: data.employmentType as EmploymentType,
        experienceLevel: data.experienceLevel,
        experienceYearsMin: data.experienceYearsMin,
        experienceYearsMax: data.experienceYearsMax,
        status: 'DRAFT',
      },
      include: {
        company: {
          select: { id: true, name: true, logoUrl: true },
        },
        jobSkills: {
          include: {
            skill: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });
  }

  async updateJob(jobId: string, recruiterId: string, data: UpdateJobDto) {
    const job = await this.getJobForRecruiter(jobId, recruiterId);

    // Handle status changes
    const updateData: Record<string, unknown> = {
      title: data.title,
      description: data.description,
      requirements: data.requirements,
      responsibilities: data.responsibilities,
      locationCity: data.locationCity,
      locationCountry: data.locationCountry,
      remotePolicy: data.remotePolicy as RemotePolicy,
      salaryMin: data.salaryMin,
      salaryMax: data.salaryMax,
      salaryCurrency: data.salaryCurrency,
      employmentType: data.employmentType as EmploymentType,
      experienceLevel: data.experienceLevel,
      experienceYearsMin: data.experienceYearsMin,
      experienceYearsMax: data.experienceYearsMax,
    };

    if (data.status) {
      updateData.status = data.status as JobStatus;
      if (data.status === 'ACTIVE' && job.status === 'DRAFT') {
        updateData.publishedAt = new Date();
      }
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    return prisma.job.update({
      where: { id: jobId },
      data: updateData,
      include: {
        company: {
          select: { id: true, name: true, logoUrl: true },
        },
        jobSkills: {
          include: {
            skill: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });
  }

  async publishJob(jobId: string, recruiterId: string) {
    await this.getJobForRecruiter(jobId, recruiterId);

    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'ACTIVE',
        publishedAt: new Date(),
      },
    });
  }

  async closeJob(jobId: string, recruiterId: string) {
    await this.getJobForRecruiter(jobId, recruiterId);

    return prisma.job.update({
      where: { id: jobId },
      data: { status: 'CLOSED' },
    });
  }

  async deleteJob(jobId: string, recruiterId: string) {
    const job = await this.getJobForRecruiter(jobId, recruiterId);

    if (job.status === 'ACTIVE') {
      throw new BadRequestException('Cannot delete an active job. Close it first.');
    }

    // Delete related records
    await prisma.$transaction([
      prisma.jobSkill.deleteMany({ where: { jobId } }),
      prisma.shortlist.deleteMany({ where: { jobId } }),
      prisma.job.delete({ where: { id: jobId } }),
    ]);

    return { deleted: true };
  }

  // ===== Job Skills =====

  async addJobSkill(jobId: string, recruiterId: string, data: AddJobSkillDto) {
    await this.getJobForRecruiter(jobId, recruiterId);

    // Verify skill exists
    const skill = await prisma.skill.findUnique({
      where: { id: data.skillId },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    return prisma.jobSkill.create({
      data: {
        jobId,
        skillId: data.skillId,
        minScore: data.minScore ?? 60,
        minLevel: data.minLevel as SkillLevel,
        required: data.required ?? true,
      },
      include: {
        skill: {
          select: { id: true, name: true, slug: true, category: true },
        },
      },
    });
  }

  async removeJobSkill(jobId: string, recruiterId: string, skillId: string) {
    await this.getJobForRecruiter(jobId, recruiterId);

    const jobSkill = await prisma.jobSkill.findFirst({
      where: { jobId, skillId },
    });

    if (!jobSkill) {
      throw new NotFoundException('Skill not associated with this job');
    }

    await prisma.jobSkill.delete({ where: { id: jobSkill.id } });
    return { deleted: true };
  }

  // ===== Job Search & Listing =====

  async searchJobs(options: SearchJobsDto) {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const where: Record<string, unknown> = {
      status: 'ACTIVE',
    };

    if (options.query) {
      where.OR = [
        { title: { contains: options.query, mode: 'insensitive' } },
        { description: { contains: options.query, mode: 'insensitive' } },
      ];
    }

    if (options.locationCountry) {
      where.locationCountry = options.locationCountry;
    }

    if (options.locationCity) {
      where.locationCity = { contains: options.locationCity, mode: 'insensitive' };
    }

    if (options.remotePolicy) {
      where.remotePolicy = options.remotePolicy;
    }

    if (options.employmentType) {
      where.employmentType = options.employmentType;
    }

    if (options.salaryMin !== undefined) {
      where.salaryMax = { gte: options.salaryMin };
    }

    if (options.skillId) {
      where.jobSkills = { some: { skillId: options.skillId } };
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          company: {
            select: { id: true, name: true, logoUrl: true },
          },
          jobSkills: {
            include: {
              skill: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
        orderBy: { publishedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.job.count({ where }),
    ]);

    return {
      items: jobs.map(job => this.formatJobListing(job)),
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + jobs.length < total,
      },
    };
  }

  async getJobById(jobId: string, trackView = false, publicOnly = false, recruiterId?: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            websiteUrl: true,
            description: true,
            companySize: true,
            industry: true,
          },
        },
        jobSkills: {
          include: {
            skill: {
              select: { id: true, name: true, slug: true, category: true },
            },
          },
        },
        recruiter: {
          select: {
            id: true,
            userId: true,
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // For public access, only show active jobs (recruiters can see their own)
    if (publicOnly && job.status !== 'ACTIVE') {
      if (!recruiterId || job.recruiterId !== recruiterId) {
        throw new NotFoundException('Job not found');
      }
    }

    // Track view if job is active
    if (trackView && job.status === 'ACTIVE') {
      await prisma.job.update({
        where: { id: jobId },
        data: { viewsCount: { increment: 1 } },
      });
    }

    return job;
  }

  async getRecruiterJobs(
    recruiterId: string,
    options?: { status?: JobStatus; limit?: number; offset?: number }
  ) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const where: Record<string, unknown> = { recruiterId };
    if (options?.status) {
      where.status = options.status;
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          company: {
            select: { id: true, name: true, logoUrl: true },
          },
          jobSkills: {
            include: {
              skill: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
          _count: {
            select: { shortlists: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.job.count({ where }),
    ]);

    return {
      items: jobs,
      pagination: { total },
    };
  }

  // ===== Shortlist / Applications =====

  async shortlistCandidate(jobId: string, recruiterId: string, data: ShortlistCandidateDto) {
    await this.getJobForRecruiter(jobId, recruiterId);

    // Verify candidate exists
    const candidate = await prisma.candidateProfile.findUnique({
      where: { id: data.candidateId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Check if already shortlisted
    const existing = await prisma.shortlist.findUnique({
      where: {
        jobId_candidateId: { jobId, candidateId: data.candidateId },
      },
    });

    if (existing) {
      throw new BadRequestException('Candidate already shortlisted for this job');
    }

    const shortlist = await prisma.shortlist.create({
      data: {
        jobId,
        recruiterId,
        candidateId: data.candidateId,
        stage: 'SHORTLISTED',
        notes: data.notes,
        rating: data.rating,
        stageHistory: [
          {
            stage: 'SHORTLISTED',
            timestamp: new Date().toISOString(),
            notes: data.notes,
          },
        ],
      },
      include: {
        candidate: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
            candidateSkills: {
              include: {
                skill: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    // Update job application count
    await prisma.job.update({
      where: { id: jobId },
      data: { applicationsCount: { increment: 1 } },
    });

    // Notify candidate they've been shortlisted
    try {
      const candidateProfile = await prisma.candidateProfile.findUnique({
        where: { id: data.candidateId },
        select: { userId: true },
      });

      if (candidateProfile) {
        await this.notificationsService.create(candidateProfile.userId, {
          type: 'SHORTLISTED',
          title: `You've been shortlisted`,
          message: `A recruiter has shortlisted you for a position.`,
          link: `/dashboard`,
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to send SHORTLISTED notification: ${err}`);
    }

    return shortlist;
  }

  async updateShortlist(
    jobId: string,
    candidateId: string,
    recruiterId: string,
    data: UpdateShortlistDto
  ) {
    await this.getJobForRecruiter(jobId, recruiterId);

    const shortlist = await prisma.shortlist.findUnique({
      where: {
        jobId_candidateId: { jobId, candidateId },
      },
    });

    if (!shortlist) {
      throw new NotFoundException('Candidate not in shortlist');
    }

    const updateData: Record<string, unknown> = {};
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.rating !== undefined) updateData.rating = data.rating;

    if (data.stage) {
      updateData.stage = data.stage as ShortlistStage;
      updateData.stageUpdatedAt = new Date();

      // Append to stage history
      const history = (shortlist.stageHistory as Array<Record<string, unknown>>) || [];
      history.push({
        stage: data.stage,
        timestamp: new Date().toISOString(),
        notes: data.notes,
      });
      updateData.stageHistory = history;
    }

    const updated = await prisma.shortlist.update({
      where: { id: shortlist.id },
      data: updateData,
      include: {
        candidate: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    // Notify candidate when stage changes
    if (data.stage) {
      try {
        const candidateProfile = await prisma.candidateProfile.findUnique({
          where: { id: candidateId },
          select: { userId: true },
        });

        const stageLabels: Record<string, string> = {
          SCREENING: 'moved to screening',
          INTERVIEW: 'scheduled for interview',
          ASSESSMENT: 'moved to assessment',
          OFFER: 'received an offer',
          HIRED: 'been hired',
          REJECTED: 'not been selected',
        };

        if (candidateProfile) {
          const stageMsg = stageLabels[data.stage] || `been updated to ${data.stage}`;
          const notifType =
            data.stage === 'REJECTED'
              ? 'REJECTED'
              : data.stage === 'HIRED'
                ? 'HIRED'
                : 'APPLICATION_STATUS';
          await this.notificationsService.create(candidateProfile.userId, {
            type: notifType as any,
            title: `Application update`,
            message: `You have ${stageMsg}.`,
            link: `/dashboard`,
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to send stage change notification: ${err}`);
      }
    }

    return updated;
  }

  async removeFromShortlist(jobId: string, candidateId: string, recruiterId: string) {
    await this.getJobForRecruiter(jobId, recruiterId);

    const shortlist = await prisma.shortlist.findUnique({
      where: {
        jobId_candidateId: { jobId, candidateId },
      },
    });

    if (!shortlist) {
      throw new NotFoundException('Candidate not in shortlist');
    }

    await prisma.shortlist.delete({ where: { id: shortlist.id } });

    // Update job application count
    await prisma.job.update({
      where: { id: jobId },
      data: { applicationsCount: { decrement: 1 } },
    });

    return { removed: true };
  }

  async getJobShortlist(
    jobId: string,
    recruiterId: string,
    options?: { stage?: ShortlistStage; limit?: number; offset?: number }
  ) {
    await this.getJobForRecruiter(jobId, recruiterId);

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: Record<string, unknown> = { jobId };
    if (options?.stage) {
      where.stage = options.stage;
    }

    const [shortlists, total] = await Promise.all([
      prisma.shortlist.findMany({
        where,
        include: {
          candidate: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                  avatarUrl: true,
                },
              },
              candidateSkills: {
                include: {
                  skill: {
                    select: { id: true, name: true, slug: true },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ stage: 'asc' }, { stageUpdatedAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.shortlist.count({ where }),
    ]);

    return {
      items: shortlists,
      meta: { total, limit, offset, hasMore: offset + shortlists.length < total },
    };
  }

  // ===== Candidate's view of jobs =====

  async getCandidateShortlists(candidateId: string, options?: { limit?: number; offset?: number }) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const [shortlists, total] = await Promise.all([
      prisma.shortlist.findMany({
        where: { candidateId },
        include: {
          job: {
            include: {
              company: {
                select: { id: true, name: true, logoUrl: true },
              },
            },
          },
        },
        orderBy: { stageUpdatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.shortlist.count({ where: { candidateId } }),
    ]);

    return {
      items: shortlists,
      meta: { total, limit, offset, hasMore: offset + shortlists.length < total },
    };
  }

  // ===== Match candidates to job =====

  private async aiRankCandidates(
    job: { title: string; description: string | null; requirements?: string | null },
    candidates: Array<{
      id: string;
      user: { firstName: string | null; lastName: string | null };
      currentRole?: string | null;
      currentCompany?: string | null;
      yearsExperience?: number | null;
      candidateSkills: Array<{ skill: { name: string }; level?: string | null; verified: boolean }>;
      domainScores: unknown;
      matchScore: number;
    }>
  ): Promise<
    Array<{
      candidateId: string;
      aiScore: number;
      reasoning: string;
      strengths: string[];
      gaps: string[];
    }>
  > {
    if (!this.aiApiKey || candidates.length === 0) return [];

    const systemPrompt = `You are an expert technical recruiter AI. You evaluate candidates for job positions.
You will receive a job description and a list of candidates with their skills and assessment scores.
For each candidate, provide:
- aiScore (0-100): How well they fit this specific role
- reasoning (1-2 sentences): Why this score
- strengths (2-3 bullet points): What makes them a good fit
- gaps (1-2 bullet points): What they're missing

Return ONLY a JSON array: [{ "candidateId": "...", "aiScore": 0, "reasoning": "...", "strengths": ["..."], "gaps": ["..."] }]`;

    const candidateSummaries = candidates.map(c => ({
      id: c.id,
      name: `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim(),
      currentRole: c.currentRole || 'Not specified',
      experience: c.yearsExperience ? `${c.yearsExperience} years` : 'Unknown',
      skills: c.candidateSkills
        .map(s => `${s.skill.name} (${s.level || 'unrated'}${s.verified ? ', verified' : ''})`)
        .join(', '),
      domainScores: c.domainScores || {},
      ruleBasedScore: c.matchScore,
    }));

    const userPrompt = `## Job
Title: ${job.title}
Description: ${job.description || 'Not specified'}
Requirements: ${job.requirements || 'Not specified'}

## Candidates
${JSON.stringify(candidateSummaries, null, 2)}

Score each candidate for this specific role. Be critical — only give 80+ to truly strong matches.`;

    try {
      const response = await fetch(`${this.aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.aiApiKey}`,
        },
        body: JSON.stringify({
          model: this.aiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        this.logger.error(`Groq API error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonStr = content
        .replace(/```json?\n?/g, '')
        .replace(/```/g, '')
        .trim();
      return JSON.parse(jsonStr);
    } catch (err) {
      this.logger.error(`AI ranking failed: ${err}`);
      return [];
    }
  }

  async findMatchingCandidates(
    jobId: string,
    recruiterId: string,
    options?: { limit?: number; offset?: number }
  ) {
    await this.getJobForRecruiter(jobId, recruiterId);

    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    // Get job's required skills
    const jobSkills = await prisma.jobSkill.findMany({
      where: { jobId },
      include: {
        skill: { select: { id: true, name: true } },
      },
    });

    if (jobSkills.length === 0) {
      return {
        items: [],
        meta: { total: 0, limit, offset, hasMore: false },
        message: 'Add skills to the job to find matching candidates',
      };
    }

    const requiredSkillIds = jobSkills.filter(js => js.required).map(js => js.skillId);

    // Find candidates with matching skills or domain scores
    // First get all skill names for the job to match against domainScores
    const jobSkillNames = jobSkills.map(js => js.skill.name);

    const candidates = await prisma.candidateProfile.findMany({
      where: {
        OR: [
          {
            candidateSkills: {
              some: {
                skillId: { in: jobSkills.map(js => js.skillId) },
              },
            },
          },
          // Also include candidates that might have domain scores but no explicit skill link
          {
            domainScores: { not: Prisma.DbNull },
          },
        ],
      },
      select: {
        id: true,
        currentRole: true,
        currentCompany: true,
        locationCity: true,
        headline: true,
        yearsExperience: true,
        domainScores: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        candidateSkills: {
          select: {
            skillId: true,
            level: true,
            score: true,
            verified: true,
            skill: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      take: limit * 3, // Fetch more for scoring
      skip: offset,
    });

    // Filter out candidates who already applied to this job
    const existingApplications = await prisma.jobApplication.findMany({
      where: { jobId },
      select: { candidateId: true },
    });
    const appliedCandidateIds = new Set(existingApplications.map(a => a.candidateId));
    const filteredCandidates = candidates.filter(c => !appliedCandidateIds.has(c.id));

    const ruleResults = this.matchCandidatesRuleBased(
      jobSkills,
      filteredCandidates as any,
      requiredSkillIds,
      jobSkillNames,
      limit,
      offset
    );

    // AI re-rank top candidates
    const topCandidates = ruleResults.items.slice(0, 10);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { title: true, description: true, requirements: true },
    });

    const aiScores = job ? await this.aiRankCandidates(job, topCandidates as any) : [];

    // Merge AI scores into results
    const aiScoreMap = new Map(aiScores.map(a => [a.candidateId, a]));
    const enhancedItems = ruleResults.items.map(candidate => {
      const ai = aiScoreMap.get(candidate.id);
      return {
        ...candidate,
        aiScore: ai?.aiScore ?? null,
        aiReasoning: ai?.reasoning ?? null,
        aiStrengths: ai?.strengths ?? [],
        aiGaps: ai?.gaps ?? [],
      };
    });

    // Re-sort: AI-scored candidates first (by aiScore), then rest by matchScore
    enhancedItems.sort((a, b) => {
      if (a.aiScore != null && b.aiScore != null) return b.aiScore - a.aiScore;
      if (a.aiScore != null) return -1;
      if (b.aiScore != null) return 1;
      return b.matchScore - a.matchScore;
    });

    return {
      items: enhancedItems,
      meta: ruleResults.meta,
    };
  }

  /**
   * Rule-based candidate matching, enhanced with domain scores
   */
  private matchCandidatesRuleBased(
    jobSkills: Array<{
      skillId: string;
      minScore: number | null;
      required: boolean;
      skill: { id: string; name: string };
    }>,
    candidates: Array<{
      id: string;
      domainScores: unknown;
      user: { firstName: string | null; lastName: string | null; avatarUrl: string | null };
      candidateSkills: Array<{
        skillId: string;
        score: unknown;
        verified: boolean;
        skill: { id: string; name: string; slug: string };
      }>;
    }>,
    requiredSkillIds: string[],
    jobSkillNames: string[],
    limit: number,
    offset: number
  ) {
    // Score candidates based on skill match + domain scores
    const scoredCandidates = candidates.map(candidate => {
      let matchScore = 0;
      let matchedSkills = 0;
      let missingRequired = 0;

      // Parse domain scores from JSON
      const domains = (candidate.domainScores ?? {}) as Record<
        string,
        { score: number; count: number; level: string; maxDifficulty: string }
      >;

      // Build a lowercase lookup map for domain scores
      const domainLookup = new Map<
        string,
        { score: number; count: number; level: string; maxDifficulty: string }
      >();
      for (const [key, value] of Object.entries(domains)) {
        domainLookup.set(key.toLowerCase(), value);
      }

      // Track which job skills are matched by domain scores
      const domainMatches: Array<{
        skillName: string;
        domainScore: number;
        domainLevel: string;
      }> = [];
      let domainMatchedCount = 0;

      for (const jobSkill of jobSkills) {
        const candidateSkill = candidate.candidateSkills.find(
          cs => cs.skillId === jobSkill.skillId
        );

        // Check domain scores for this skill (match by skill name)
        const domainEntry = domainLookup.get(jobSkill.skill.name.toLowerCase());

        if (candidateSkill || domainEntry) {
          matchedSkills++;

          // Determine best score from either source
          let bestScore = 0;

          if (candidateSkill) {
            bestScore = candidateSkill.score
              ? Number(candidateSkill.score)
              : candidateSkill.verified
                ? 70
                : 50;
          }

          if (domainEntry && domainEntry.score > bestScore) {
            bestScore = domainEntry.score;
          }

          if (domainEntry) {
            domainMatchedCount++;
            domainMatches.push({
              skillName: jobSkill.skill.name,
              domainScore: domainEntry.score,
              domainLevel: domainEntry.level,
            });
          }

          const scoreRatio = bestScore / (jobSkill.minScore || 60);
          matchScore += scoreRatio * (jobSkill.required ? 2 : 1);
        } else if (jobSkill.required) {
          missingRequired++;
        }
      }

      // Penalize missing required skills
      if (missingRequired > 0) {
        matchScore -= missingRequired * 2;
      }

      // Calculate domain match percentage
      const domainMatchPercentage =
        jobSkillNames.length > 0
          ? Math.round((domainMatchedCount / jobSkillNames.length) * 100)
          : 0;

      return {
        ...candidate,
        domainScores: domains,
        matchScore: Math.round(matchScore * 10) / 10,
        matchedSkillsCount: matchedSkills,
        totalRequiredSkills: requiredSkillIds.length,
        hasAllRequired: missingRequired === 0,
        domainMatchPercentage,
        domainMatches,
        mlPowered: false,
      };
    });

    // Sort by match score and filter to limit
    const sorted = scoredCandidates
      .filter(c => c.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    return {
      items: sorted,
      meta: {
        total: sorted.length,
        limit,
        offset,
        hasMore: candidates.length > limit,
      },
    };
  }

  /**
   * Convert skill level enum to numeric value
   */
  private skillLevelToNumber(level: string | null): number {
    switch (level) {
      case 'BEGINNER':
        return 1;
      case 'INTERMEDIATE':
        return 2;
      case 'ADVANCED':
        return 3;
      case 'EXPERT':
        return 4;
      case 'MASTER':
        return 5;
      default:
        return 2; // Default to intermediate
    }
  }

  // ===== Job Applications =====

  async applyToJob(jobId: string, candidateId: string, data: ApplyToJobDto) {
    // Validate job exists and is ACTIVE
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        jobSkills: {
          include: {
            skill: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status !== 'ACTIVE') {
      throw new BadRequestException('This job is not currently accepting applications');
    }

    if (!job.jobSkills || job.jobSkills.length === 0) {
      throw new BadRequestException(
        'This job has no skill requirements configured yet. Please try again later.'
      );
    }

    // Check candidate has uploaded a resume
    const profile = await prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      select: { resumeUrl: true },
    });

    if (!profile?.resumeUrl) {
      throw new BadRequestException('Please upload your resume before applying');
    }

    // Check candidate hasn't already applied
    const existing = await prisma.jobApplication.findUnique({
      where: {
        jobId_candidateId: { jobId, candidateId },
      },
    });

    if (existing) {
      throw new ConflictException('You have already applied to this job');
    }

    // Create application
    const application = await prisma.jobApplication.create({
      data: {
        jobId,
        candidateId,
        status: 'APPLIED',
        coverLetter: data.coverLetter,
      },
    });

    // Increment application count on job
    await prisma.job.update({
      where: { id: jobId },
      data: { applicationsCount: { increment: 1 } },
    });

    // Update application status to TESTING before attempting challenge generation
    await prisma.jobApplication.update({
      where: { id: application.id },
      data: { status: 'TESTING' },
    });

    // Generate challenges based on job's required skills
    const challengeIds: string[] = [];

    try {
      const jobSkills = job.jobSkills;

      if (jobSkills.length > 0) {
        // Get candidate profile for seniority info
        const candidate = await prisma.candidateProfile.findUnique({
          where: { id: candidateId },
          select: {
            resumeSeniorityLevel: true,
            resumeDomains: true,
            resumeYearsExp: true,
            yearsExperience: true,
          },
        });

        const seniorityLevel = candidate?.resumeSeniorityLevel || 'mid';
        const yearsExp = candidate?.resumeYearsExp || candidate?.yearsExperience || 0;

        // Use skill names as domains for challenge generation
        const skillNames = jobSkills.map(js => js.skill.name);

        // Generate challenges from the job's required skills (up to 4 total)
        const challenges = await this.resumeAnalysisService.generateChallengesFromResume({
          seniorityLevel,
          domains: skillNames,
          totalYearsExp: yearsExp,
        });

        const timeLimitMap: Record<string, number> = {
          BEGINNER: 25,
          INTERMEDIATE: 35,
          ADVANCED: 45,
          EXPERT: 60,
        };

        // Limit to 4 challenges max
        const limitedChallenges = challenges.slice(0, 4);

        for (const c of limitedChallenges) {
          const challenge = await prisma.challenge.create({
            data: {
              title: c.title,
              description: c.description,
              difficulty: c.difficulty as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT',
              type: c.type as 'CODING' | 'DESIGN' | 'WRITTEN' | 'MIXED',
              category: c.category as 'GENERAL_SWE' | 'DOMAIN_SPECIFIC',
              referenceSolution: c.referenceSolution,
              solutionLanguage: c.solutionLanguage,
              supportedLanguages: [
                ...new Set(
                  [
                    c.solutionLanguage,
                    'python',
                    'javascript',
                    'typescript',
                    'java',
                    'cpp',
                    'csharp',
                    'go',
                    'rust',
                    'ruby',
                    'php',
                    'kotlin',
                    'swift',
                    'scala',
                    'bash',
                  ].filter(Boolean)
                ),
              ],
              timeLimitMinutes: timeLimitMap[c.difficulty] || 30,
              generatedForCandidateId: candidateId,
              jobApplicationId: application.id,
              domainTag: c.domainTag,
            },
          });
          challengeIds.push(challenge.id);
        }

        this.logger.log(
          `Generated ${challengeIds.length} challenges for application ${application.id} (job ${jobId})`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate challenges for application ${application.id}: ${error}`
      );
      // Application is still created even if challenge generation fails
    }

    // Notify candidate that their application was received
    try {
      const candidateUser = await prisma.candidateProfile.findUnique({
        where: { id: candidateId },
        select: { userId: true },
      });
      if (candidateUser) {
        await this.notificationsService.create(candidateUser.userId, {
          type: 'APPLICATION_STATUS',
          title: `Application submitted`,
          message: `Your application for ${job.title} has been received. Complete the skill challenges to proceed.`,
          link: `/dashboard`,
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to send candidate application confirmation notification: ${err}`);
    }

    // Notify the recruiter about the new application
    try {
      if (job.recruiterId) {
        const recruiterProfile = await prisma.recruiterProfile.findUnique({
          where: { id: job.recruiterId },
          select: { userId: true },
        });
        if (recruiterProfile) {
          await this.notificationsService.create(recruiterProfile.userId, {
            type: 'APPLICATION_RECEIVED',
            title: `New application for ${job.title}`,
            message: 'A candidate has applied to your job posting.',
            link: `/recruiter/jobs/${jobId}/applicants`,
            metadata: { jobId, applicationId: application.id },
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to send APPLICATION_RECEIVED notification: ${err}`);
    }

    // Return the application with challenge IDs
    const updatedApplication = await prisma.jobApplication.findUnique({
      where: { id: application.id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            company: { select: { id: true, name: true, logoUrl: true } },
          },
        },
        challenges: {
          select: {
            id: true,
            title: true,
            domainTag: true,
          },
        },
      },
    });

    return {
      ...updatedApplication,
      challenges: updatedApplication?.challenges.map(c => ({
        id: c.id,
        title: c.title,
        skillName: c.domainTag || 'General',
      })),
    };
  }

  async getJobApplications(
    jobId: string,
    recruiterId: string,
    options?: {
      status?: ApplicationStatus;
      limit?: number;
      offset?: number;
    }
  ) {
    await this.getJobForRecruiter(jobId, recruiterId);

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: Record<string, unknown> = { jobId };
    if (options?.status) {
      where.status = options.status;
    }

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        include: {
          candidate: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                  avatarUrl: true,
                },
              },
              candidateSkills: {
                include: {
                  skill: {
                    select: { id: true, name: true, slug: true },
                  },
                },
              },
            },
          },
          challenges: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              type: true,
              domainTag: true,
              submissions: {
                select: {
                  id: true,
                  status: true,
                  finalScore: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          certificate: {
            select: {
              id: true,
              certificateNumber: true,
              finalScore: true,
              grade: true,
              metadata: true,
              issuedAt: true,
            },
          },
        },
        orderBy: { appliedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.jobApplication.count({ where }),
    ]);

    return {
      items: applications,
      meta: { total, limit, offset, hasMore: offset + applications.length < total },
    };
  }

  async updateJobApplication(
    jobId: string,
    applicationId: string,
    recruiterId: string,
    data: UpdateApplicationDto
  ) {
    await this.getJobForRecruiter(jobId, recruiterId);

    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.jobId !== jobId) {
      throw new BadRequestException('Application does not belong to this job');
    }

    const updateData: Record<string, unknown> = {};

    if (data.reviewerNotes !== undefined) {
      updateData.reviewerNotes = data.reviewerNotes;
    }

    if (data.status) {
      updateData.status = data.status as ApplicationStatus;

      // Set reviewedAt when transitioning to review-related statuses
      if (['REVIEWED', 'SHORTLISTED', 'REJECTED', 'HIRED'].includes(data.status)) {
        updateData.reviewedAt = new Date();
      }
    }

    const updated = await prisma.jobApplication.update({
      where: { id: applicationId },
      data: updateData,
      include: {
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
        job: {
          select: { title: true },
        },
        challenges: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            type: true,
          },
        },
      },
    });

    // Notify candidate on status changes
    if (data.status) {
      try {
        const candidateUserId = updated.candidate.user.id;
        const jobTitle = updated.job.title;
        const notificationMap: Record<
          string,
          { type: 'SHORTLISTED' | 'REJECTED' | 'HIRED'; title: string; message: string }
        > = {
          SHORTLISTED: {
            type: 'SHORTLISTED',
            title: `You've been shortlisted for ${jobTitle}`,
            message: 'Congratulations! The recruiter has shortlisted your application.',
          },
          REJECTED: {
            type: 'REJECTED',
            title: `Application update for ${jobTitle}`,
            message: 'Unfortunately, your application was not selected to move forward.',
          },
          HIRED: {
            type: 'HIRED',
            title: `Congratulations! You've been hired for ${jobTitle}`,
            message: 'Great news! The recruiter has marked you as hired.',
          },
        };

        const notif = notificationMap[data.status];
        if (notif) {
          await this.notificationsService.create(candidateUserId, {
            type: notif.type,
            title: notif.title,
            message: notif.message,
            link: `/jobs`,
            metadata: { jobId, applicationId },
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to send application status notification: ${err}`);
      }
    }

    return updated;
  }

  async getCandidateApplications(
    candidateId: string,
    options?: { limit?: number; offset?: number }
  ) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where: { candidateId },
        include: {
          job: {
            include: {
              company: {
                select: { id: true, name: true, logoUrl: true },
              },
              jobSkills: {
                include: {
                  skill: {
                    select: { id: true, name: true, slug: true },
                  },
                },
              },
            },
          },
          challenges: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              type: true,
              domainTag: true,
              submissions: {
                where: { candidateId },
                select: {
                  id: true,
                  status: true,
                  finalScore: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { appliedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.jobApplication.count({ where: { candidateId } }),
    ]);

    return {
      items: applications,
      meta: { total, limit, offset, hasMore: offset + applications.length < total },
    };
  }

  // ===== Helper methods =====

  private async getJobForRecruiter(jobId: string, recruiterId: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.recruiterId !== recruiterId) {
      throw new ForbiddenException('You do not have access to this job');
    }

    return job;
  }

  private formatJobListing(job: Record<string, unknown>) {
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      company: job.company,
      locationCity: job.locationCity,
      locationCountry: job.locationCountry,
      remotePolicy: job.remotePolicy,
      employmentType: job.employmentType,
      salaryRange:
        job.salaryMin || job.salaryMax
          ? {
              min: job.salaryMin,
              max: job.salaryMax,
              currency: job.salaryCurrency,
              period: job.salaryPeriod,
            }
          : null,
      experienceLevel: job.experienceLevel,
      skills: (job.jobSkills as Array<{ skill: unknown }>)?.map(js => js.skill) || [],
      publishedAt: job.publishedAt,
      viewsCount: job.viewsCount,
      applicationsCount: job.applicationsCount,
    };
  }
}

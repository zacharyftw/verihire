import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  prisma,
  JobStatus,
  RemotePolicy,
  EmploymentType,
  SkillLevel,
  ShortlistStage,
} from '@verihire/database';
import {
  CreateJobDto,
  UpdateJobDto,
  AddJobSkillDto,
  SearchJobsDto,
  ShortlistCandidateDto,
  UpdateShortlistDto,
} from './dto/job.dto';

@Injectable()
export class JobsService {
  // ===== Job CRUD =====

  async createJob(recruiterId: string, data: CreateJobDto) {
    // Get recruiter's company
    const recruiter = await prisma.recruiterProfile.findUnique({
      where: { id: recruiterId },
      select: { companyId: true },
    });

    return prisma.job.create({
      data: {
        recruiterId,
        companyId: recruiter?.companyId,
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
      data: jobs.map(job => this.formatJobListing(job)),
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + jobs.length < total,
      },
    };
  }

  async getJobById(jobId: string, trackView = false) {
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
      data: jobs,
      meta: { total, limit, offset, hasMore: offset + jobs.length < total },
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

    return prisma.shortlist.update({
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
      data: shortlists,
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
      data: shortlists,
      meta: { total, limit, offset, hasMore: offset + shortlists.length < total },
    };
  }

  // ===== Match candidates to job =====

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
      select: { skillId: true, minScore: true, minLevel: true, required: true },
    });

    if (jobSkills.length === 0) {
      return {
        data: [],
        meta: { total: 0, limit, offset, hasMore: false },
        message: 'Add skills to the job to find matching candidates',
      };
    }

    const requiredSkillIds = jobSkills.filter(js => js.required).map(js => js.skillId);

    // Find candidates with matching skills
    const candidates = await prisma.candidateProfile.findMany({
      where: {
        candidateSkills: {
          some: {
            skillId: { in: jobSkills.map(js => js.skillId) },
            verified: true,
          },
        },
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        candidateSkills: {
          where: {
            skillId: { in: jobSkills.map(js => js.skillId) },
          },
          include: {
            skill: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      take: limit * 2, // Fetch more to filter
      skip: offset,
    });

    // Score candidates based on skill match
    type CandidateWithSkills = (typeof candidates)[0];
    const scoredCandidates = candidates.map((candidate: CandidateWithSkills) => {
      let matchScore = 0;
      let matchedSkills = 0;
      let missingRequired = 0;

      for (const jobSkill of jobSkills) {
        const candidateSkill = candidate.candidateSkills.find(
          cs => cs.skillId === jobSkill.skillId
        );

        if (candidateSkill) {
          matchedSkills++;
          // Use the skill score if available, otherwise default based on verification
          const skillScore = candidateSkill.score
            ? Number(candidateSkill.score)
            : candidateSkill.verified
              ? 70
              : 50;
          const scoreRatio = Math.min(skillScore / (jobSkill.minScore || 60), 1.5);
          matchScore += scoreRatio * (jobSkill.required ? 2 : 1);
        } else if (jobSkill.required) {
          missingRequired++;
        }
      }

      // Penalize missing required skills
      if (missingRequired > 0) {
        matchScore -= missingRequired * 2;
      }

      return {
        ...candidate,
        matchScore: Math.round(matchScore * 10) / 10,
        matchedSkillsCount: matchedSkills,
        totalRequiredSkills: requiredSkillIds.length,
        hasAllRequired: missingRequired === 0,
      };
    });

    // Sort by match score and filter to limit
    const sorted = scoredCandidates
      .filter(c => c.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    return {
      data: sorted,
      meta: {
        total: sorted.length,
        limit,
        offset,
        hasMore: candidates.length > limit,
      },
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

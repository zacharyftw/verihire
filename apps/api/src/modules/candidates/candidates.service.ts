import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { prisma, RemotePreference, JobSearchStatus, SkillLevel } from '@verihire/database';
import { StorageService } from '../storage/storage.service';
import { ResumeAnalysisService } from '../resume-analysis/resume-analysis.service';

// Allowed resume file types
const ALLOWED_RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_RESUME_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed portfolio file types
const ALLOWED_PORTFOLIO_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/zip',
];
const MAX_PORTFOLIO_SIZE = 50 * 1024 * 1024; // 50MB

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly resumeAnalysisService: ResumeAnalysisService
  ) {}
  async getProfile(candidateId: string) {
    const profile = await prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        candidateSkills: {
          include: {
            skill: {
              select: {
                id: true,
                name: true,
                slug: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
          orderBy: { skill: { name: 'asc' } },
        },
        certificates: {
          where: { revokedAt: null },
          include: {
            skill: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
          orderBy: { issuedAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            submissions: true,
            certificates: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    return profile;
  }

  async getProfileByUserId(userId: string) {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    return this.getProfile(profile.id);
  }

  async updateProfile(
    candidateId: string,
    data: {
      headline?: string;
      bio?: string;
      yearsExperience?: number;
      currentRole?: string;
      currentCompany?: string;
      locationCity?: string;
      locationCountry?: string;
      remotePreference?: RemotePreference;
      linkedinUrl?: string;
      githubUrl?: string;
      portfolioUrl?: string;
      jobSearchStatus?: JobSearchStatus;
      preferredSalaryMin?: number;
      preferredSalaryMax?: number;
      preferredSalaryCurrency?: string;
      portfolioPublic?: boolean;
      portfolioSlug?: string;
    }
  ) {
    // Check if portfolio slug is unique if provided
    if (data.portfolioSlug) {
      const existing = await prisma.candidateProfile.findFirst({
        where: {
          portfolioSlug: data.portfolioSlug,
          id: { not: candidateId },
        },
      });
      if (existing) {
        throw new ConflictException('Portfolio slug is already taken');
      }
    }

    return prisma.candidateProfile.update({
      where: { id: candidateId },
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  // Skills management
  async getSkills(candidateId: string) {
    return prisma.candidateSkill.findMany({
      where: { candidateId },
      include: {
        skill: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: [{ verified: 'desc' }, { skill: { name: 'asc' } }],
    });
  }

  async addSkill(candidateId: string, skillId: string, level?: SkillLevel) {
    // Check if skill exists
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
    });
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    // Check if already added
    const existing = await prisma.candidateSkill.findFirst({
      where: { candidateId, skillId },
    });
    if (existing) {
      throw new ConflictException('Skill already added to profile');
    }

    return prisma.candidateSkill.create({
      data: {
        candidateId,
        skillId,
        level,
      },
      include: {
        skill: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  async updateSkill(candidateId: string, skillId: string, level: SkillLevel) {
    const candidateSkill = await prisma.candidateSkill.findFirst({
      where: { candidateId, skillId },
    });

    if (!candidateSkill) {
      throw new NotFoundException('Skill not found in profile');
    }

    return prisma.candidateSkill.update({
      where: { id: candidateSkill.id },
      data: { level },
      include: {
        skill: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  async removeSkill(candidateId: string, skillId: string) {
    const candidateSkill = await prisma.candidateSkill.findFirst({
      where: { candidateId, skillId },
    });

    if (!candidateSkill) {
      throw new NotFoundException('Skill not found in profile');
    }

    await prisma.candidateSkill.delete({
      where: { id: candidateSkill.id },
    });

    return { success: true };
  }

  // Stats and achievements
  async getStats(candidateId: string) {
    const [submissions, certificates, verifiedSkills] = await Promise.all([
      prisma.submission.groupBy({
        by: ['status'],
        where: { candidateId },
        _count: true,
      }),
      prisma.certificate.count({
        where: { candidateId, revokedAt: null },
      }),
      prisma.candidateSkill.count({
        where: { candidateId, verified: true },
      }),
    ]);

    const submissionStats = submissions.reduce(
      (acc, s) => {
        acc[s.status] = s._count;
        acc.total += s._count;
        return acc;
      },
      { total: 0 } as Record<string, number>
    );

    // Get average score across all evaluated submissions
    const avgScore = await prisma.submission.aggregate({
      where: {
        candidateId,
        status: 'EVALUATED',
        finalScore: { not: null },
      },
      _avg: { finalScore: true },
    });

    return {
      submissions: submissionStats,
      certificates,
      verifiedSkills,
      averageScore: avgScore._avg.finalScore,
    };
  }

  // Public profile (portfolio)
  async getPublicProfile(slugOrId: string) {
    // Check if the input looks like a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

    const profile = await prisma.candidateProfile.findFirst({
      where: {
        OR: isUuid
          ? [{ portfolioSlug: slugOrId }, { id: slugOrId }]
          : [{ portfolioSlug: slugOrId }],
        portfolioPublic: true,
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
          where: { verified: true },
          include: {
            skill: {
              select: {
                id: true,
                name: true,
                slug: true,
                category: {
                  select: {
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
          orderBy: { score: 'desc' },
        },
        certificates: {
          where: { revokedAt: null },
          include: {
            skill: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
          orderBy: { issuedAt: 'desc' },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found or is private');
    }

    // Don't expose sensitive info in public profile
    return {
      id: profile.id,
      user: profile.user,
      headline: profile.headline,
      bio: profile.bio,
      yearsExperience: profile.yearsExperience,
      currentRole: profile.currentRole,
      locationCity: profile.locationCity,
      locationCountry: profile.locationCountry,
      linkedinUrl: profile.linkedinUrl,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl,
      skills: profile.candidateSkills,
      certificates: profile.certificates,
    };
  }

  // Search candidates (for recruiters)
  async searchCandidates(options: {
    skillIds?: string[];
    minExperience?: number;
    maxExperience?: number;
    locations?: string[];
    remotePreference?: RemotePreference;
    jobSearchStatus?: JobSearchStatus;
    verifiedOnly?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const {
      skillIds,
      minExperience,
      maxExperience,
      locations,
      remotePreference,
      jobSearchStatus,
      verifiedOnly = false,
    } = options;
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const where: Record<string, unknown> = {
      portfolioPublic: true,
    };

    if (minExperience !== undefined || maxExperience !== undefined) {
      where.yearsExperience = {};
      if (minExperience !== undefined)
        (where.yearsExperience as Record<string, number>).gte = minExperience;
      if (maxExperience !== undefined)
        (where.yearsExperience as Record<string, number>).lte = maxExperience;
    }

    if (locations && locations.length > 0) {
      where.OR = [{ locationCity: { in: locations } }, { locationCountry: { in: locations } }];
    }

    if (remotePreference) {
      where.remotePreference = remotePreference;
    }

    if (jobSearchStatus) {
      where.jobSearchStatus = jobSearchStatus;
    }

    if (skillIds && skillIds.length > 0) {
      where.candidateSkills = {
        some: {
          skillId: { in: skillIds },
          ...(verifiedOnly ? { verified: true } : {}),
        },
      };
    }

    const [candidates, total] = await Promise.all([
      prisma.candidateProfile.findMany({
        where,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
          candidateSkills: {
            where: verifiedOnly ? { verified: true } : {},
            include: {
              skill: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
            take: 5,
            orderBy: { score: 'desc' },
          },
          _count: {
            select: {
              certificates: true,
            },
          },
        },
        orderBy: [{ yearsExperience: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.candidateProfile.count({ where }),
    ]);

    return {
      data: candidates,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + candidates.length < total,
      },
    };
  }

  // =========================================================================
  // FILE UPLOADS
  // =========================================================================

  /**
   * Upload candidate resume
   */
  async uploadResume(
    candidateId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number }
  ): Promise<{ url: string; key: string }> {
    // Validate candidate exists
    const profile = await prisma.candidateProfile.findUnique({
      where: { id: candidateId },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    // Validate file type
    if (!ALLOWED_RESUME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type. Allowed types: PDF, DOC, DOCX`);
    }

    // Validate file size
    if (file.size > MAX_RESUME_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_RESUME_SIZE / (1024 * 1024)}MB`
      );
    }

    // Delete old resume if exists
    if (profile.resumeUrl) {
      try {
        const oldKey = profile.resumeUrl.split('/').slice(-3).join('/');
        await this.storageService.deleteFile(oldKey);
      } catch {
        // Ignore errors when deleting old file
      }
    }

    // Upload new resume
    const result = await this.storageService.uploadResume(
      candidateId,
      file.buffer,
      file.originalname
    );

    // Update candidate profile with new resume URL
    await prisma.candidateProfile.update({
      where: { id: candidateId },
      data: { resumeUrl: result.url },
    });

    // Trigger resume analysis async (fire and forget) - only for PDFs
    if (file.mimetype === 'application/pdf') {
      this.resumeAnalysisService
        .analyzeResume(file.buffer, file.mimetype)
        .then(async analysis => {
          await prisma.candidateProfile.update({
            where: { id: candidateId },
            data: {
              resumeText: analysis.resumeText,
              resumeSeniorityLevel: analysis.seniorityLevel,
              resumeDomains: analysis.domains,
              resumeYearsExp: analysis.totalYearsExp,
              yearsExperience: Math.round(analysis.totalYearsExp),
              resumeAnalyzedAt: new Date(),
            },
          });
          this.logger.log(
            `Resume analyzed for candidate ${candidateId}: ${analysis.seniorityLevel}, ${analysis.totalYearsExp}yr, domains: ${analysis.domains.join(', ')}`
          );
        })
        .catch(err =>
          this.logger.error(
            `Resume analysis failed for ${candidateId}: ${err.message || err}`,
            err.stack
          )
        );
    }

    return { url: result.url, key: result.key };
  }

  /**
   * Delete candidate resume
   */
  async deleteResume(candidateId: string): Promise<{ success: boolean }> {
    const profile = await prisma.candidateProfile.findUnique({
      where: { id: candidateId },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    if (!profile.resumeUrl) {
      throw new BadRequestException('No resume to delete');
    }

    // Extract key from URL
    const key = profile.resumeUrl.split('/').slice(-3).join('/');

    // Delete from storage
    await this.storageService.deleteFile(key);

    // Update profile
    await prisma.candidateProfile.update({
      where: { id: candidateId },
      data: { resumeUrl: null },
    });

    return { success: true };
  }

  /**
   * Upload portfolio file
   */
  async uploadPortfolioFile(
    candidateId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number }
  ): Promise<{ url: string; key: string; filename: string }> {
    // Validate candidate exists
    const profile = await prisma.candidateProfile.findUnique({
      where: { id: candidateId },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    // Validate file type
    if (!ALLOWED_PORTFOLIO_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: PDF, JPEG, PNG, GIF, WEBP, ZIP`
      );
    }

    // Validate file size
    if (file.size > MAX_PORTFOLIO_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_PORTFOLIO_SIZE / (1024 * 1024)}MB`
      );
    }

    // Upload portfolio file
    const result = await this.storageService.uploadPortfolioFile(
      candidateId,
      file.buffer,
      file.originalname
    );

    return {
      url: result.url,
      key: result.key,
      filename: file.originalname,
    };
  }

  /**
   * List portfolio files for a candidate
   */
  async listPortfolioFiles(
    candidateId: string
  ): Promise<Array<{ key: string; url: string; size: number }>> {
    // Validate candidate exists
    const profile = await prisma.candidateProfile.findUnique({
      where: { id: candidateId },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    const files = await this.storageService.listFiles(`candidates/${candidateId}/portfolio`);

    return files.map(f => ({
      key: f.key,
      url: this.storageService.getFileUrl(f.key),
      size: f.size,
    }));
  }

  /**
   * Delete portfolio file
   */
  async deletePortfolioFile(candidateId: string, fileKey: string): Promise<{ success: boolean }> {
    // Validate the file belongs to this candidate
    if (!fileKey.startsWith(`candidates/${candidateId}/portfolio/`)) {
      throw new BadRequestException('Invalid file key');
    }

    await this.storageService.deleteFile(fileKey);

    return { success: true };
  }

  async getResumeAnalysis(candidateId: string) {
    const profile = await prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      select: {
        resumeSeniorityLevel: true,
        resumeDomains: true,
        resumeYearsExp: true,
        resumeAnalyzedAt: true,
        resumeUrl: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    return {
      analyzed: !!profile.resumeAnalyzedAt,
      analyzedAt: profile.resumeAnalyzedAt,
      seniorityLevel: profile.resumeSeniorityLevel,
      domains: profile.resumeDomains,
      yearsExperience: profile.resumeYearsExp,
      hasResume: !!profile.resumeUrl,
    };
  }
}

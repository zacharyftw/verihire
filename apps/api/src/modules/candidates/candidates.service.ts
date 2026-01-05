import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma, RemotePreference, JobSearchStatus, SkillLevel } from '@verihire/database';

@Injectable()
export class CandidatesService {
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
}

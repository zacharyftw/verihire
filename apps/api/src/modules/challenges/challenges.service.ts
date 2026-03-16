import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, Prisma, ChallengeDifficulty, ChallengeType } from '@verihire/database';

@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);
  async findAll(options?: {
    skillId?: string;
    difficulty?: ChallengeDifficulty;
    type?: ChallengeType;
    limit?: number;
    offset?: number;
  }) {
    const skillId = options?.skillId;
    const difficulty = options?.difficulty;
    const type = options?.type;
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const where: any = {};

    if (skillId) where.skillId = skillId;
    if (difficulty) where.difficulty = difficulty;
    if (type) where.type = type;

    const [challenges, total] = await Promise.all([
      prisma.challenge.findMany({
        where,
        include: {
          skill: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: { submissions: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.challenge.count({ where }),
    ]);

    return {
      data: challenges,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + challenges.length < total,
      },
    };
  }

  async findById(id: string) {
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        skill: true,
        template: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    return challenge;
  }

  async update(
    id: string,
    data: {
      title?: string;
      description?: string;
      requirements?: any;
      referenceSolution?: string;
      solutionLanguage?: string;
      starterCode?: string;
      difficulty?: ChallengeDifficulty;
      type?: ChallengeType;
      timeLimitMinutes?: number;
    }
  ) {
    const challenge = await prisma.challenge.findUnique({ where: { id } });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // If the reference solution is being changed, invalidate cached test cases
    // so they are regenerated (and re-validated) on the next evaluation.
    const invalidateCache =
      data.referenceSolution !== undefined &&
      data.referenceSolution !== challenge.referenceSolution;

    const updated = await prisma.challenge.update({
      where: { id },
      data: {
        ...data,
        ...(invalidateCache ? { cachedTestCases: Prisma.DbNull } : {}),
      },
    });

    if (invalidateCache) {
      this.logger.log(
        `Invalidated cached test cases for challenge ${id} due to referenceSolution change`
      );
    }

    return updated;
  }

  async findForCandidate(challengeId: string, candidateId: string) {
    // Get challenge without revealing test cases
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        title: true,
        description: true,
        requirements: true,
        difficulty: true,
        type: true,
        timeLimitMinutes: true,
        starterCode: true,
        skill: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Check if candidate has an active submission
    const existingSubmission = await prisma.submission.findFirst({
      where: {
        challengeId,
        candidateId,
        status: { in: ['IN_PROGRESS', 'SUBMITTED', 'EVALUATING'] },
      },
    });

    return {
      ...challenge,
      hasActiveSubmission: !!existingSubmission,
      activeSubmissionId: existingSubmission?.id,
    };
  }

  async getTemplates(options?: {
    skillId?: string;
    difficulty?: ChallengeDifficulty;
    isActive?: boolean;
  }) {
    const { skillId, difficulty, isActive = true } = options || {};

    const where: any = { isActive };
    if (skillId) where.skillId = skillId;
    if (difficulty) where.difficulty = difficulty;

    return prisma.challengeTemplate.findMany({
      where,
      include: {
        skill: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: { challenges: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getTemplateById(id: string) {
    const template = await prisma.challengeTemplate.findUnique({
      where: { id },
      include: {
        skill: true,
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Challenge template not found');
    }

    return template;
  }

  async generateFromTemplate(
    templateId: string,
    customizations?: {
      difficulty?: ChallengeDifficulty;
      timeLimitMinutes?: number;
    }
  ) {
    const template = await this.getTemplateById(templateId);

    // In production, this would call OpenAI to generate unique challenge content
    // For now, we'll create a challenge based on the template directly
    const challenge = await prisma.challenge.create({
      data: {
        templateId: template.id,
        skillId: template.skillId,
        title: template.name,
        description: template.description || '',
        difficulty: customizations?.difficulty || template.difficulty,
        type: template.type,
        timeLimitMinutes: customizations?.timeLimitMinutes || template.timeLimitMinutes,
        evaluationCriteria: template.evaluationCriteria as any,
        starterCode: template.starterCode ? JSON.stringify(template.starterCode) : null,
        testCases: template.testCaseTemplate as any,
        generationModel: 'template-direct', // Would be 'gpt-4' etc in production
      },
    });

    return challenge;
  }

  async getChallengesBySkill(skillSlug: string) {
    const skill = await prisma.skill.findUnique({
      where: { slug: skillSlug },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    return prisma.challenge.findMany({
      where: { skillId: skill.id },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
      orderBy: [{ difficulty: 'asc' }, { createdAt: 'desc' }],
    });
  }

  private static readonly DIFFICULTY_ORDER: ChallengeDifficulty[] = [
    'BEGINNER',
    'INTERMEDIATE',
    'ADVANCED',
    'EXPERT',
  ];

  private getNextDifficulty(
    current: ChallengeDifficulty,
    direction: -1 | 0 | 1
  ): ChallengeDifficulty {
    const idx = ChallengesService.DIFFICULTY_ORDER.indexOf(current);
    const next = Math.max(
      0,
      Math.min(ChallengesService.DIFFICULTY_ORDER.length - 1, idx + direction)
    );
    return ChallengesService.DIFFICULTY_ORDER[next];
  }

  async getRecommendedChallenges(candidateId: string, limit = 5) {
    // IDs of challenges the candidate has already completed (EVALUATED)
    const completedSubmissions = await prisma.submission.findMany({
      where: { candidateId, status: 'EVALUATED' },
      select: { challengeId: true },
    });
    const completedIds = completedSubmissions.map(s => s.challengeId);

    // Most recent evaluated submission with its score and challenge metadata
    const latestSubmission = await prisma.submission.findFirst({
      where: { candidateId, status: 'EVALUATED' },
      orderBy: { updatedAt: 'desc' },
      select: {
        finalScore: true,
        challenge: {
          select: { difficulty: true, domainTag: true },
        },
      },
    });

    if (latestSubmission?.challenge?.difficulty) {
      const score = Number(latestSubmission.finalScore ?? 0);
      const { difficulty, domainTag } = latestSubmission.challenge;

      let direction: -1 | 0 | 1;
      if (score >= 80) direction = 1;
      else if (score >= 60) direction = 0;
      else direction = -1;

      const targetDifficulty = this.getNextDifficulty(difficulty as ChallengeDifficulty, direction);

      const where: Prisma.ChallengeWhereInput = {
        difficulty: targetDifficulty,
        id: { notIn: completedIds },
        ...(domainTag ? { domainTag } : {}),
      };

      const results = await prisma.challenge.findMany({
        where,
        include: {
          skill: { select: { id: true, name: true, slug: true } },
          _count: { select: { submissions: true } },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      if (results.length > 0) return results;
      // Fall through if no matches for domain+difficulty
    }

    // Fallback: recommend BEGINNER challenges matching resume domains
    const profile = await prisma.candidateProfile.findFirst({
      where: { id: candidateId },
      select: { resumeDomains: true },
    });

    const resumeDomains = profile?.resumeDomains ?? [];

    const where: Prisma.ChallengeWhereInput = {
      difficulty: 'BEGINNER',
      id: { notIn: completedIds },
      ...(resumeDomains.length > 0 ? { domainTag: { in: resumeDomains } } : {}),
    };

    return prisma.challenge.findMany({
      where,
      include: {
        skill: { select: { id: true, name: true, slug: true } },
        _count: { select: { submissions: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}

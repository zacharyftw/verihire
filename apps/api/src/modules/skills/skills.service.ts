import { Injectable } from '@nestjs/common';
import { prisma } from '@verihire/database';

@Injectable()
export class SkillsService {
  async findAll(options?: {
    categoryId?: string;
    search?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const { categoryId, search, isActive = true, limit = 50, offset = 0 } = options || {};

    const where: any = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              certificates: true,
              challengeTemplates: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.skill.count({ where }),
    ]);

    return {
      data: skills,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + skills.length < total,
      },
    };
  }

  async findBySlug(slug: string) {
    return prisma.skill.findUnique({
      where: { slug },
      include: {
        category: true,
        challengeTemplates: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            difficulty: true,
            type: true,
            timeLimitMinutes: true,
          },
        },
        _count: {
          select: {
            certificates: true,
            candidateSkills: { where: { verified: true } },
          },
        },
      },
    });
  }

  async findById(id: string) {
    return prisma.skill.findUnique({
      where: { id },
      include: {
        category: true,
        _count: {
          select: {
            certificates: true,
            candidateSkills: { where: { verified: true } },
          },
        },
      },
    });
  }

  async getCategories() {
    return prisma.skillCategory.findMany({
      include: {
        _count: {
          select: { skills: true },
        },
        children: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      where: {
        parentId: null, // Only top-level categories
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getCategoryBySlug(slug: string) {
    return prisma.skillCategory.findUnique({
      where: { slug },
      include: {
        skills: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
        children: {
          include: {
            skills: {
              where: { isActive: true },
              orderBy: { name: 'asc' },
            },
          },
        },
        parent: true,
      },
    });
  }

  async getPopularSkills(limit = 10) {
    return prisma.skill.findMany({
      where: { isActive: true },
      orderBy: { totalCertifications: 'desc' },
      take: limit,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  async getSkillStats(skillId: string) {
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      select: {
        id: true,
        name: true,
        totalCertifications: true,
        averageScore: true,
        passThreshold: true,
      },
    });

    if (!skill) return null;

    // Get score distribution
    const candidateSkills = await prisma.candidateSkill.findMany({
      where: {
        skillId,
        verified: true,
        score: { not: null },
      },
      select: { score: true },
    });

    const scores = candidateSkills.map(cs => cs.score?.toNumber() || 0).filter(s => s > 0);

    const distribution = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0,
    };

    scores.forEach(score => {
      if (score <= 20) distribution['0-20']++;
      else if (score <= 40) distribution['21-40']++;
      else if (score <= 60) distribution['41-60']++;
      else if (score <= 80) distribution['61-80']++;
      else distribution['81-100']++;
    });

    return {
      ...skill,
      totalVerified: scores.length,
      scoreDistribution: distribution,
      medianScore:
        scores.length > 0 ? scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] : null,
    };
  }
}

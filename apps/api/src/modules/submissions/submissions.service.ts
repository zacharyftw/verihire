import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma, SubmissionStatus } from '@verihire/database';
import { EvaluationsService } from '../evaluations/evaluations.service';

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(private readonly evaluationsService: EvaluationsService) {}
  async startSubmission(
    candidateId: string,
    challengeId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    // Check if challenge exists
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Check for existing active submission
    const existing = await prisma.submission.findFirst({
      where: {
        candidateId,
        challengeId,
        status: { in: ['IN_PROGRESS', 'SUBMITTED', 'EVALUATING'] },
      },
    });

    if (existing) {
      throw new BadRequestException('You already have an active submission for this challenge');
    }

    // Create new submission
    const submission = await prisma.submission.create({
      data: {
        challengeId,
        candidateId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        ipAddress,
        userAgent,
      },
      include: {
        challenge: {
          select: {
            id: true,
            title: true,
            description: true,
            requirements: true,
            starterCode: true,
            timeLimitMinutes: true,
            skill: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    // Update challenge attempt count
    await prisma.challenge.update({
      where: { id: challengeId },
      data: { timesAttempted: { increment: 1 } },
    });

    return submission;
  }

  async updateSubmission(
    submissionId: string,
    candidateId: string,
    data: { content?: string; language?: string }
  ) {
    const submission = await this.getSubmissionForCandidate(submissionId, candidateId);

    if (submission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Cannot update a submitted challenge');
    }

    // Check time limit
    if (submission.challenge.timeLimitMinutes && submission.startedAt) {
      const elapsedMinutes = (Date.now() - new Date(submission.startedAt).getTime()) / 60000;
      if (elapsedMinutes > submission.challenge.timeLimitMinutes) {
        throw new BadRequestException('Time limit exceeded');
      }
    }

    return prisma.submission.update({
      where: { id: submissionId },
      data: {
        content: data.content,
        language: data.language,
      },
    });
  }

  async submitForEvaluation(
    submissionId: string,
    candidateId: string,
    content: string,
    language?: string,
    files?: Array<{ name: string; content: string; type: string }>
  ) {
    const submission = await this.getSubmissionForCandidate(submissionId, candidateId);

    if (submission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Submission has already been submitted');
    }

    // Validate language for domain-specific challenges
    const challenge = submission.challenge as any;
    if (challenge.category === 'DOMAIN_SPECIFIC' && challenge.supportedLanguages && language) {
      const allowed: string[] = Array.isArray(challenge.supportedLanguages)
        ? challenge.supportedLanguages
        : [];
      if (allowed.length > 0 && !allowed.includes(language.toLowerCase())) {
        throw new BadRequestException(
          `This challenge requires one of: ${allowed.join(', ')}. Got: ${language}`
        );
      }
    }

    const now = new Date();
    const timeSpent = submission.startedAt
      ? Math.round((now.getTime() - new Date(submission.startedAt).getTime()) / 1000)
      : null;

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        content,
        language,
        status: 'SUBMITTED',
        submittedAt: now,
        timeSpentSeconds: timeSpent,
        files: files ? (files as any) : undefined,
      },
      include: {
        challenge: {
          include: {
            skill: true,
          },
        },
      },
    });

    // Run evaluation asynchronously (fire-and-forget)
    this.evaluationsService.evaluateSubmission(updated.id).catch(async err => {
      this.logger.error(`Evaluation failed for submission ${updated.id}: ${err.message}`);
      // Reset status so candidate can retry
      await prisma.submission
        .update({
          where: { id: updated.id },
          data: { status: 'SUBMITTED' },
        })
        .catch(() => {}); // ignore if this fails too
    });

    return updated;
  }

  async getSubmissionForCandidate(submissionId: string, candidateId: string) {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        challenge: {
          select: {
            id: true,
            title: true,
            timeLimitMinutes: true,
            skill: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        evaluations: true,
        reviews: {
          where: { status: 'SUBMITTED' },
          select: {
            overallScore: true,
            strengths: true,
            areasForImprovement: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.candidateId !== candidateId) {
      throw new ForbiddenException('You do not have access to this submission');
    }

    return submission;
  }

  async getCandidateSubmissions(
    candidateId: string,
    options?: {
      status?: SubmissionStatus;
      skillId?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const status = options?.status;
    const skillId = options?.skillId;
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const where: any = { candidateId };
    if (status) where.status = status;
    if (skillId) where.challenge = { skillId };

    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        include: {
          challenge: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              skill: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.submission.count({ where }),
    ]);

    return {
      data: submissions,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + submissions.length < total,
      },
    };
  }

  async getSubmissionWithResults(submissionId: string, candidateId: string) {
    const submission = await this.getSubmissionForCandidate(submissionId, candidateId);

    if (submission.status === 'IN_PROGRESS') {
      return {
        ...submission,
        message: 'Submission is still in progress',
      };
    }

    if (submission.status === 'SUBMITTED' || submission.status === 'EVALUATING') {
      return {
        ...submission,
        message: 'Submission is being evaluated',
      };
    }

    // For EVALUATED status, include full results
    return submission;
  }

  async getActiveSubmission(candidateId: string, challengeId: string) {
    return prisma.submission.findFirst({
      where: {
        candidateId,
        challengeId,
        status: 'IN_PROGRESS',
      },
      include: {
        challenge: {
          select: {
            id: true,
            title: true,
            timeLimitMinutes: true,
          },
        },
      },
    });
  }

  // Admin/System methods
  async getAllSubmissions(options?: {
    status?: SubmissionStatus;
    challengeId?: string;
    limit?: number;
    offset?: number;
  }) {
    const status = options?.status;
    const challengeId = options?.challengeId;
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: any = {};
    if (status) where.status = status;
    if (challengeId) where.challengeId = challengeId;

    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        include: {
          candidate: {
            select: {
              id: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          challenge: {
            select: {
              id: true,
              title: true,
              difficulty: true,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.submission.count({ where }),
    ]);

    return {
      data: submissions,
      meta: { total, limit, offset, hasMore: offset + submissions.length < total },
    };
  }
}

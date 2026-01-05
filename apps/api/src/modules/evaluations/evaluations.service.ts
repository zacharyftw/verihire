import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, Prisma } from '@verihire/database';
import { AiEvaluationService, EvaluationResult } from './ai-evaluation.service';
import { CertificateService, GeneratedCertificate } from './certificate.service';

export interface EvaluationWithCertificate {
  evaluation: {
    id: string;
    overallScore: number;
    criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }>;
    feedback: string;
    suggestions: string[];
    confidence: number;
    processingTimeMs: number;
  };
  certificate: GeneratedCertificate | null;
  passed: boolean;
}

@Injectable()
export class EvaluationsService {
  private readonly logger = new Logger(EvaluationsService.name);

  constructor(
    private aiEvaluationService: AiEvaluationService,
    private certificateService: CertificateService
  ) {}

  /**
   * Evaluate a submission - main entry point
   */
  async evaluateSubmission(submissionId: string): Promise<EvaluationWithCertificate> {
    const startTime = Date.now();

    // Get submission with challenge details
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        challenge: {
          include: {
            skill: true,
          },
        },
        candidate: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot evaluate submission with status: ${submission.status}`);
    }

    // Mark as evaluating
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'EVALUATING' },
    });

    try {
      // Get evaluation criteria
      const criteria = submission.challenge.evaluationCriteria
        ? (submission.challenge.evaluationCriteria as any[]).map((c: any) => ({
            name: c.name,
            weight: c.weight,
            description: c.description,
            maxScore: c.maxScore || 100,
          }))
        : this.aiEvaluationService.getDefaultCriteria(
            (submission.challenge.type as
              | 'CODING'
              | 'WRITTEN'
              | 'MULTIPLE_CHOICE'
              | 'SYSTEM_DESIGN') || 'CODING'
          );

      // Parse requirements
      const requirements = Array.isArray(submission.challenge.requirements)
        ? submission.challenge.requirements
        : typeof submission.challenge.requirements === 'object'
          ? Object.values(submission.challenge.requirements as Record<string, string>)
          : [];

      // Parse test cases
      const testCases = submission.challenge.testCases as
        | Array<{ input: string; expectedOutput: string }>
        | undefined;

      // Perform AI evaluation
      let evaluationResult: EvaluationResult;

      // DESIGN type is treated like written/system design, CODING and MIXED like coding
      if (submission.challenge.type === 'WRITTEN' || submission.challenge.type === 'DESIGN') {
        evaluationResult = await this.aiEvaluationService.evaluateWrittenResponse({
          response: submission.content || '',
          challengeTitle: submission.challenge.title,
          challengeDescription: submission.challenge.description,
          requirements: requirements as string[],
          evaluationCriteria: criteria,
        });
      } else {
        evaluationResult = await this.aiEvaluationService.evaluateCode({
          code: submission.content || '',
          language: submission.language || 'javascript',
          challengeTitle: submission.challenge.title,
          challengeDescription: submission.challenge.description,
          requirements: requirements as string[],
          evaluationCriteria: criteria,
          testCases,
        });
      }

      const processingTimeMs = Date.now() - startTime;

      // Save evaluation to database
      const evaluation = await prisma.evaluation.create({
        data: {
          submissionId,
          overallScore: evaluationResult.overallScore,
          criteriaScores: evaluationResult.criteriaScores as any,
          staticAnalysis: evaluationResult.staticAnalysis
            ? (evaluationResult.staticAnalysis as any)
            : Prisma.JsonNull,
          testResults: evaluationResult.testResults
            ? (evaluationResult.testResults as any)
            : Prisma.JsonNull,
          feedback: evaluationResult.feedback,
          suggestions: evaluationResult.suggestions,
          confidence: evaluationResult.confidence,
          processingTimeMs,
          modelVersions: {
            aiModel: 'gpt-4o',
            evaluationVersion: '1.0.0',
          },
        },
      });

      // Update submission status and score
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: 'EVALUATED',
          aiScore: evaluationResult.overallScore,
        },
      });

      // Update challenge stats
      await this.updateChallengeStats(submission.challengeId, evaluationResult.overallScore);

      // Generate certificate if passing
      const passed = this.certificateService.isPassing(evaluationResult.overallScore);
      let certificate: GeneratedCertificate | null = null;

      if (passed && submission.challenge.skillId) {
        certificate = await this.certificateService.generateCertificate({
          candidateId: submission.candidateId,
          skillId: submission.challenge.skillId,
          challengeId: submission.challengeId,
          submissionId: submission.id,
          finalScore: evaluationResult.overallScore,
          aiScore: evaluationResult.overallScore,
          criteriaScores: evaluationResult.criteriaScores,
          confidence: evaluationResult.confidence,
        });
      }

      this.logger.log(
        `Evaluation complete for submission ${submissionId}: score=${evaluationResult.overallScore}, passed=${passed}`
      );

      return {
        evaluation: {
          id: evaluation.id,
          overallScore: evaluationResult.overallScore,
          criteriaScores: evaluationResult.criteriaScores,
          feedback: evaluationResult.feedback,
          suggestions: evaluationResult.suggestions,
          confidence: evaluationResult.confidence,
          processingTimeMs,
        },
        certificate,
        passed,
      };
    } catch (error) {
      // Revert status on failure
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: 'SUBMITTED' },
      });
      throw error;
    }
  }

  /**
   * Get evaluation for a submission
   */
  async getEvaluation(submissionId: string) {
    const evaluation = await prisma.evaluation.findFirst({
      where: { submissionId },
      orderBy: { createdAt: 'desc' },
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found for this submission');
    }

    return {
      id: evaluation.id,
      overallScore: Number(evaluation.overallScore),
      criteriaScores: evaluation.criteriaScores,
      staticAnalysis: evaluation.staticAnalysis,
      testResults: evaluation.testResults,
      feedback: evaluation.feedback,
      suggestions: evaluation.suggestions,
      confidence: evaluation.confidence ? Number(evaluation.confidence) : null,
      processingTimeMs: evaluation.processingTimeMs,
      createdAt: evaluation.createdAt,
    };
  }

  /**
   * Get all evaluations for admin/analytics
   */
  async getEvaluations(options?: {
    limit?: number;
    offset?: number;
    minScore?: number;
    maxScore?: number;
  }) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: any = {};
    if (options?.minScore !== undefined) {
      where.overallScore = { ...where.overallScore, gte: options.minScore };
    }
    if (options?.maxScore !== undefined) {
      where.overallScore = { ...where.overallScore, lte: options.maxScore };
    }

    const [evaluations, total] = await Promise.all([
      prisma.evaluation.findMany({
        where,
        include: {
          submission: {
            include: {
              challenge: {
                select: {
                  id: true,
                  title: true,
                  difficulty: true,
                },
              },
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
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.evaluation.count({ where }),
    ]);

    return {
      data: evaluations.map(e => ({
        id: e.id,
        overallScore: Number(e.overallScore),
        confidence: e.confidence ? Number(e.confidence) : null,
        processingTimeMs: e.processingTimeMs,
        createdAt: e.createdAt,
        submission: {
          id: e.submission.id,
          challenge: e.submission.challenge,
          candidate: {
            id: e.submission.candidate.id,
            name: `${e.submission.candidate.user.firstName} ${e.submission.candidate.user.lastName}`,
          },
        },
      })),
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + evaluations.length < total,
      },
    };
  }

  /**
   * Get evaluation statistics
   */
  async getEvaluationStats() {
    const [totalEvaluations, passedEvaluations, avgScore, avgProcessingTime] = await Promise.all([
      prisma.evaluation.count(),
      prisma.evaluation.count({
        where: { overallScore: { gte: 70 } },
      }),
      prisma.evaluation.aggregate({
        _avg: { overallScore: true },
      }),
      prisma.evaluation.aggregate({
        _avg: { processingTimeMs: true },
      }),
    ]);

    const passRate = totalEvaluations > 0 ? (passedEvaluations / totalEvaluations) * 100 : 0;

    // Get score distribution
    const scoreDistribution = await this.getScoreDistribution();

    return {
      totalEvaluations,
      passedEvaluations,
      failedEvaluations: totalEvaluations - passedEvaluations,
      passRate: Math.round(passRate * 100) / 100,
      averageScore: avgScore._avg.overallScore
        ? Math.round(Number(avgScore._avg.overallScore) * 100) / 100
        : 0,
      averageProcessingTimeMs: avgProcessingTime._avg.processingTimeMs
        ? Math.round(Number(avgProcessingTime._avg.processingTimeMs))
        : 0,
      scoreDistribution,
    };
  }

  /**
   * Re-evaluate a submission (admin function)
   */
  async reEvaluate(submissionId: string): Promise<EvaluationWithCertificate> {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Reset status to allow re-evaluation
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'SUBMITTED' },
    });

    return this.evaluateSubmission(submissionId);
  }

  /**
   * Process pending submissions (batch job)
   */
  async processPendingSubmissions(limit = 10): Promise<number> {
    const pending = await prisma.submission.findMany({
      where: { status: 'SUBMITTED' },
      orderBy: { submittedAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    let processed = 0;
    for (const submission of pending) {
      try {
        await this.evaluateSubmission(submission.id);
        processed++;
      } catch (error) {
        this.logger.error(`Failed to evaluate submission ${submission.id}: ${error}`);
      }
    }

    this.logger.log(`Processed ${processed}/${pending.length} pending submissions`);
    return processed;
  }

  private async updateChallengeStats(challengeId: string, score: number) {
    // Get current stats
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: {
        averageScore: true,
        timesAttempted: true,
      },
    });

    if (!challenge) return;

    // Calculate new average
    const currentAvg = challenge.averageScore ? Number(challenge.averageScore) : 0;
    const attempts = challenge.timesAttempted || 1;
    const newAvg = (currentAvg * (attempts - 1) + score) / attempts;

    await prisma.challenge.update({
      where: { id: challengeId },
      data: { averageScore: newAvg },
    });
  }

  private async getScoreDistribution() {
    // Get counts for score ranges
    const ranges = [
      { label: '90-100', min: 90, max: 100 },
      { label: '80-89', min: 80, max: 89 },
      { label: '70-79', min: 70, max: 79 },
      { label: '60-69', min: 60, max: 69 },
      { label: '50-59', min: 50, max: 59 },
      { label: '0-49', min: 0, max: 49 },
    ];

    const distribution = await Promise.all(
      ranges.map(async range => {
        const count = await prisma.evaluation.count({
          where: {
            overallScore: {
              gte: range.min,
              lte: range.max,
            },
          },
        });
        return { range: range.label, count };
      })
    );

    return distribution;
  }
}

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, ReviewStatus, ConfidenceLevel } from '@verihire/database';
import {
  AssignReviewersDto,
  SubmitReviewDto,
  AggregatedScoreDto,
  ReviewSubmissionResponseDto,
} from './dto';
import { getRubricForChallengeType } from './rubrics';
import { ConflictDetectionService } from './conflict-detection.service';
import { ReviewQualityService } from './review-quality.service';
import { ReputationService } from './reputation.service';
import { ScoreAggregationService } from './score-aggregation.service';

interface RankedReviewer {
  id: string;
  candidateId: string;
  score: number;
  reputationScore: number;
}

interface ReviewAssignmentResult {
  assignmentId: string;
  reviewerId: string;
  submissionId: string;
  deadline: Date;
  weight: number;
  status: ReviewStatus;
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  // Configuration
  private readonly defaultReviewDeadlineDays = 3;
  private readonly minReviewerReputation = 30;
  private readonly maxActiveReviewsPerReviewer = 5;

  constructor(
    private readonly conflictDetection: ConflictDetectionService,
    private readonly reviewQuality: ReviewQualityService,
    private readonly reputation: ReputationService,
    private readonly scoreAggregation: ScoreAggregationService
  ) {}

  /**
   * Assign reviewers to a submission using the assignment algorithm
   */
  async assignReviewers(dto: AssignReviewersDto): Promise<ReviewAssignmentResult[]> {
    const { submissionId, numReviewers = 3 } = dto;

    // Get submission with challenge details
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        challenge: {
          include: { skill: true },
        },
        candidate: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.status !== 'EVALUATED') {
      throw new BadRequestException('Submission must be evaluated by AI before peer review');
    }

    // Check if reviews already assigned
    const existingReviews = await prisma.review.findMany({
      where: { submissionId },
    });

    if (existingReviews.length > 0) {
      throw new BadRequestException('Reviewers already assigned for this submission');
    }

    // Get eligible reviewers
    const eligibleReviewers = await this.getEligibleReviewers(
      submission.challenge?.skillId || null,
      submission.candidateId
    );

    if (eligibleReviewers.length < numReviewers) {
      this.logger.warn(
        `Not enough eligible reviewers. Found ${eligibleReviewers.length}, need ${numReviewers}`
      );
    }

    // Filter out conflicts
    const cleanReviewers = await this.conflictDetection.filterConflicts(
      eligibleReviewers.map(r => r.id),
      submission.candidateId,
      submissionId
    );

    // Rank reviewers
    const rankedReviewers = await this.rankReviewers(
      cleanReviewers,
      submission.challenge?.skillId || null
    );

    // Select top N with workload balancing
    const selectedReviewers = await this.selectWithWorkloadBalance(rankedReviewers, numReviewers);

    // Create assignments
    const deadline = this.calculateDeadline();
    const assignments: ReviewAssignmentResult[] = [];

    for (const reviewer of selectedReviewers) {
      const review = await prisma.review.create({
        data: {
          submissionId,
          reviewerId: reviewer.candidateId,
          deadline,
          status: 'ASSIGNED',
        },
      });

      assignments.push({
        assignmentId: review.id,
        reviewerId: reviewer.candidateId,
        submissionId,
        deadline,
        weight: reviewer.reputationScore / 100,
        status: 'ASSIGNED' as ReviewStatus,
      });

      // Send email notification to reviewer
      try {
        const reviewerUser = await prisma.user.findUnique({
          where: { id: reviewer.candidateId },
        });

        if (reviewerUser?.email) {
          // email removed
        }
      } catch (error) {
        this.logger.warn(`Failed to send review assignment email: ${error}`);
      }
    }

    this.logger.log(`Assigned ${assignments.length} reviewers to submission ${submissionId}`);

    return assignments;
  }

  /**
   * Get submissions pending review for a reviewer
   */
  async getPendingReviewsForReviewer(
    reviewerId: string,
    options?: { skillId?: string; limit?: number; offset?: number }
  ) {
    const { skillId, limit = 20, offset = 0 } = options || {};

    const where: any = {
      reviewerId,
      status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
    };

    if (skillId) {
      where.submission = {
        challenge: { skillId },
      };
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          submission: {
            include: {
              challenge: {
                include: { skill: true },
              },
            },
          },
        },
        orderBy: { deadline: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.review.count({ where }),
    ]);

    return {
      items: reviews.map(r => ({
        submissionId: r.submissionId,
        challengeTitle: r.submission.challenge?.title || 'Unknown',
        challengeType: r.submission.challenge?.type || 'CODING',
        skillName: r.submission.challenge?.skill?.name || 'Unknown',
        submittedAt: r.submission.submittedAt,
        deadline: r.deadline,
        assignmentId: r.id,
        status: r.status,
      })),
      meta: { total, limit, offset, hasMore: offset + reviews.length < total },
    };
  }

  /**
   * Get a submission for review with rubric
   */
  async getSubmissionForReview(reviewId: string, reviewerId: string) {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        submission: {
          include: {
            challenge: {
              include: {
                skill: true,
                template: true,
              },
            },
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review assignment not found');
    }

    if (review.reviewerId !== reviewerId) {
      throw new BadRequestException('You are not assigned to this review');
    }

    if (review.status === 'SUBMITTED' || review.status === 'VALIDATED') {
      throw new BadRequestException('This review has already been submitted');
    }

    // Get rubric for challenge type
    const challengeType = (review.submission.challenge?.type || 'CODING') as
      | 'CODING'
      | 'WRITTEN'
      | 'DESIGN'
      | 'MIXED';
    const rubric = getRubricForChallengeType(challengeType);

    // Mark as in progress if not already
    if (review.status === 'ASSIGNED') {
      await prisma.review.update({
        where: { id: reviewId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return {
      reviewId: review.id,
      submission: {
        id: review.submission.id,
        content: review.submission.content,
        language: review.submission.language,
        files: review.submission.files,
      },
      challenge: {
        id: review.submission.challenge?.id,
        title: review.submission.challenge?.title,
        description: review.submission.challenge?.description,
        requirements: review.submission.challenge?.requirements,
        type: review.submission.challenge?.type,
        skill: review.submission.challenge?.skill,
      },
      rubric,
      deadline: review.deadline,
      assignedAt: review.assignedAt,
    };
  }

  /**
   * Submit a completed review
   */
  async submitReview(
    reviewId: string,
    reviewerId: string,
    dto: SubmitReviewDto
  ): Promise<ReviewSubmissionResponseDto> {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        submission: {
          include: {
            challenge: true,
          },
        },
        reviewer: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Review assignment not found');
    }

    if (review.reviewerId !== reviewerId) {
      throw new BadRequestException('You are not assigned to this review');
    }

    if (review.status === 'SUBMITTED' || review.status === 'VALIDATED') {
      throw new BadRequestException('This review has already been submitted');
    }

    // Calculate time spent
    const timeSpentSeconds = Math.round(
      (Date.now() - new Date(review.assignedAt).getTime()) / 1000
    );

    // Analyze review quality
    const qualityResult = await this.reviewQuality.analyzeQuality({
      reviewId,
      reviewerId,
      criteriaScores: dto.criteriaScores,
      overallScore: dto.overallScore,
      strengths: dto.strengths,
      areasForImprovement: dto.areasForImprovement,
      suggestions: dto.suggestions,
      submissionContent: review.submission.content || '',
      submissionType: review.submission.challenge?.type || 'CODING',
      timeSpentSeconds,
      expectedTimeSeconds: 600, // 10 minutes expected
      reviewerAverageScore: review.reviewer?.averageScore
        ? Number(review.reviewer.averageScore)
        : undefined,
    });

    // Update reviewer reputation
    const reputationDelta = await this.reputation.updateAfterReview(
      reviewerId,
      qualityResult.overallQuality,
      qualityResult.biasAnalysis.biasDetected
    );

    // Determine review status based on quality
    const reviewStatus = qualityResult.isValid ? 'SUBMITTED' : 'REJECTED';

    // Save the review
    await prisma.review.update({
      where: { id: reviewId },
      data: {
        criteriaScores: dto.criteriaScores as any,
        overallScore: dto.overallScore,
        strengths: dto.strengths,
        areasForImprovement: dto.areasForImprovement,
        suggestions: dto.suggestions,
        confidenceLevel: dto.confidenceLevel as ConfidenceLevel,
        timeSpentSeconds,
        submittedAt: new Date(),
        status: reviewStatus,
        qualityScore: qualityResult.overallQuality * 100,
        effortScore: qualityResult.metrics.effortScore * 100,
        specificityScore: qualityResult.metrics.specificityScore * 100,
        biasDetected: qualityResult.biasAnalysis.biasDetected,
        biasType: qualityResult.biasAnalysis.biasType,
        reputationDelta: reputationDelta,
      },
    });

    // Check if all reviews are complete and trigger aggregation
    await this.checkAndTriggerAggregation(review.submissionId);

    // Send notification to candidate about completed review
    try {
      const candidate = await prisma.user.findUnique({
        where: { id: review.submission.candidateId },
      });

      if (candidate?.email && reviewStatus === 'SUBMITTED') {
        // email notifications removed
      }
    } catch (error) {
      this.logger.warn(`Failed to send review completion email: ${error}`);
    }

    return {
      reviewId,
      qualityScore: qualityResult.overallQuality,
      qualityMetrics: qualityResult.metrics,
      biasAnalysis: qualityResult.biasAnalysis,
      isValid: qualityResult.isValid,
      reputationDelta,
      feedbackForReviewer: qualityResult.feedbackForReviewer,
    };
  }

  /**
   * Get aggregated score for a submission
   */
  async getAggregatedScore(submissionId: string): Promise<AggregatedScoreDto> {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        evaluations: {
          orderBy: { createdAt: 'desc' },
        },
        reviews: {
          where: { status: { in: ['SUBMITTED', 'VALIDATED'] } },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const aiEvaluation = submission.evaluations[0];
    const validReviews = submission.reviews.filter(
      r => r.qualityScore && Number(r.qualityScore) >= 60
    );

    return this.scoreAggregation.aggregate(
      submissionId,
      aiEvaluation
        ? {
            score: Number(aiEvaluation.overallScore),
            confidence: aiEvaluation.confidence ? Number(aiEvaluation.confidence) : 0.8,
          }
        : null,
      validReviews.map(r => ({
        reviewId: r.id,
        reviewerId: r.reviewerId,
        score: Number(r.overallScore),
        qualityScore: Number(r.qualityScore),
        weight: 1, // Will be calculated based on reputation
      }))
    );
  }

  /**
   * Get reviewer statistics
   */
  async getReviewerStats(reviewerId: string) {
    const reviewer = await prisma.candidateProfile.findUnique({
      where: { id: reviewerId },
      include: {
        reviewsGiven: {
          where: { status: { in: ['SUBMITTED', 'VALIDATED'] } },
        },
      },
    });

    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    const reviews = reviewer.reviewsGiven;
    const totalReviews = reviews.length;

    const avgQualityScore =
      totalReviews > 0
        ? reviews.reduce((sum, r) => sum + (r.qualityScore ? Number(r.qualityScore) : 0), 0) /
          totalReviews
        : 0;

    const avgResponseTime =
      totalReviews > 0
        ? reviews.reduce((sum, r) => {
            if (r.submittedAt && r.assignedAt) {
              return sum + (new Date(r.submittedAt).getTime() - new Date(r.assignedAt).getTime());
            }
            return sum;
          }, 0) /
          totalReviews /
          3600000 // Convert to hours
        : 0;

    const biasFlags = reviews.filter(r => r.biasDetected).length;

    return {
      reviewerId,
      totalReviews,
      averageQualityScore: avgQualityScore,
      reputationScore: Number(reviewer.reputationScore),
      averageResponseTimeHours: avgResponseTime,
      biasFlags,
    };
  }

  // ============ Private Helper Methods ============

  private async getEligibleReviewers(skillId: string | null, excludeCandidateId: string) {
    const where: any = {
      id: { not: excludeCandidateId },
      reputationScore: { gte: this.minReviewerReputation },
    };

    // If skill specified, prefer reviewers with that skill
    if (skillId) {
      where.candidateSkills = {
        some: {
          skillId,
          verified: true,
        },
      };
    }

    return prisma.candidateProfile.findMany({
      where,
      select: {
        id: true,
        userId: true,
        reputationScore: true,
        candidateSkills: {
          where: skillId ? { skillId } : undefined,
          select: {
            score: true,
            verified: true,
          },
        },
        reviewsGiven: {
          where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
          select: { id: true },
        },
      },
      orderBy: { reputationScore: 'desc' },
      take: 50, // Get more than needed for filtering
    });
  }

  private async rankReviewers(
    reviewerIds: string[],
    skillId: string | null
  ): Promise<RankedReviewer[]> {
    const reviewers = await prisma.candidateProfile.findMany({
      where: { id: { in: reviewerIds } },
      include: {
        candidateSkills: skillId
          ? {
              where: { skillId },
            }
          : undefined,
        reviewsGiven: {
          where: { status: { in: ['SUBMITTED', 'VALIDATED'] } },
          take: 20,
          orderBy: { submittedAt: 'desc' },
        },
      },
    });

    return reviewers
      .map(reviewer => {
        let score = 0;

        // Skill expertise match (40%)
        const skillMatch = reviewer.candidateSkills?.[0];
        if (skillMatch && skillMatch.verified) {
          score += 0.4 * Math.min(Number(skillMatch.score || 0) / 100, 1);
        }

        // Reputation score (30%)
        score += 0.3 * (Number(reviewer.reputationScore) / 100);

        // Review quality history (20%)
        const recentReviews = reviewer.reviewsGiven;
        if (recentReviews.length > 0) {
          const avgQuality =
            recentReviews.reduce(
              (sum, r) => sum + (r.qualityScore ? Number(r.qualityScore) : 50),
              0
            ) / recentReviews.length;
          score += 0.2 * (avgQuality / 100);
        } else {
          score += 0.2 * 0.5; // Default for new reviewers
        }

        // Response time factor (10%)
        if (recentReviews.length > 0) {
          const onTimeCount = recentReviews.filter(r => {
            if (r.submittedAt && r.deadline) {
              return new Date(r.submittedAt) <= new Date(r.deadline);
            }
            return true;
          }).length;
          score += 0.1 * (onTimeCount / recentReviews.length);
        } else {
          score += 0.1 * 0.7; // Default
        }

        return {
          id: reviewer.userId,
          candidateId: reviewer.id,
          score,
          reputationScore: Number(reviewer.reputationScore),
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private async selectWithWorkloadBalance(
    rankedReviewers: RankedReviewer[],
    count: number
  ): Promise<RankedReviewer[]> {
    const selected: RankedReviewer[] = [];

    for (const reviewer of rankedReviewers) {
      if (selected.length >= count) break;

      // Check current workload
      const activeReviews = await prisma.review.count({
        where: {
          reviewerId: reviewer.candidateId,
          status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        },
      });

      if (activeReviews < this.maxActiveReviewsPerReviewer) {
        selected.push(reviewer);
      }
    }

    return selected;
  }

  private calculateDeadline(): Date {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + this.defaultReviewDeadlineDays);
    return deadline;
  }

  private async checkAndTriggerAggregation(submissionId: string) {
    const reviews = await prisma.review.findMany({
      where: { submissionId },
    });

    const allCompleted = reviews.every(r =>
      ['SUBMITTED', 'VALIDATED', 'REJECTED'].includes(r.status)
    );

    if (allCompleted && reviews.length > 0) {
      // Calculate aggregated peer score
      const aggregated = await this.getAggregatedScore(submissionId);

      // Fetch the submission to get the original aiScore
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        select: { aiScore: true, candidateId: true },
      });

      const aiScore = submission?.aiScore ? Number(submission.aiScore) : null;
      const peerScore = aggregated.peerScore;

      // Blend: aiScore * 0.7 + peerScore * 0.3 when both exist.
      // Peer review is an optional enhancement — it refines the score
      // but does NOT gate or revoke certificates (those use aiScore).
      let finalScore: number;
      if (aiScore !== null && peerScore !== null) {
        finalScore = Math.round((aiScore * 0.7 + peerScore * 0.3) * 100) / 100;
      } else if (aiScore !== null) {
        finalScore = aiScore;
      } else if (peerScore !== null) {
        finalScore = peerScore;
      } else {
        finalScore = 0;
      }

      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          peerScore: peerScore ?? null,
          finalScore,
        },
      });

      this.logger.log(
        `Peer review aggregated for submission ${submissionId}: ` +
          `aiScore=${aiScore}, peerScore=${peerScore}, finalScore=${finalScore} ` +
          `(non-blocking — certificates and domain scores use aiScore)`
      );
    }
  }
}

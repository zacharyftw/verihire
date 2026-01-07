import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@verihire/database';
import { ReviewAnomalyDto, AnomalyDetectionResponseDto } from './dto';

interface ReviewPattern {
  reviewerId: string;
  reviewId: string;
  submissionId: string;
  candidateId: string;
  score: number;
  timeSpentSeconds: number | null;
  submittedAt: Date | null;
  feedbackLength: number;
}

interface CollusionRing {
  participants: string[];
  confidence: number;
  reviewsInvolved: string[];
  pattern: string;
}

/**
 * Service for detecting anomalies and potential collusion in peer reviews.
 * Identifies patterns like rubber-stamping, reciprocal scoring, and coordinated behavior.
 */
@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  private readonly mlServiceUrl: string;
  private readonly mlServiceEnabled: boolean;

  // Detection thresholds
  private readonly rubberStampThreshold = 0.85; // Score similarity
  private readonly minTimeThreshold = 60; // Minimum review time in seconds
  private readonly copyPasteSimilarityThreshold = 0.8;
  private readonly reciprocalWindowDays = 30;
  private readonly collusionMinParticipants = 3;
  private readonly collusionMinInteractions = 2;

  constructor(private configService: ConfigService) {
    this.mlServiceUrl =
      this.configService.get<string>('mlService.baseUrl') || 'http://localhost:4200';
    this.mlServiceEnabled = this.configService.get<boolean>('mlService.enabled') ?? true;
  }

  /**
   * Run comprehensive anomaly detection on recent reviews
   */
  async detectAnomalies(options?: {
    windowDays?: number;
    submissionIds?: string[];
    reviewerIds?: string[];
  }): Promise<AnomalyDetectionResponseDto> {
    const startTime = Date.now();
    const { windowDays = 30, submissionIds, reviewerIds } = options || {};

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    // Build query
    const where: any = {
      submittedAt: { gte: cutoffDate },
      status: { in: ['SUBMITTED', 'VALIDATED'] },
    };

    if (submissionIds?.length) {
      where.submissionId = { in: submissionIds };
    }
    if (reviewerIds?.length) {
      where.reviewerId = { in: reviewerIds };
    }

    // Fetch reviews with related data
    const reviews = await prisma.review.findMany({
      where,
      include: {
        submission: {
          select: { candidateId: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const patterns: ReviewPattern[] = reviews.map(r => ({
      reviewerId: r.reviewerId,
      reviewId: r.id,
      submissionId: r.submissionId,
      candidateId: r.submission.candidateId,
      score: Number(r.overallScore),
      timeSpentSeconds: r.timeSpentSeconds,
      submittedAt: r.submittedAt,
      feedbackLength:
        (r.strengths?.length || 0) +
        (r.areasForImprovement?.length || 0) +
        (r.suggestions?.length || 0),
    }));

    const anomalies: ReviewAnomalyDto[] = [];

    // Run detection algorithms
    const rubberStampAnomalies = this.detectRubberStamping(patterns);
    anomalies.push(...rubberStampAnomalies);

    const timingAnomalies = this.detectTimingAnomalies(patterns);
    anomalies.push(...timingAnomalies);

    const reciprocalAnomalies = await this.detectReciprocalScoring(patterns);
    anomalies.push(...reciprocalAnomalies);

    const collusionAnomalies = await this.detectCollusionRings(patterns);
    anomalies.push(...collusionAnomalies);

    // Try ML service for advanced detection
    if (this.mlServiceEnabled && patterns.length > 0) {
      try {
        const mlAnomalies = await this.detectWithMlService(patterns);
        anomalies.push(...mlAnomalies);
      } catch (error) {
        this.logger.warn(`ML anomaly detection unavailable: ${error}`);
      }
    }

    // Deduplicate and sort by confidence
    const uniqueAnomalies = this.deduplicateAnomalies(anomalies);

    const flaggedReviewIds = new Set<string>();
    uniqueAnomalies.forEach(a => a.affectedReviewIds.forEach(id => flaggedReviewIds.add(id)));

    return {
      anomalies: uniqueAnomalies,
      totalReviewsAnalyzed: reviews.length,
      flaggedReviewsCount: flaggedReviewIds.size,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Detect rubber-stamping (quick, uniform scores without thought)
   */
  private detectRubberStamping(patterns: ReviewPattern[]): ReviewAnomalyDto[] {
    const anomalies: ReviewAnomalyDto[] = [];
    const reviewerGroups = this.groupByReviewer(patterns);

    for (const [reviewerId, reviews] of reviewerGroups) {
      if (reviews.length < 3) continue;

      // Check for identical or near-identical scores
      const scores = reviews.map(r => r.score);
      const uniqueScores = new Set(scores);

      if (uniqueScores.size === 1) {
        // All identical scores
        anomalies.push({
          anomalyType: 'rubber_stamping',
          confidence: 0.9,
          affectedReviewIds: reviews.map(r => r.reviewId),
          affectedUserIds: [reviewerId],
          details: {
            pattern: 'identical_scores',
            scoreValue: scores[0],
            reviewCount: reviews.length,
          },
        });
      } else {
        // Check score variance
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
        const stddev = Math.sqrt(variance);

        if (stddev < 3 && reviews.length >= 5) {
          anomalies.push({
            anomalyType: 'rubber_stamping',
            confidence: 0.7,
            affectedReviewIds: reviews.map(r => r.reviewId),
            affectedUserIds: [reviewerId],
            details: {
              pattern: 'low_variance',
              scoreStddev: stddev,
              scoreMean: mean,
              reviewCount: reviews.length,
            },
          });
        }
      }

      // Check for consistently short feedback
      const shortFeedbackReviews = reviews.filter(r => r.feedbackLength < 100);
      if (shortFeedbackReviews.length >= reviews.length * 0.8) {
        anomalies.push({
          anomalyType: 'rubber_stamping',
          confidence: 0.75,
          affectedReviewIds: shortFeedbackReviews.map(r => r.reviewId),
          affectedUserIds: [reviewerId],
          details: {
            pattern: 'minimal_feedback',
            shortFeedbackCount: shortFeedbackReviews.length,
            totalReviewCount: reviews.length,
          },
        });
      }
    }

    return anomalies;
  }

  /**
   * Detect timing anomalies (suspiciously fast reviews)
   */
  private detectTimingAnomalies(patterns: ReviewPattern[]): ReviewAnomalyDto[] {
    const anomalies: ReviewAnomalyDto[] = [];
    const suspiciousReviews: ReviewPattern[] = [];

    for (const pattern of patterns) {
      if (pattern.timeSpentSeconds !== null && pattern.timeSpentSeconds < this.minTimeThreshold) {
        suspiciousReviews.push(pattern);
      }
    }

    // Group by reviewer
    const reviewerGroups = this.groupByReviewer(suspiciousReviews);

    for (const [reviewerId, reviews] of reviewerGroups) {
      if (reviews.length >= 2) {
        anomalies.push({
          anomalyType: 'timing_anomaly',
          confidence: Math.min(0.6 + reviews.length * 0.1, 0.95),
          affectedReviewIds: reviews.map(r => r.reviewId),
          affectedUserIds: [reviewerId],
          details: {
            pattern: 'consistently_fast',
            averageTimeSeconds:
              reviews.reduce((sum, r) => sum + (r.timeSpentSeconds || 0), 0) / reviews.length,
            reviewCount: reviews.length,
            threshold: this.minTimeThreshold,
          },
        });
      }
    }

    return anomalies;
  }

  /**
   * Detect reciprocal scoring patterns (I rate you high, you rate me high)
   */
  private async detectReciprocalScoring(patterns: ReviewPattern[]): Promise<ReviewAnomalyDto[]> {
    const anomalies: ReviewAnomalyDto[] = [];
    const pairScores: Map<string, { aToB: number[]; bToA: number[]; reviews: string[] }> =
      new Map();

    // Build reviewer-candidate pairs
    for (const pattern of patterns) {
      const pairKey = [pattern.reviewerId, pattern.candidateId].sort().join('|');

      if (!pairScores.has(pairKey)) {
        pairScores.set(pairKey, { aToB: [], bToA: [], reviews: [] });
      }

      const pair = pairScores.get(pairKey)!;
      if (pattern.reviewerId < pattern.candidateId) {
        pair.aToB.push(pattern.score);
      } else {
        pair.bToA.push(pattern.score);
      }
      pair.reviews.push(pattern.reviewId);
    }

    // Check for reciprocal high scores
    for (const [pairKey, data] of pairScores) {
      if (data.aToB.length > 0 && data.bToA.length > 0) {
        const avgAToB = data.aToB.reduce((a, b) => a + b, 0) / data.aToB.length;
        const avgBToA = data.bToA.reduce((a, b) => a + b, 0) / data.bToA.length;

        // Both giving high scores to each other
        if (avgAToB >= 80 && avgBToA >= 80) {
          const [userId1, userId2] = pairKey.split('|');
          anomalies.push({
            anomalyType: 'reciprocal_scoring',
            confidence: 0.8,
            affectedReviewIds: data.reviews,
            affectedUserIds: [userId1, userId2],
            details: {
              pattern: 'mutual_high_scores',
              user1ToUser2Average: avgAToB,
              user2ToUser1Average: avgBToA,
              interactionCount: data.aToB.length + data.bToA.length,
            },
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Detect collusion rings (groups of users consistently favoring each other)
   */
  private async detectCollusionRings(patterns: ReviewPattern[]): Promise<ReviewAnomalyDto[]> {
    const anomalies: ReviewAnomalyDto[] = [];

    // Build interaction graph
    const interactions: Map<
      string,
      Map<string, { scores: number[]; reviews: string[] }>
    > = new Map();

    for (const pattern of patterns) {
      if (!interactions.has(pattern.reviewerId)) {
        interactions.set(pattern.reviewerId, new Map());
      }

      const reviewerMap = interactions.get(pattern.reviewerId)!;
      if (!reviewerMap.has(pattern.candidateId)) {
        reviewerMap.set(pattern.candidateId, { scores: [], reviews: [] });
      }

      const data = reviewerMap.get(pattern.candidateId)!;
      data.scores.push(pattern.score);
      data.reviews.push(pattern.reviewId);
    }

    // Find potential rings using simple clique detection
    const rings = this.findCollusionCliques(interactions);

    for (const ring of rings) {
      const allReviews: string[] = [];
      ring.participants.forEach(p1 => {
        ring.participants.forEach(p2 => {
          if (p1 !== p2) {
            const data = interactions.get(p1)?.get(p2);
            if (data) {
              allReviews.push(...data.reviews);
            }
          }
        });
      });

      if (ring.participants.length >= this.collusionMinParticipants) {
        anomalies.push({
          anomalyType: 'collusion_ring',
          confidence: ring.confidence,
          affectedReviewIds: [...new Set(allReviews)],
          affectedUserIds: ring.participants,
          details: {
            pattern: ring.pattern,
            participantCount: ring.participants.length,
            reviewCount: allReviews.length,
          },
        });
      }
    }

    return anomalies;
  }

  /**
   * Find cliques of users with suspicious mutual interactions
   */
  private findCollusionCliques(
    interactions: Map<string, Map<string, { scores: number[]; reviews: string[] }>>
  ): CollusionRing[] {
    const rings: CollusionRing[] = [];
    const users = Array.from(interactions.keys());

    // Simple approach: check all combinations of 3-5 users
    for (let size = 3; size <= Math.min(5, users.length); size++) {
      const combinations = this.combinations(users, size);

      for (const combo of combinations) {
        const ring = this.evaluateRing(combo, interactions);
        if (ring) {
          rings.push(ring);
        }
      }
    }

    return rings;
  }

  /**
   * Evaluate if a group of users forms a collusion ring
   */
  private evaluateRing(
    users: string[],
    interactions: Map<string, Map<string, { scores: number[]; reviews: string[] }>>
  ): CollusionRing | null {
    let totalInteractions = 0;
    let highScoreInteractions = 0;
    const allReviews: string[] = [];

    for (const user1 of users) {
      for (const user2 of users) {
        if (user1 === user2) continue;

        const data = interactions.get(user1)?.get(user2);
        if (data && data.scores.length > 0) {
          totalInteractions++;
          allReviews.push(...data.reviews);

          const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
          if (avgScore >= 80) {
            highScoreInteractions++;
          }
        }
      }
    }

    // Need minimum interactions and high percentage of favorable scores
    const expectedInteractions = users.length * (users.length - 1) * 0.3; // 30% of possible
    if (
      totalInteractions >= this.collusionMinInteractions &&
      totalInteractions >= expectedInteractions &&
      highScoreInteractions / totalInteractions >= 0.7
    ) {
      return {
        participants: users,
        confidence: Math.min(0.6 + (highScoreInteractions / totalInteractions) * 0.3, 0.95),
        reviewsInvolved: [...new Set(allReviews)],
        pattern: 'mutual_favorable_scoring',
      };
    }

    return null;
  }

  /**
   * Use ML service for advanced anomaly detection
   */
  private async detectWithMlService(patterns: ReviewPattern[]): Promise<ReviewAnomalyDto[]> {
    try {
      const response = await fetch(`${this.mlServiceUrl}/api/v1/review/anomalies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviews: patterns.map(p => ({
            review_id: p.reviewId,
            reviewer_id: p.reviewerId,
            submission_id: p.submissionId,
            candidate_id: p.candidateId,
            score: p.score,
            time_spent_seconds: p.timeSpentSeconds,
            submitted_at: p.submittedAt?.toISOString(),
            feedback_length: p.feedbackLength,
          })),
        }),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();

      return data.anomalies.map((a: any) => ({
        anomalyType: a.anomaly_type,
        confidence: a.confidence,
        affectedReviewIds: a.affected_review_ids,
        affectedUserIds: a.affected_user_ids,
        details: a.details,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Group patterns by reviewer
   */
  private groupByReviewer(patterns: ReviewPattern[]): Map<string, ReviewPattern[]> {
    const groups = new Map<string, ReviewPattern[]>();
    for (const pattern of patterns) {
      if (!groups.has(pattern.reviewerId)) {
        groups.set(pattern.reviewerId, []);
      }
      groups.get(pattern.reviewerId)!.push(pattern);
    }
    return groups;
  }

  /**
   * Generate combinations of k elements from array
   */
  private combinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];

    const [first, ...rest] = arr;
    const withFirst = this.combinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = this.combinations(rest, k);

    return [...withFirst, ...withoutFirst];
  }

  /**
   * Deduplicate anomalies by merging overlapping ones
   */
  private deduplicateAnomalies(anomalies: ReviewAnomalyDto[]): ReviewAnomalyDto[] {
    const seen = new Map<string, ReviewAnomalyDto>();

    for (const anomaly of anomalies) {
      const key = `${anomaly.anomalyType}|${anomaly.affectedUserIds.sort().join(',')}`;

      if (!seen.has(key) || seen.get(key)!.confidence < anomaly.confidence) {
        seen.set(key, anomaly);
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Flag a reviewer for investigation
   */
  async flagReviewerForInvestigation(
    reviewerId: string,
    reason: string,
    anomalyIds?: string[]
  ): Promise<void> {
    this.logger.warn(
      `Flagging reviewer ${reviewerId} for investigation. Reason: ${reason}. ` +
        `Related anomalies: ${anomalyIds?.join(', ') || 'N/A'}`
    );

    // In a real implementation, this would:
    // 1. Create an investigation record
    // 2. Notify administrators
    // 3. Potentially restrict the reviewer's access
    // 4. Queue their reviews for re-evaluation

    // For now, we'll just log and potentially update the reviewer's status
    await prisma.candidateProfile.update({
      where: { id: reviewerId },
      data: {
        // Could add a 'flaggedForInvestigation' field to the schema
        // For now, just reduce reputation as a signal
        reputationScore: {
          decrement: 10,
        },
      },
    });
  }
}

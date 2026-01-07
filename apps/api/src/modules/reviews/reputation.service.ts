import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@verihire/database';

interface ReputationFactors {
  qualityScore: number;
  biasDetected: boolean;
  onTime: boolean;
  accuracyDelta?: number; // How close to consensus
}

interface ReputationUpdateResult {
  previousScore: number;
  newScore: number;
  delta: number;
  factors: {
    qualityBonus: number;
    biasPenalty: number;
    timelinessFactor: number;
    accuracyFactor: number;
    decayFactor: number;
  };
}

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  // Configuration
  private readonly initialReputation = 50;
  private readonly minReputation = 0;
  private readonly maxReputation = 100;
  private readonly qualityWeight = 0.4;
  private readonly accuracyWeight = 0.3;
  private readonly timelinessWeight = 0.15;
  private readonly consistencyWeight = 0.15;
  private readonly biasPenalty = 10;
  private readonly severeViolationPenalty = 25;
  private readonly decayRate = 0.02; // 2% monthly decay
  private readonly decayThresholdDays = 30;

  /**
   * Get current reputation score for a reviewer
   */
  async getScore(reviewerId: string): Promise<number> {
    const profile = await prisma.candidateProfile.findUnique({
      where: { id: reviewerId },
      select: { reputationScore: true },
    });

    return profile?.reputationScore ? Number(profile.reputationScore) : this.initialReputation;
  }

  /**
   * Update reputation after a review is submitted and analyzed
   */
  async updateAfterReview(
    reviewerId: string,
    qualityScore: number,
    biasDetected: boolean,
    onTime: boolean = true
  ): Promise<number> {
    const result = await this.calculateAndApplyUpdate(reviewerId, {
      qualityScore,
      biasDetected,
      onTime,
    });

    return result.delta;
  }

  /**
   * Calculate and apply reputation update
   */
  private async calculateAndApplyUpdate(
    reviewerId: string,
    factors: ReputationFactors
  ): Promise<ReputationUpdateResult> {
    const currentScore = await this.getScore(reviewerId);
    const previousScore = currentScore;

    // Calculate quality bonus/penalty
    // Quality 80%+ earns bonus, below 50% incurs penalty
    let qualityBonus = 0;
    if (factors.qualityScore >= 80) {
      qualityBonus = ((factors.qualityScore - 80) / 20) * 5; // Up to +5
    } else if (factors.qualityScore < 50) {
      qualityBonus = ((factors.qualityScore - 50) / 50) * 5; // Up to -5
    }

    // Calculate bias penalty
    const biasPenaltyValue = factors.biasDetected ? -this.biasPenalty : 0;

    // Calculate timeliness factor
    const timelinessFactor = factors.onTime ? 1 : -2;

    // Calculate accuracy factor (how close to final consensus)
    // This requires comparing to aggregated score after all reviews
    const accuracyFactor =
      factors.accuracyDelta !== undefined ? this.calculateAccuracyFactor(factors.accuracyDelta) : 0;

    // Calculate decay for inactive reviewers
    const decayFactor = await this.calculateDecay(reviewerId);

    // Total delta
    const delta =
      qualityBonus * this.qualityWeight +
      biasPenaltyValue +
      timelinessFactor * this.timelinessWeight +
      accuracyFactor * this.accuracyWeight -
      decayFactor;

    // Apply update with bounds
    const newScore = Math.max(
      this.minReputation,
      Math.min(this.maxReputation, currentScore + delta)
    );

    // Update database
    await prisma.candidateProfile.update({
      where: { id: reviewerId },
      data: { reputationScore: newScore },
    });

    const result = {
      previousScore,
      newScore,
      delta: newScore - previousScore,
      factors: {
        qualityBonus,
        biasPenalty: biasPenaltyValue,
        timelinessFactor,
        accuracyFactor,
        decayFactor,
      },
    };

    this.logger.log(
      `Updated reputation for ${reviewerId}: ${previousScore} -> ${newScore} (delta: ${result.delta.toFixed(2)})`
    );

    return result;
  }

  /**
   * Calculate accuracy factor based on deviation from consensus
   */
  private calculateAccuracyFactor(delta: number): number {
    // delta = difference between reviewer's score and final aggregated score
    // Closer to 0 = more accurate
    const absDelta = Math.abs(delta);

    if (absDelta <= 5) {
      return 3; // Very accurate, +3 bonus
    } else if (absDelta <= 10) {
      return 1; // Accurate, +1 bonus
    } else if (absDelta <= 15) {
      return 0; // Within acceptable range
    } else if (absDelta <= 25) {
      return -2; // Somewhat off, -2 penalty
    } else {
      return -5; // Far off, -5 penalty
    }
  }

  /**
   * Calculate reputation decay for inactive reviewers
   */
  private async calculateDecay(reviewerId: string): Promise<number> {
    const lastReview = await prisma.review.findFirst({
      where: {
        reviewerId,
        status: { in: ['SUBMITTED', 'VALIDATED'] },
      },
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true },
    });

    if (!lastReview || !lastReview.submittedAt) {
      return 0;
    }

    const daysSinceLastReview = Math.floor(
      (Date.now() - new Date(lastReview.submittedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastReview < this.decayThresholdDays) {
      return 0;
    }

    // Calculate decay amount
    const monthsInactive = (daysSinceLastReview - this.decayThresholdDays) / 30;
    const currentScore = await this.getScore(reviewerId);

    return currentScore * this.decayRate * monthsInactive;
  }

  /**
   * Apply severe penalty for confirmed violations (e.g., collusion)
   */
  async applySeverePenalty(reviewerId: string, reason: string): Promise<ReputationUpdateResult> {
    const currentScore = await this.getScore(reviewerId);
    const newScore = Math.max(this.minReputation, currentScore - this.severeViolationPenalty);

    await prisma.candidateProfile.update({
      where: { id: reviewerId },
      data: { reputationScore: newScore },
    });

    this.logger.warn(
      `Applied severe penalty to ${reviewerId}: ${currentScore} -> ${newScore}. Reason: ${reason}`
    );

    return {
      previousScore: currentScore,
      newScore,
      delta: newScore - currentScore,
      factors: {
        qualityBonus: 0,
        biasPenalty: -this.severeViolationPenalty,
        timelinessFactor: 0,
        accuracyFactor: 0,
        decayFactor: 0,
      },
    };
  }

  /**
   * Update reputation based on accuracy after final score is calculated
   */
  async updateAccuracyBonus(
    reviewerId: string,
    reviewScore: number,
    finalAggregatedScore: number
  ): Promise<number> {
    const accuracyDelta = reviewScore - finalAggregatedScore;

    const result = await this.calculateAndApplyUpdate(reviewerId, {
      qualityScore: 70, // Neutral quality since already scored
      biasDetected: false,
      onTime: true,
      accuracyDelta,
    });

    return result.delta;
  }

  /**
   * Get reputation tier based on score
   */
  getTier(score: number): {
    tier: string;
    privileges: string[];
    minScore: number;
    maxScore: number;
  } {
    if (score >= 90) {
      return {
        tier: 'Expert',
        privileges: [
          'Higher weight in score aggregation',
          'Priority review assignments',
          'Can review senior-level submissions',
          'Badge display on profile',
        ],
        minScore: 90,
        maxScore: 100,
      };
    } else if (score >= 75) {
      return {
        tier: 'Advanced',
        privileges: [
          'Standard weight in score aggregation',
          'Regular review assignments',
          'Can review mid-level submissions',
        ],
        minScore: 75,
        maxScore: 89,
      };
    } else if (score >= 50) {
      return {
        tier: 'Intermediate',
        privileges: [
          'Reduced weight in score aggregation',
          'Limited review assignments',
          'Can review entry-level submissions',
        ],
        minScore: 50,
        maxScore: 74,
      };
    } else if (score >= 30) {
      return {
        tier: 'Novice',
        privileges: [
          'Minimal weight in score aggregation',
          'Supervised review assignments only',
          'Reviews require secondary validation',
        ],
        minScore: 30,
        maxScore: 49,
      };
    } else {
      return {
        tier: 'Restricted',
        privileges: ['Cannot submit reviews', 'Must complete training to regain access'],
        minScore: 0,
        maxScore: 29,
      };
    }
  }

  /**
   * Check if reviewer can accept new assignments
   */
  async canAcceptAssignments(reviewerId: string): Promise<{
    canAccept: boolean;
    reason?: string;
  }> {
    const score = await this.getScore(reviewerId);
    const tier = this.getTier(score);

    if (tier.tier === 'Restricted') {
      return {
        canAccept: false,
        reason: 'Reputation too low. Complete training to regain review privileges.',
      };
    }

    // Check for recent severe violations
    const recentFlags = await prisma.review.count({
      where: {
        reviewerId,
        biasDetected: true,
        submittedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    });

    if (recentFlags >= 3) {
      return {
        canAccept: false,
        reason: 'Multiple bias flags in recent reviews. Account under review.',
      };
    }

    return { canAccept: true };
  }

  /**
   * Get leaderboard of top reviewers
   */
  async getLeaderboard(options?: { skillId?: string; limit?: number }): Promise<
    Array<{
      reviewerId: string;
      reputationScore: number;
      tier: string;
      totalReviews: number;
      averageQuality: number;
    }>
  > {
    const { skillId, limit = 20 } = options || {};

    const where: any = {
      reputationScore: { gte: 30 }, // At least Novice tier
    };

    if (skillId) {
      where.candidateSkills = {
        some: {
          skillId,
          verified: true,
        },
      };
    }

    const reviewers = await prisma.candidateProfile.findMany({
      where,
      include: {
        reviewsGiven: {
          where: { status: { in: ['SUBMITTED', 'VALIDATED'] } },
          select: { qualityScore: true },
        },
      },
      orderBy: { reputationScore: 'desc' },
      take: limit,
    });

    return reviewers.map(r => {
      const reviews = r.reviewsGiven;
      const avgQuality =
        reviews.length > 0
          ? reviews.reduce(
              (sum, rev) => sum + (rev.qualityScore ? Number(rev.qualityScore) : 0),
              0
            ) / reviews.length
          : 0;

      return {
        reviewerId: r.id,
        reputationScore: Number(r.reputationScore),
        tier: this.getTier(Number(r.reputationScore)).tier,
        totalReviews: reviews.length,
        averageQuality: Math.round(avgQuality * 100) / 100,
      };
    });
  }
}

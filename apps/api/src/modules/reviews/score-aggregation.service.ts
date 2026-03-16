import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@verihire/database';
import { AggregatedScoreDto } from './dto';

interface AiScore {
  score: number;
  confidence: number;
}

interface PeerReviewScore {
  reviewId: string;
  reviewerId: string;
  score: number;
  qualityScore: number;
  weight: number;
}

interface DisagreementAnalysis {
  hasSignificantDisagreement: boolean;
  disagreementType: 'ai_peer' | 'peer_peer' | 'none';
  standardDeviation: number;
  maxDifference: number;
}

@Injectable()
export class ScoreAggregationService {
  private readonly logger = new Logger(ScoreAggregationService.name);

  // Configuration — peer review is optional and non-blocking.
  // Certificates and domain scores use aiScore directly; this blend
  // only sets the submission's finalScore for informational purposes.
  private readonly baseAiWeight = 0.7; // AI gets 70% base weight
  private readonly basePeerWeight = 0.3; // Peers get 30% base weight
  private readonly minPeerReviewsForFullWeight = 3;
  private readonly disagreementThreshold = 15; // Points difference to flag
  private readonly peerDisagreementThreshold = 20; // Between peer reviewers
  private readonly minConfidenceForReduction = 0.7;

  /**
   * Aggregate AI and peer review scores into a final score
   */
  async aggregate(
    submissionId: string,
    aiScore: AiScore | null,
    peerReviews: PeerReviewScore[]
  ): Promise<AggregatedScoreDto> {
    const validReviews = peerReviews.filter(r => r.qualityScore >= 60);
    const totalReviewsCount = peerReviews.length;
    const validReviewsCount = validReviews.length;

    // Calculate weights
    const { aiWeight, peerWeight } = this.calculateDynamicWeights(aiScore, validReviews);

    // Calculate peer score with reviewer weighting
    const peerScore = this.calculateWeightedPeerScore(validReviews);

    // Calculate final score
    let finalScore: number;
    if (aiScore && peerScore !== null) {
      finalScore = aiScore.score * aiWeight + peerScore * peerWeight;
    } else if (aiScore) {
      finalScore = aiScore.score;
    } else if (peerScore !== null) {
      finalScore = peerScore;
    } else {
      finalScore = 0;
    }

    // Analyze disagreement
    const disagreement = this.analyzeDisagreement(aiScore, validReviews);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(aiScore, validReviews, disagreement);

    // Determine if human review is needed
    const needsHumanReview = this.shouldFlagForHumanReview(
      disagreement,
      validReviewsCount,
      confidence
    );

    if (needsHumanReview) {
      this.logger.warn(
        `Submission ${submissionId} flagged for human review. ` +
          `Disagreement: ${disagreement.disagreementType}, ` +
          `Confidence: ${confidence.toFixed(2)}`
      );
    }

    return {
      submissionId,
      finalScore: Math.round(finalScore * 100) / 100,
      aiScore: aiScore?.score ?? 0,
      peerScore,
      aiWeight,
      peerWeight,
      confidence,
      needsHumanReview,
      validReviewsCount,
      totalReviewsCount,
    };
  }

  /**
   * Calculate dynamic weights based on AI confidence and number of peer reviews
   */
  private calculateDynamicWeights(
    aiScore: AiScore | null,
    validReviews: PeerReviewScore[]
  ): { aiWeight: number; peerWeight: number } {
    if (!aiScore && validReviews.length === 0) {
      return { aiWeight: 0, peerWeight: 0 };
    }

    if (!aiScore) {
      return { aiWeight: 0, peerWeight: 1 };
    }

    if (validReviews.length === 0) {
      return { aiWeight: 1, peerWeight: 0 };
    }

    let aiWeight = this.baseAiWeight;
    let peerWeight = this.basePeerWeight;

    // Adjust based on AI confidence
    if (aiScore.confidence < this.minConfidenceForReduction) {
      // Lower AI confidence = more weight to peers
      const confidenceReduction = (this.minConfidenceForReduction - aiScore.confidence) * 0.3;
      aiWeight -= confidenceReduction;
      peerWeight += confidenceReduction;
    }

    // Adjust based on number of peer reviews
    if (validReviews.length < this.minPeerReviewsForFullWeight) {
      // Fewer reviews = less peer weight
      const reviewFactor = validReviews.length / this.minPeerReviewsForFullWeight;
      const reduction = peerWeight * (1 - reviewFactor) * 0.5;
      peerWeight -= reduction;
      aiWeight += reduction;
    }

    // Adjust based on average peer review quality
    const avgQuality =
      validReviews.reduce((sum, r) => sum + r.qualityScore, 0) / validReviews.length;
    if (avgQuality < 70) {
      // Lower quality reviews = less peer weight
      const qualityReduction = ((70 - avgQuality) / 70) * 0.15;
      peerWeight -= qualityReduction;
      aiWeight += qualityReduction;
    }

    // Normalize weights to sum to 1
    const total = aiWeight + peerWeight;
    return {
      aiWeight: aiWeight / total,
      peerWeight: peerWeight / total,
    };
  }

  /**
   * Calculate weighted peer score based on reviewer reputation and review quality
   */
  private calculateWeightedPeerScore(validReviews: PeerReviewScore[]): number | null {
    if (validReviews.length === 0) {
      return null;
    }

    // Get reviewer reputations
    const reviewsWithWeights = validReviews.map(review => {
      // Weight combines quality score and base weight (which can be reputation-based)
      const qualityWeight = review.qualityScore / 100;
      const reputationWeight = review.weight || 1;
      const combinedWeight = qualityWeight * 0.6 + reputationWeight * 0.4;

      return {
        score: review.score,
        weight: combinedWeight,
      };
    });

    // Calculate weighted average
    const totalWeight = reviewsWithWeights.reduce((sum, r) => sum + r.weight, 0);
    const weightedSum = reviewsWithWeights.reduce((sum, r) => sum + r.score * r.weight, 0);

    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }

  /**
   * Analyze disagreement between AI and peer scores
   */
  private analyzeDisagreement(
    aiScore: AiScore | null,
    validReviews: PeerReviewScore[]
  ): DisagreementAnalysis {
    if (validReviews.length === 0) {
      return {
        hasSignificantDisagreement: false,
        disagreementType: 'none',
        standardDeviation: 0,
        maxDifference: 0,
      };
    }

    const peerScores = validReviews.map(r => r.score);
    const avgPeerScore = peerScores.reduce((sum, s) => sum + s, 0) / peerScores.length;

    // Calculate standard deviation of peer scores
    const variance =
      peerScores.reduce((sum, s) => sum + Math.pow(s - avgPeerScore, 2), 0) / peerScores.length;
    const standardDeviation = Math.sqrt(variance);

    // Calculate max difference between peers
    const maxPeerDiff =
      peerScores.length > 1 ? Math.max(...peerScores) - Math.min(...peerScores) : 0;

    // Check AI vs peer disagreement
    let aiPeerDiff = 0;
    if (aiScore) {
      aiPeerDiff = Math.abs(aiScore.score - avgPeerScore);
    }

    // Determine disagreement type
    let disagreementType: 'ai_peer' | 'peer_peer' | 'none' = 'none';
    let hasSignificantDisagreement = false;

    if (aiPeerDiff > this.disagreementThreshold) {
      disagreementType = 'ai_peer';
      hasSignificantDisagreement = true;
    } else if (maxPeerDiff > this.peerDisagreementThreshold) {
      disagreementType = 'peer_peer';
      hasSignificantDisagreement = true;
    }

    return {
      hasSignificantDisagreement,
      disagreementType,
      standardDeviation,
      maxDifference: Math.max(aiPeerDiff, maxPeerDiff),
    };
  }

  /**
   * Calculate overall confidence in the aggregated score
   */
  private calculateConfidence(
    aiScore: AiScore | null,
    validReviews: PeerReviewScore[],
    disagreement: DisagreementAnalysis
  ): number {
    let confidence = 1.0;

    // Factor 1: AI confidence
    if (aiScore) {
      confidence *= 0.3 + 0.7 * aiScore.confidence;
    } else {
      confidence *= 0.7; // Reduce confidence without AI
    }

    // Factor 2: Number of peer reviews
    const reviewFactor = Math.min(validReviews.length / this.minPeerReviewsForFullWeight, 1);
    confidence *= 0.5 + 0.5 * reviewFactor;

    // Factor 3: Disagreement penalty
    if (disagreement.hasSignificantDisagreement) {
      const disagreementPenalty = Math.min(disagreement.maxDifference / 30, 1) * 0.3;
      confidence -= disagreementPenalty;
    }

    // Factor 4: Peer review quality
    if (validReviews.length > 0) {
      const avgQuality =
        validReviews.reduce((sum, r) => sum + r.qualityScore, 0) / validReviews.length;
      confidence *= 0.7 + 0.3 * (avgQuality / 100);
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Determine if a submission should be flagged for human review
   */
  private shouldFlagForHumanReview(
    disagreement: DisagreementAnalysis,
    validReviewsCount: number,
    confidence: number
  ): boolean {
    // Flag if significant disagreement
    if (disagreement.hasSignificantDisagreement) {
      return true;
    }

    // Flag if not enough valid reviews
    if (validReviewsCount < 2) {
      return true;
    }

    // Flag if confidence is too low
    if (confidence < 0.5) {
      return true;
    }

    // Flag if peer standard deviation is high
    if (disagreement.standardDeviation > 15) {
      return true;
    }

    return false;
  }

  /**
   * Recalculate aggregation after a review is validated or invalidated
   */
  async recalculateForSubmission(submissionId: string): Promise<AggregatedScoreDto> {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        evaluations: true,
        reviews: {
          where: { status: { in: ['SUBMITTED', 'VALIDATED'] } },
        },
      },
    });

    if (!submission) {
      throw new Error('Submission not found');
    }

    const aiEvaluation = submission.evaluations[0];
    const validReviews = submission.reviews.filter(
      r => r.qualityScore && Number(r.qualityScore) >= 60
    );

    const result = await this.aggregate(
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

    // Update submission with new scores
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        peerScore: result.peerScore ? result.peerScore : null,
        finalScore: result.finalScore,
      },
    });

    return result;
  }
}

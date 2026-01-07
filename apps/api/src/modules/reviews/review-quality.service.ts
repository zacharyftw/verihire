import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BiasType, ReviewQualityMetricsDto, BiasAnalysisDto, CriterionScoreDto } from './dto';

interface ReviewQualityInput {
  reviewId: string;
  reviewerId: string;
  criteriaScores: CriterionScoreDto[];
  overallScore: number;
  strengths: string;
  areasForImprovement: string;
  suggestions?: string;
  submissionContent: string;
  submissionType: string;
  timeSpentSeconds: number;
  expectedTimeSeconds: number;
  reviewerAverageScore?: number;
  reviewerScoreStddev?: number;
}

interface ReviewQualityResult {
  overallQuality: number;
  metrics: ReviewQualityMetricsDto;
  biasAnalysis: BiasAnalysisDto;
  isValid: boolean;
  feedbackForReviewer: string[];
}

/**
 * Service for analyzing the quality of peer reviews.
 * Evaluates effort, specificity, consistency, and detects potential bias.
 */
@Injectable()
export class ReviewQualityService {
  private readonly logger = new Logger(ReviewQualityService.name);

  // Quality thresholds
  private readonly minFeedbackLength = 50;
  private readonly minJustificationLength = 20;
  private readonly qualityThreshold = 0.6;

  // Bias detection thresholds
  private readonly harshnessThreshold = -15;
  private readonly leniencyThreshold = 15;
  private readonly haloEffectThreshold = 5;
  private readonly centralTendencyRange = { min: 35, max: 65 };

  // Generic phrases that indicate low effort
  private readonly genericPhrases = [
    'good job',
    'nice work',
    'well done',
    'needs improvement',
    'could be better',
    'overall good',
    'nothing to add',
    'looks fine',
    'no issues',
    'keep it up',
  ];

  private readonly mlServiceUrl: string;
  private readonly mlServiceEnabled: boolean;

  constructor(private configService: ConfigService) {
    this.mlServiceUrl =
      this.configService.get<string>('mlService.baseUrl') || 'http://localhost:4200';
    this.mlServiceEnabled = this.configService.get<boolean>('mlService.enabled') ?? true;
  }

  /**
   * Analyze the quality of a review
   */
  async analyzeQuality(input: ReviewQualityInput): Promise<ReviewQualityResult> {
    // Try ML service first if available
    if (this.mlServiceEnabled) {
      try {
        const mlResult = await this.analyzeWithMlService(input);
        if (mlResult) return mlResult;
      } catch (error) {
        this.logger.warn(`ML service unavailable, using local analysis: ${error}`);
      }
    }

    // Fall back to local analysis
    return this.analyzeLocally(input);
  }

  /**
   * Analyze using ML service
   */
  private async analyzeWithMlService(
    input: ReviewQualityInput
  ): Promise<ReviewQualityResult | null> {
    try {
      const response = await fetch(`${this.mlServiceUrl}/api/v1/review/quality`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: input.reviewId,
          reviewer_id: input.reviewerId,
          criteria_scores: input.criteriaScores.map(cs => ({
            criterion_id: cs.criterionId,
            criterion_name: cs.criterionName,
            score: cs.score,
            weight: cs.weight,
            justification: cs.justification,
          })),
          overall_score: input.overallScore,
          strengths: input.strengths,
          areas_for_improvement: input.areasForImprovement,
          suggestions: input.suggestions || '',
          submission_content: input.submissionContent,
          submission_type: input.submissionType,
          time_spent_seconds: input.timeSpentSeconds,
          expected_time_seconds: input.expectedTimeSeconds,
          reviewer_average_score: input.reviewerAverageScore,
          reviewer_score_stddev: input.reviewerScoreStddev,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      return {
        overallQuality: data.overall_quality,
        metrics: {
          effortScore: data.metrics.effort_score,
          specificityScore: data.metrics.specificity_score,
          consistencyScore: data.metrics.consistency_score,
          rubricAlignmentScore: data.metrics.rubric_alignment_score,
          feedbackQualityScore: data.metrics.feedback_quality_score,
        },
        biasAnalysis: {
          biasDetected: data.bias_analysis.bias_detected,
          biasType: data.bias_analysis.bias_type as BiasType,
          biasProbability: data.bias_analysis.bias_probability,
          details: data.bias_analysis.details,
        },
        isValid: data.is_valid,
        feedbackForReviewer: data.feedback_for_reviewer,
      };
    } catch {
      return null;
    }
  }

  /**
   * Analyze quality locally without ML service
   */
  private analyzeLocally(input: ReviewQualityInput): ReviewQualityResult {
    // Calculate all metrics
    const effortScore = this.calculateEffortScore(input);
    const specificityScore = this.calculateSpecificityScore(input);
    const consistencyScore = this.calculateConsistencyScore(input);
    const rubricAlignmentScore = this.calculateRubricAlignmentScore(input);
    const feedbackQualityScore = this.calculateFeedbackQualityScore(input);

    const metrics: ReviewQualityMetricsDto = {
      effortScore,
      specificityScore,
      consistencyScore,
      rubricAlignmentScore,
      feedbackQualityScore,
    };

    // Detect bias
    const biasAnalysis = this.detectBias(input);

    // Calculate overall quality
    let overallQuality =
      effortScore * 0.25 +
      specificityScore * 0.2 +
      consistencyScore * 0.2 +
      rubricAlignmentScore * 0.15 +
      feedbackQualityScore * 0.2;

    // Penalize if bias detected
    if (biasAnalysis.biasDetected) {
      overallQuality *= 0.8;
    }

    overallQuality = Math.round(overallQuality * 1000) / 1000;

    // Determine validity
    const isValid = overallQuality >= this.qualityThreshold && !biasAnalysis.biasDetected;

    // Generate feedback
    const feedbackForReviewer = this.generateFeedback(metrics, biasAnalysis);

    return {
      overallQuality,
      metrics,
      biasAnalysis,
      isValid,
      feedbackForReviewer,
    };
  }

  /**
   * Calculate effort/thoroughness score
   */
  private calculateEffortScore(input: ReviewQualityInput): number {
    const signals: number[] = [];

    // Time spent ratio
    const timeRatio = Math.min(input.timeSpentSeconds / input.expectedTimeSeconds, 1.5);
    signals.push(Math.min(timeRatio / 1.5, 1.0));

    // Feedback length
    const totalFeedback =
      input.strengths.length + input.areasForImprovement.length + (input.suggestions?.length || 0);
    signals.push(Math.min(totalFeedback / 300, 1.0));

    // Justification completeness
    const justifications = input.criteriaScores.map(cs => cs.justification);
    if (justifications.length > 0) {
      const avgLength =
        justifications.reduce((sum, j) => sum + j.length, 0) / justifications.length;
      signals.push(Math.min(avgLength / 50, 1.0));
    } else {
      signals.push(0);
    }

    // Time penalty for very short reviews
    if (input.timeSpentSeconds < 60) {
      signals.push(0.2);
    } else if (input.timeSpentSeconds < 120) {
      signals.push(0.5);
    } else {
      signals.push(1.0);
    }

    return signals.reduce((a, b) => a + b, 0) / signals.length;
  }

  /**
   * Calculate specificity score
   */
  private calculateSpecificityScore(input: ReviewQualityInput): number {
    const submissionLower = input.submissionContent.toLowerCase();
    const feedbackText = `${input.strengths} ${input.areasForImprovement} ${input.suggestions || ''}`;
    const feedbackLower = feedbackText.toLowerCase();

    // Extract significant words from submission
    const submissionWords = new Set(
      submissionLower
        .match(/\b[a-z]{4,}\b/g)
        ?.filter(
          w =>
            ![
              'this',
              'that',
              'with',
              'from',
              'have',
              'been',
              'function',
              'return',
              'const',
            ].includes(w)
        ) || []
    );

    if (submissionWords.size === 0) return 0.5;

    // Check overlap with feedback
    const feedbackWords = new Set(feedbackLower.match(/\b[a-z]{4,}\b/g) || []);
    let overlap = 0;
    submissionWords.forEach(word => {
      if (feedbackWords.has(word)) overlap++;
    });

    const specificity = Math.min(overlap / Math.max(submissionWords.size * 0.1, 5), 1.0);

    // Check for code references
    const referencePatterns = [/line \d+/i, /function \w+/i, /variable \w+/i, /the \w+ method/i];
    const references = referencePatterns.filter(p => p.test(feedbackText)).length;
    const referenceScore = Math.min(references / 3, 1.0);

    return specificity * 0.6 + referenceScore * 0.4;
  }

  /**
   * Calculate internal consistency score
   */
  private calculateConsistencyScore(input: ReviewQualityInput): number {
    if (input.criteriaScores.length === 0) return 0.5;

    const criteriaValues = input.criteriaScores.map(cs => cs.score);

    // Calculate weighted average
    const totalWeight = input.criteriaScores.reduce((sum, cs) => sum + cs.weight, 0);
    const weightedAvg =
      totalWeight > 0
        ? input.criteriaScores.reduce((sum, cs) => sum + cs.score * cs.weight, 0) / totalWeight
        : criteriaValues.reduce((a, b) => a + b, 0) / criteriaValues.length;

    // Check if overall score matches criteria
    const scoreDiff = Math.abs(input.overallScore - weightedAvg);
    let consistency = Math.max(0, 1 - scoreDiff / 30);

    // Check variance
    if (criteriaValues.length > 1) {
      const mean = criteriaValues.reduce((a, b) => a + b, 0) / criteriaValues.length;
      const variance =
        criteriaValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / criteriaValues.length;
      const stddev = Math.sqrt(variance);

      if (stddev < 5) {
        consistency *= 0.8; // Too uniform
      } else if (stddev > 30) {
        consistency *= 0.9; // Too varied
      }
    }

    return consistency;
  }

  /**
   * Calculate rubric alignment score
   */
  private calculateRubricAlignmentScore(input: ReviewQualityInput): number {
    if (input.criteriaScores.length === 0) return 0;

    let score = 1.0;

    // Check justification completeness
    const emptyJustifications = input.criteriaScores.filter(
      cs => cs.justification.trim().length < 10
    ).length;
    score -= emptyJustifications * 0.15;

    // Check score differentiation
    const uniqueScores = new Set(input.criteriaScores.map(cs => cs.score)).size;
    if (uniqueScores === 1 && input.criteriaScores.length > 2) {
      score -= 0.2;
    }

    // Check weights sum
    const totalWeight = input.criteriaScores.reduce((sum, cs) => sum + cs.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.1) {
      score -= 0.1;
    }

    return Math.max(0, score);
  }

  /**
   * Calculate feedback quality score
   */
  private calculateFeedbackQualityScore(input: ReviewQualityInput): number {
    const feedbackText = `${input.strengths} ${input.areasForImprovement}`;

    if (feedbackText.length < this.minFeedbackLength) return 0.3;

    // Check for generic phrases
    const genericCount = this.genericPhrases.filter(phrase =>
      feedbackText.toLowerCase().includes(phrase)
    ).length;
    const genericPenalty = Math.min(genericCount * 0.1, 0.4);

    // Check for actionable language
    const actionablePatterns = [
      /\bconsider\b/i,
      /\btry\b/i,
      /\bcould.*instead\b/i,
      /\brecommend\b/i,
      /\bsuggest\b/i,
      /\bimprove\b/i,
    ];
    const actionableCount = actionablePatterns.filter(p => p.test(feedbackText)).length;
    const actionableBonus = Math.min(actionableCount * 0.1, 0.3);

    // Length score
    const lengthScore = Math.min(feedbackText.length / 400, 1.0);

    // Sentence count
    const sentences = feedbackText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceScore = Math.min(sentences.length / 5, 1.0);

    const finalScore =
      lengthScore * 0.3 + sentenceScore * 0.3 + 0.4 - genericPenalty + actionableBonus;
    return Math.max(0, Math.min(1, finalScore));
  }

  /**
   * Detect bias in the review
   */
  private detectBias(input: ReviewQualityInput): BiasAnalysisDto {
    const biasSignals: Map<BiasType, number> = new Map();

    // 1. Harshness/Leniency bias
    if (input.reviewerAverageScore !== undefined) {
      const deviation = input.overallScore - input.reviewerAverageScore;
      if (deviation < this.harshnessThreshold) {
        biasSignals.set(BiasType.HARSHNESS, Math.min(Math.abs(deviation) / 30, 1.0));
      } else if (deviation > this.leniencyThreshold) {
        biasSignals.set(BiasType.LENIENCY, Math.min(deviation / 30, 1.0));
      }
    }

    // 2. Halo effect
    if (input.criteriaScores.length > 2) {
      const scores = input.criteriaScores.map(cs => cs.score);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const stddev = Math.sqrt(
        scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
      );

      if (stddev < this.haloEffectThreshold) {
        biasSignals.set(BiasType.HALO_EFFECT, 1 - stddev / this.haloEffectThreshold);
      }
    }

    // 3. Central tendency
    if (input.criteriaScores.length > 0) {
      const scores = input.criteriaScores.map(cs => cs.score);
      const centralCount = scores.filter(
        s => s >= this.centralTendencyRange.min && s <= this.centralTendencyRange.max
      ).length;

      if (centralCount === scores.length && scores.length > 3) {
        biasSignals.set(BiasType.CENTRAL_TENDENCY, 0.8);
      }
    }

    // 4. Score-feedback mismatch
    const feedbackSentiment = this.analyzeSentiment(input.strengths, input.areasForImprovement);
    const scoreSentiment =
      input.overallScore >= 70 ? 'positive' : input.overallScore < 50 ? 'negative' : 'neutral';

    if (feedbackSentiment !== scoreSentiment && feedbackSentiment !== 'neutral') {
      biasSignals.set(BiasType.SCORE_FEEDBACK_MISMATCH, 0.75);
    }

    // Determine primary bias
    if (biasSignals.size > 0) {
      let maxType = BiasType.NONE;
      let maxProbability = 0;

      biasSignals.forEach((prob, type) => {
        if (prob > maxProbability) {
          maxProbability = prob;
          maxType = type;
        }
      });

      return {
        biasDetected: maxProbability > 0.7,
        biasType: maxType,
        biasProbability: Math.round(maxProbability * 1000) / 1000,
        details: `Detected ${maxType} with ${Math.round(maxProbability * 100)}% confidence`,
      };
    }

    return {
      biasDetected: false,
      biasType: BiasType.NONE,
      biasProbability: 0,
    };
  }

  /**
   * Simple sentiment analysis
   */
  private analyzeSentiment(
    strengths: string,
    improvements: string
  ): 'positive' | 'negative' | 'neutral' {
    const positiveWords = [
      'excellent',
      'great',
      'good',
      'well',
      'clear',
      'clean',
      'efficient',
      'impressive',
      'solid',
      'strong',
      'elegant',
    ];
    const negativeWords = [
      'poor',
      'bad',
      'wrong',
      'error',
      'bug',
      'issue',
      'problem',
      'confusing',
      'unclear',
      'messy',
      'inefficient',
      'missing',
      'lacks',
      'weak',
    ];

    const text = `${strengths} ${improvements}`.toLowerCase();

    let positiveCount = positiveWords.filter(w => text.includes(w)).length;
    let negativeCount = negativeWords.filter(w => text.includes(w)).length;

    // Weight by section length
    if (strengths.length > improvements.length * 2) positiveCount += 2;
    if (improvements.length > strengths.length * 2) negativeCount += 2;

    if (positiveCount > negativeCount + 2) return 'positive';
    if (negativeCount > positiveCount + 2) return 'negative';
    return 'neutral';
  }

  /**
   * Generate feedback for the reviewer
   */
  private generateFeedback(metrics: ReviewQualityMetricsDto, bias: BiasAnalysisDto): string[] {
    const feedback: string[] = [];

    if (metrics.effortScore < 0.5) {
      feedback.push('Consider spending more time on each review for thorough analysis');
    }
    if (metrics.specificityScore < 0.5) {
      feedback.push('Reference specific parts of the submission in your feedback');
    }
    if (metrics.consistencyScore < 0.6) {
      feedback.push('Ensure your overall score aligns with individual criteria scores');
    }
    if (metrics.feedbackQualityScore < 0.5) {
      feedback.push('Provide more detailed, actionable suggestions for improvement');
    }
    if (metrics.rubricAlignmentScore < 0.6) {
      feedback.push('Include justification for each criterion score');
    }

    if (bias.biasDetected) {
      switch (bias.biasType) {
        case BiasType.HARSHNESS:
          feedback.push('Your scores trend lower than average - ensure objectivity');
          break;
        case BiasType.LENIENCY:
          feedback.push('Your scores trend higher than average - maintain critical analysis');
          break;
        case BiasType.HALO_EFFECT:
          feedback.push('Evaluate each criterion independently rather than giving similar scores');
          break;
        case BiasType.CENTRAL_TENDENCY:
          feedback.push("Don't hesitate to give high or low scores when warranted");
          break;
        case BiasType.SCORE_FEEDBACK_MISMATCH:
          feedback.push('Ensure your written feedback matches the scores you assign');
          break;
      }
    }

    return feedback.slice(0, 5);
  }
}

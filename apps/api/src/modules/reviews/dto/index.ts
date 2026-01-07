import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============ Enums ============

export enum ConfidenceLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ReviewStatus {
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  VALIDATED = 'VALIDATED',
  REJECTED = 'REJECTED',
}

export enum BiasType {
  HARSHNESS = 'harshness',
  LENIENCY = 'leniency',
  HALO_EFFECT = 'halo_effect',
  CENTRAL_TENDENCY = 'central_tendency',
  SCORE_FEEDBACK_MISMATCH = 'score_feedback_mismatch',
  NONE = 'none',
}

// ============ Request DTOs ============

export class CriterionScoreDto {
  @IsString()
  criterionId: string;

  @IsString()
  criterionName: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  weight: number;

  @IsString()
  @MinLength(10)
  justification: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  examples?: string[];
}

export class AssignReviewersDto {
  @IsUUID()
  submissionId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  numReviewers?: number = 3;
}

export class SubmitReviewDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterionScoreDto)
  criteriaScores: CriterionScoreDto[];

  @IsString()
  @MinLength(20)
  strengths: string;

  @IsString()
  @MinLength(20)
  areasForImprovement: string;

  @IsOptional()
  @IsString()
  suggestions?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  overallScore: number;

  @IsEnum(ConfidenceLevel)
  confidenceLevel: ConfidenceLevel;
}

export class UpdateReviewProgressDto {
  @IsOptional()
  @IsNumber()
  timeSpentSeconds?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reviewedSections?: string[];
}

export class GetReviewAssignmentsQueryDto {
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  offset?: number = 0;
}

export class GetPendingReviewsQueryDto {
  @IsOptional()
  @IsString()
  skillId?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  offset?: number = 0;
}

// ============ Response DTOs ============

export class ReviewAssignmentResponseDto {
  assignmentId: string;
  reviewerId: string;
  submissionId: string;
  deadline: Date;
  weight: number;
  status: ReviewStatus;
}

export class ReviewQualityMetricsDto {
  effortScore: number;
  specificityScore: number;
  consistencyScore: number;
  rubricAlignmentScore: number;
  feedbackQualityScore: number;
}

export class BiasAnalysisDto {
  biasDetected: boolean;
  biasType: BiasType;
  biasProbability: number;
  details?: string;
}

export class ReviewSubmissionResponseDto {
  reviewId: string;
  qualityScore: number;
  qualityMetrics: ReviewQualityMetricsDto;
  biasAnalysis: BiasAnalysisDto;
  isValid: boolean;
  reputationDelta: number;
  feedbackForReviewer: string[];
}

export class AggregatedScoreDto {
  submissionId: string;
  finalScore: number;
  aiScore: number;
  peerScore: number | null;
  aiWeight: number;
  peerWeight: number;
  confidence: number;
  needsHumanReview: boolean;
  validReviewsCount: number;
  totalReviewsCount: number;
}

export class ReviewerStatsDto {
  reviewerId: string;
  totalReviews: number;
  averageQualityScore: number;
  reputationScore: number;
  averageResponseTimeHours: number;
  biasFlags: number;
}

export class SubmissionForReviewDto {
  submissionId: string;
  challengeTitle: string;
  challengeType: string;
  skillName: string;
  submittedAt: Date;
  deadline: Date;
  assignmentId: string;
}

// ============ Admin DTOs ============

export class FlagReviewDto {
  @IsUUID()
  reviewId: string;

  @IsString()
  @MinLength(10)
  reason: string;

  @IsOptional()
  @IsBoolean()
  invalidateReview?: boolean;
}

export class ReviewAnomalyDto {
  anomalyType: string;
  confidence: number;
  affectedReviewIds: string[];
  affectedUserIds: string[];
  details: Record<string, unknown>;
}

export class AnomalyDetectionResponseDto {
  anomalies: ReviewAnomalyDto[];
  totalReviewsAnalyzed: number;
  flaggedReviewsCount: number;
  processingTimeMs: number;
}

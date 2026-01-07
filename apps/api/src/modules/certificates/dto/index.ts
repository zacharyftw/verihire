import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// =============================================================================
// REQUEST DTOs
// =============================================================================

export class GenerateCertificateDto {
  @ApiProperty({ description: 'Submission ID to generate certificate for' })
  @IsUUID()
  submissionId: string;
}

export class VerifyCertificateDto {
  @ApiPropertyOptional({ description: 'Certificate number (e.g., VH-2026-PYTH-00001)' })
  @IsOptional()
  @IsString()
  certificateNumber?: string;

  @ApiPropertyOptional({ description: 'Certificate hash for verification' })
  @IsOptional()
  @IsString()
  certificateHash?: string;
}

export enum DownloadFormat {
  PDF = 'pdf',
  JSON = 'json',
  IMAGE = 'image',
}

export class DownloadCertificateQueryDto {
  @ApiPropertyOptional({ enum: DownloadFormat, default: DownloadFormat.PDF })
  @IsOptional()
  @IsEnum(DownloadFormat)
  format?: DownloadFormat = DownloadFormat.PDF;
}

export class RevokeCertificateDto {
  @ApiProperty({ description: 'Certificate ID to revoke' })
  @IsUUID()
  certificateId: string;

  @ApiProperty({ description: 'Reason for revocation' })
  @IsString()
  reason: string;
}

export class ListCertificatesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by candidate ID' })
  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @ApiPropertyOptional({ description: 'Filter by skill ID' })
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @ApiPropertyOptional({ description: 'Include revoked certificates', default: false })
  @IsOptional()
  includeRevoked?: boolean;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

// =============================================================================
// RESPONSE DTOs
// =============================================================================

export class CriterionScoreDto {
  @ApiProperty()
  criterion: string;

  @ApiProperty()
  score: number;

  @ApiProperty()
  weight: number;
}

export class CandidateInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Hashed email for privacy' })
  emailHash: string;

  @ApiPropertyOptional()
  profileUrl?: string;
}

export class SkillInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty({ enum: ['beginner', 'intermediate', 'advanced', 'expert'] })
  level: string;
}

export class EvaluationInfoDto {
  @ApiProperty()
  challengeId: string;

  @ApiProperty()
  challengeTitle: string;

  @ApiProperty()
  score: number;

  @ApiPropertyOptional()
  percentile?: number;

  @ApiProperty()
  grade: string;

  @ApiProperty({ type: [CriterionScoreDto] })
  @ValidateNested({ each: true })
  @Type(() => CriterionScoreDto)
  criteriaScores: CriterionScoreDto[];

  @ApiPropertyOptional()
  aiScore?: number;

  @ApiPropertyOptional()
  peerScore?: number;

  @ApiPropertyOptional()
  confidence?: number;
}

export class VerificationInfoDto {
  @ApiProperty({ description: 'SHA-256 hash of certificate data' })
  hash: string;

  @ApiProperty({ description: 'ECDSA signature' })
  signature: string;

  @ApiProperty({ description: 'Issuer public key' })
  publicKey: string;

  @ApiPropertyOptional({ description: 'Blockchain transaction ID' })
  blockchainTxId?: string;

  @ApiPropertyOptional({ description: 'Blockchain network name' })
  blockchainNetwork?: string;

  @ApiProperty({ description: 'URL for certificate verification' })
  verificationUrl: string;
}

export class StorageInfoDto {
  @ApiPropertyOptional({ description: 'IPFS content hash' })
  ipfsHash?: string;

  @ApiPropertyOptional({ description: 'URL to download PDF' })
  pdfUrl?: string;

  @ApiPropertyOptional({ description: 'URL to shareable image' })
  imageUrl?: string;
}

export class MetadataInfoDto {
  @ApiProperty()
  issuer: string;

  @ApiPropertyOptional()
  issuerDid?: string;

  @ApiProperty()
  standard: string;
}

export class CertificateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Human-readable certificate number' })
  certificateNumber: string;

  @ApiProperty()
  version: string;

  @ApiProperty({ type: CandidateInfoDto })
  @ValidateNested()
  @Type(() => CandidateInfoDto)
  candidate: CandidateInfoDto;

  @ApiProperty({ type: SkillInfoDto })
  @ValidateNested()
  @Type(() => SkillInfoDto)
  skill: SkillInfoDto;

  @ApiProperty({ type: EvaluationInfoDto })
  @ValidateNested()
  @Type(() => EvaluationInfoDto)
  evaluation: EvaluationInfoDto;

  @ApiProperty()
  issuedAt: Date;

  @ApiPropertyOptional()
  expiresAt?: Date;

  @ApiPropertyOptional()
  revokedAt?: Date;

  @ApiPropertyOptional()
  revocationReason?: string;

  @ApiProperty({ type: VerificationInfoDto })
  @ValidateNested()
  @Type(() => VerificationInfoDto)
  verification: VerificationInfoDto;

  @ApiPropertyOptional({ type: StorageInfoDto })
  @ValidateNested()
  @Type(() => StorageInfoDto)
  storage?: StorageInfoDto;

  @ApiProperty({ type: MetadataInfoDto })
  @ValidateNested()
  @Type(() => MetadataInfoDto)
  metadata: MetadataInfoDto;
}

export class GenerateCertificateResponseDto {
  @ApiProperty()
  certificateId: string;

  @ApiProperty()
  certificateNumber: string;

  @ApiProperty({ enum: ['generated', 'pending_blockchain'] })
  status: 'generated' | 'pending_blockchain';

  @ApiPropertyOptional()
  pdfUrl?: string;

  @ApiPropertyOptional()
  shareableImageUrl?: string;

  @ApiProperty()
  verificationUrl: string;
}

export class VerificationStepDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  passed: boolean;

  @ApiProperty()
  details: string;
}

export class VerificationResultDto {
  @ApiProperty()
  valid: boolean;

  @ApiPropertyOptional({ type: CertificateResponseDto })
  certificate?: CertificateResponseDto;

  @ApiProperty({ type: [VerificationStepDto] })
  @ValidateNested({ each: true })
  @Type(() => VerificationStepDto)
  verificationSteps: VerificationStepDto[];

  @ApiProperty()
  verifiedAt: Date;

  @ApiPropertyOptional()
  error?: string;
}

export class CertificateListResponseDto {
  @ApiProperty({ type: [CertificateResponseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CertificateResponseDto)
  certificates: CertificateResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class CertificateStatsDto {
  @ApiProperty()
  totalCertificates: number;

  @ApiProperty()
  activeCertificates: number;

  @ApiProperty()
  revokedCertificates: number;

  @ApiProperty()
  expiredCertificates: number;

  @ApiProperty()
  certificatesThisMonth: number;

  @ApiProperty({ description: 'Average score across all certificates' })
  averageScore: number;
}

// =============================================================================
// INTERNAL TYPES (for service use)
// =============================================================================

export interface CertificateData {
  candidateId: string;
  candidateName: string;
  candidateEmailHash: string;
  skillId: string;
  skillName: string;
  skillCategory: string;
  skillLevel: string;
  challengeId: string;
  challengeTitle: string;
  submissionId: string;
  score: number;
  percentile?: number;
  grade: string;
  criteriaScores: CriterionScoreDto[];
  aiScore?: number;
  peerScore?: number;
  confidence?: number;
  issuedAt: Date;
  expiresAt?: Date;
}

export interface SignedCertificateData extends CertificateData {
  hash: string;
  signature: string;
  publicKey: string;
}

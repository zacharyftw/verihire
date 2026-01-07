import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@verihire/database';
import { CryptoService } from './crypto.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { QrCodeService } from './qrcode.service';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queue/queue.service';
import {
  CertificateData,
  CertificateResponseDto,
  GenerateCertificateResponseDto,
  CriterionScoreDto,
  CandidateInfoDto,
  SkillInfoDto,
  EvaluationInfoDto,
  VerificationInfoDto,
  MetadataInfoDto,
  StorageInfoDto,
  CertificateStatsDto,
  ListCertificatesQueryDto,
  CertificateListResponseDto,
} from './dto';

/**
 * Certificate Generation Service
 *
 * Handles the generation of tamper-proof digital certificates
 * with cryptographic signatures and verification URLs
 */
@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);
  private readonly baseUrl: string;
  private readonly issuerName = 'VeriHire Platform';
  private readonly certificateStandard = 'VeriHire Certificate v1';

  constructor(
    private readonly configService: ConfigService,
    private readonly cryptoService: CryptoService,
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly qrCodeService: QrCodeService,
    private readonly storageService: StorageService,
    private readonly queueService: QueueService
  ) {
    this.baseUrl = this.configService.get<string>('APP_URL', 'https://verihire.io');
  }

  /**
   * Generate a certificate for a completed submission
   */
  async generateCertificate(submissionId: string): Promise<GenerateCertificateResponseDto> {
    // 1. Fetch submission with all related data
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        candidate: {
          include: {
            user: true,
          },
        },
        challenge: {
          include: {
            skill: {
              include: {
                category: true,
              },
            },
          },
        },
        evaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // 2. Validate submission is evaluated
    if (submission.status !== 'EVALUATED') {
      throw new BadRequestException('Submission must be evaluated before generating certificate');
    }

    if (!submission.finalScore) {
      throw new BadRequestException('Submission does not have a final score');
    }

    // 3. Check if certificate already exists
    const existingCertificate = await prisma.certificate.findFirst({
      where: { submissionId },
    });

    if (existingCertificate) {
      throw new BadRequestException('Certificate already exists for this submission');
    }

    // 4. Check pass threshold
    const passThreshold = submission.challenge.skill?.passThreshold ?? 60;
    if (Number(submission.finalScore) < passThreshold) {
      throw new BadRequestException(
        `Score ${submission.finalScore} does not meet the pass threshold of ${passThreshold}`
      );
    }

    // 5. Build certificate data
    const candidateName = [submission.candidate.user.firstName, submission.candidate.user.lastName]
      .filter(Boolean)
      .join(' ');

    const skillCategory = submission.challenge.skill?.category?.name ?? 'General';
    const skillLevel = this.determineSkillLevel(Number(submission.finalScore));

    const criteriaScores = this.extractCriteriaScores(submission.evaluations[0]?.criteriaScores);

    const certificateData: CertificateData = {
      candidateId: submission.candidateId,
      candidateName: candidateName || 'Unknown',
      candidateEmailHash: this.cryptoService.hashEmail(submission.candidate.user.email),
      skillId: submission.challenge.skillId!,
      skillName: submission.challenge.skill?.name ?? 'Unknown Skill',
      skillCategory,
      skillLevel,
      challengeId: submission.challengeId,
      challengeTitle: submission.challenge.title,
      submissionId: submission.id,
      score: Number(submission.finalScore),
      percentile: submission.percentile ? Number(submission.percentile) : undefined,
      grade: this.scoreToGrade(Number(submission.finalScore)),
      criteriaScores,
      aiScore: submission.aiScore ? Number(submission.aiScore) : undefined,
      peerScore: submission.peerScore ? Number(submission.peerScore) : undefined,
      confidence: submission.evaluations[0]?.confidence
        ? Number(submission.evaluations[0].confidence)
        : undefined,
      issuedAt: new Date(),
      expiresAt: this.calculateExpiry(submission.challenge.skill?.certificationValidityMonths),
    };

    // 6. Generate certificate number
    const certificateNumber = await this.generateCertificateNumber(
      submission.challenge.skill?.slug ?? 'GENL'
    );

    // 7. Create cryptographic hash
    const hash = this.cryptoService.hashCertificateData(certificateData);

    // 8. Sign certificate
    const signature = this.cryptoService.sign(hash);
    const publicKey = this.cryptoService.getPublicKeyHex();

    // 9. Create verification URL
    const verificationUrl = `${this.baseUrl}/verify/${certificateNumber}`;

    // 10. Store certificate in database
    const certificate = await prisma.certificate.create({
      data: {
        certificateNumber,
        version: '1.0',
        candidateId: submission.candidateId,
        skillId: submission.challenge.skillId!,
        challengeId: submission.challengeId,
        submissionId: submission.id,
        finalScore: submission.finalScore,
        percentile: submission.percentile,
        grade: certificateData.grade,
        aiScore: submission.aiScore,
        peerScore: submission.peerScore,
        confidence: submission.evaluations[0]?.confidence,
        criteriaScores: JSON.parse(JSON.stringify(criteriaScores)),
        hash,
        signature,
        publicKey,
        verificationUrl,
        issuedAt: certificateData.issuedAt,
        expiresAt: certificateData.expiresAt,
        metadata: {
          issuer: this.issuerName,
          standard: this.certificateStandard,
          skillLevel,
          skillCategory,
        },
      },
    });

    // 11. Update candidate stats
    await prisma.candidateProfile.update({
      where: { id: submission.candidateId },
      data: {
        certificatesCount: { increment: 1 },
      },
    });

    // 12. Update skill stats
    await prisma.skill.update({
      where: { id: submission.challenge.skillId! },
      data: {
        totalCertifications: { increment: 1 },
      },
    });

    this.logger.log(`Generated certificate ${certificateNumber} for submission ${submissionId}`);

    // Queue blockchain anchoring if enabled
    if (this.configService.get('FEATURE_BLOCKCHAIN_ENABLED') === 'true') {
      await this.queueService.addCertificateJob({
        type: 'anchor-blockchain',
        certificateId: certificate.id,
        data: {
          certificateNumber: certificate.certificateNumber,
          hash,
        },
      });
    }

    return {
      certificateId: certificate.id,
      certificateNumber: certificate.certificateNumber,
      status: 'generated',
      verificationUrl,
    };
  }

  /**
   * Get certificate by ID
   */
  async getCertificateById(id: string): Promise<CertificateResponseDto> {
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      include: {
        candidate: {
          include: { user: true },
        },
        skill: {
          include: { category: true },
        },
        challenge: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return this.mapToCertificateResponse(certificate);
  }

  /**
   * Get certificate by certificate number
   */
  async getCertificateByNumber(certificateNumber: string): Promise<CertificateResponseDto> {
    const certificate = await prisma.certificate.findUnique({
      where: { certificateNumber },
      include: {
        candidate: {
          include: { user: true },
        },
        skill: {
          include: { category: true },
        },
        challenge: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return this.mapToCertificateResponse(certificate);
  }

  /**
   * List certificates with filtering
   */
  async listCertificates(query: ListCertificatesQueryDto): Promise<CertificateListResponseDto> {
    const { candidateId, skillId, includeRevoked, page = 1, limit = 20 } = query;

    const where: Record<string, unknown> = {};

    if (candidateId) {
      where.candidateId = candidateId;
    }

    if (skillId) {
      where.skillId = skillId;
    }

    if (!includeRevoked) {
      where.revokedAt = null;
    }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        include: {
          candidate: {
            include: { user: true },
          },
          skill: {
            include: { category: true },
          },
          challenge: true,
        },
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.certificate.count({ where }),
    ]);

    return {
      certificates: certificates.map(cert => this.mapToCertificateResponse(cert)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get certificates for a candidate
   */
  async getCandidateCertificates(candidateId: string): Promise<CertificateResponseDto[]> {
    const certificates = await prisma.certificate.findMany({
      where: {
        candidateId,
        revokedAt: null,
      },
      include: {
        candidate: {
          include: { user: true },
        },
        skill: {
          include: { category: true },
        },
        challenge: true,
      },
      orderBy: { issuedAt: 'desc' },
    });

    return certificates.map(cert => this.mapToCertificateResponse(cert));
  }

  /**
   * Generate PDF for certificate and upload to storage
   */
  async generatePdf(certificateId: string): Promise<Buffer> {
    const certificate = await this.getCertificateById(certificateId);
    const pdfBuffer = await this.pdfGeneratorService.generatePdf(certificate);

    // Upload to storage
    try {
      const uploadResult = await this.storageService.uploadCertificatePdf(certificateId, pdfBuffer);

      // Update certificate with PDF URL
      await prisma.certificate.update({
        where: { id: certificateId },
        data: { pdfUrl: uploadResult.url },
      });

      this.logger.log(`Certificate PDF uploaded: ${uploadResult.url}`);
    } catch (error) {
      this.logger.warn(`Failed to upload PDF to storage: ${error}`);
      // Continue without failing - PDF is still returned
    }

    return pdfBuffer;
  }

  /**
   * Generate shareable image for certificate and upload to storage
   */
  async generateImage(certificateId: string): Promise<Buffer> {
    const certificate = await this.getCertificateById(certificateId);
    const imageBuffer = await this.pdfGeneratorService.generateShareableImage(certificate);

    // Upload to storage
    try {
      const uploadResult = await this.storageService.uploadCertificateImage(
        certificateId,
        imageBuffer
      );

      // Update certificate with image URL
      await prisma.certificate.update({
        where: { id: certificateId },
        data: { imageUrl: uploadResult.url },
      });

      this.logger.log(`Certificate image uploaded: ${uploadResult.url}`);
    } catch (error) {
      this.logger.warn(`Failed to upload image to storage: ${error}`);
      // Continue without failing - image is still returned
    }

    return imageBuffer;
  }

  /**
   * Get certificate JSON data
   */
  async getCertificateJson(certificateId: string): Promise<CertificateResponseDto> {
    return this.getCertificateById(certificateId);
  }

  /**
   * Get certificate statistics
   */
  async getStats(): Promise<CertificateStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalCertificates,
      revokedCertificates,
      expiredCertificates,
      certificatesThisMonth,
      avgScore,
    ] = await Promise.all([
      prisma.certificate.count(),
      prisma.certificate.count({
        where: { revokedAt: { not: null } },
      }),
      prisma.certificate.count({
        where: {
          expiresAt: { lt: now },
          revokedAt: null,
        },
      }),
      prisma.certificate.count({
        where: {
          issuedAt: { gte: startOfMonth },
        },
      }),
      prisma.certificate.aggregate({
        _avg: { finalScore: true },
        where: { revokedAt: null },
      }),
    ]);

    return {
      totalCertificates,
      activeCertificates: totalCertificates - revokedCertificates - expiredCertificates,
      revokedCertificates,
      expiredCertificates,
      certificatesThisMonth,
      averageScore: avgScore._avg.finalScore ? Number(avgScore._avg.finalScore) : 0,
    };
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Generate unique certificate number
   * Format: VH-YYYY-SKILL-XXXXX
   */
  private async generateCertificateNumber(skillSlug: string): Promise<string> {
    const year = new Date().getFullYear();
    const skillCode = skillSlug.toUpperCase().substring(0, 4);

    // Get count of certificates for this skill this year
    const count = await prisma.certificate.count({
      where: {
        certificateNumber: {
          startsWith: `VH-${year}-${skillCode}`,
        },
      },
    });

    const sequence = (count + 1).toString().padStart(5, '0');
    return `VH-${year}-${skillCode}-${sequence}`;
  }

  /**
   * Convert score to letter grade
   */
  private scoreToGrade(score: number): string {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'A-';
    if (score >= 75) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 65) return 'B-';
    if (score >= 60) return 'C+';
    if (score >= 55) return 'C';
    if (score >= 50) return 'C-';
    return 'F';
  }

  /**
   * Determine skill level based on score
   */
  private determineSkillLevel(score: number): string {
    if (score >= 90) return 'expert';
    if (score >= 75) return 'advanced';
    if (score >= 60) return 'intermediate';
    return 'beginner';
  }

  /**
   * Calculate certificate expiry date
   */
  private calculateExpiry(validityMonths?: number | null): Date | undefined {
    if (!validityMonths) return undefined;

    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + validityMonths);
    return expiry;
  }

  /**
   * Extract criteria scores from evaluation
   */
  private extractCriteriaScores(criteriaScores: unknown): CriterionScoreDto[] {
    if (!criteriaScores || typeof criteriaScores !== 'object') {
      return [];
    }

    if (Array.isArray(criteriaScores)) {
      return criteriaScores.map((item: Record<string, unknown>) => ({
        criterion: String(item.criterion || item.name || 'Unknown'),
        score: Number(item.score || 0),
        weight: Number(item.weight || 1),
      }));
    }

    // Handle object format
    return Object.entries(criteriaScores as Record<string, unknown>).map(([criterion, value]) => ({
      criterion,
      score: typeof value === 'number' ? value : Number(value) || 0,
      weight: 1,
    }));
  }

  /**
   * Map database certificate to response DTO
   */
  private mapToCertificateResponse(certificate: {
    id: string;
    certificateNumber: string;
    version: string;
    candidate: {
      id: string;
      user: {
        firstName: string | null;
        lastName: string | null;
        email: string;
      };
    };
    skill: {
      id: string;
      name: string;
      category: { name: string } | null;
    };
    challenge: {
      id: string;
      title: string;
    };
    finalScore: unknown;
    percentile: unknown;
    grade: string;
    criteriaScores: unknown;
    aiScore: unknown;
    peerScore: unknown;
    confidence: unknown;
    hash: string;
    signature: string;
    publicKey: string;
    blockchainTxId: string | null;
    blockchainNetwork: string | null;
    verificationUrl: string;
    ipfsHash: string | null;
    pdfUrl: string | null;
    imageUrl: string | null;
    issuedAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
    revocationReason: string | null;
    metadata: unknown;
  }): CertificateResponseDto {
    const metadata = (certificate.metadata || {}) as Record<string, unknown>;

    const candidate: CandidateInfoDto = {
      id: certificate.candidate.id,
      name: [certificate.candidate.user.firstName, certificate.candidate.user.lastName]
        .filter(Boolean)
        .join(' '),
      emailHash: this.cryptoService.hashEmail(certificate.candidate.user.email),
      profileUrl: `${this.baseUrl}/candidates/${certificate.candidate.id}`,
    };

    const skill: SkillInfoDto = {
      id: certificate.skill.id,
      name: certificate.skill.name,
      category: certificate.skill.category?.name ?? 'General',
      level: (metadata.skillLevel as string) ?? 'intermediate',
    };

    const evaluation: EvaluationInfoDto = {
      challengeId: certificate.challenge.id,
      challengeTitle: certificate.challenge.title,
      score: Number(certificate.finalScore),
      percentile: certificate.percentile ? Number(certificate.percentile) : undefined,
      grade: certificate.grade,
      criteriaScores: this.extractCriteriaScores(certificate.criteriaScores),
      aiScore: certificate.aiScore ? Number(certificate.aiScore) : undefined,
      peerScore: certificate.peerScore ? Number(certificate.peerScore) : undefined,
      confidence: certificate.confidence ? Number(certificate.confidence) : undefined,
    };

    const verification: VerificationInfoDto = {
      hash: certificate.hash,
      signature: certificate.signature,
      publicKey: certificate.publicKey,
      blockchainTxId: certificate.blockchainTxId ?? undefined,
      blockchainNetwork: certificate.blockchainNetwork ?? undefined,
      verificationUrl: certificate.verificationUrl,
    };

    const storage: StorageInfoDto = {
      ipfsHash: certificate.ipfsHash ?? undefined,
      pdfUrl: certificate.pdfUrl ?? undefined,
      imageUrl: certificate.imageUrl ?? undefined,
    };

    const metadataInfo: MetadataInfoDto = {
      issuer: (metadata.issuer as string) ?? this.issuerName,
      standard: (metadata.standard as string) ?? this.certificateStandard,
    };

    return {
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      version: certificate.version,
      candidate,
      skill,
      evaluation,
      issuedAt: certificate.issuedAt,
      expiresAt: certificate.expiresAt ?? undefined,
      revokedAt: certificate.revokedAt ?? undefined,
      revocationReason: certificate.revocationReason ?? undefined,
      verification,
      storage,
      metadata: metadataInfo,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@verihire/database';
import { CryptoService } from './crypto.service';
import { CertificatesService } from './certificates.service';
import { VerificationResultDto, VerificationStepDto, VerifyCertificateDto } from './dto';
import { BlockchainService } from '../blockchain/blockchain.service';

/**
 * Certificate Verification Service
 *
 * Handles multi-step verification of certificate authenticity
 * including hash integrity, signature verification, and blockchain checks
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly certificatesService: CertificatesService,
    private readonly blockchainService: BlockchainService
  ) {}

  /**
   * Verify certificate authenticity through multiple checks
   */
  async verify(dto: VerifyCertificateDto): Promise<VerificationResultDto> {
    const { certificateNumber, certificateHash } = dto;

    if (!certificateNumber && !certificateHash) {
      return {
        valid: false,
        verificationSteps: [],
        verifiedAt: new Date(),
        error: 'Must provide certificate_number or certificate_hash',
      };
    }

    // 1. Retrieve certificate
    let certificate;
    try {
      if (certificateNumber) {
        certificate = await prisma.certificate.findUnique({
          where: { certificateNumber },
          include: {
            candidate: { include: { user: true } },
            skill: { include: { category: true } },
            challenge: true,
          },
        });
      } else if (certificateHash) {
        certificate = await prisma.certificate.findFirst({
          where: { hash: certificateHash },
          include: {
            candidate: { include: { user: true } },
            skill: { include: { category: true } },
            challenge: true,
          },
        });
      }
    } catch (error) {
      this.logger.error('Error retrieving certificate', error);
      return {
        valid: false,
        verificationSteps: [],
        verifiedAt: new Date(),
        error: 'Error retrieving certificate',
      };
    }

    if (!certificate) {
      return {
        valid: false,
        verificationSteps: [
          {
            name: 'Certificate Lookup',
            passed: false,
            details: 'Certificate not found in registry',
          },
        ],
        verifiedAt: new Date(),
        error: 'Certificate not found',
      };
    }

    const verificationSteps: VerificationStepDto[] = [];

    // 2. Verify hash integrity
    const hashStep = await this.verifyHashIntegrity(certificate);
    verificationSteps.push(hashStep);

    // 3. Verify digital signature
    const signatureStep = this.verifySignature(certificate);
    verificationSteps.push(signatureStep);

    // 4. Verify blockchain anchor (if available)
    if (certificate.blockchainTxId) {
      const blockchainStep = await this.verifyBlockchain(certificate);
      verificationSteps.push(blockchainStep);
    }

    // 5. Check expiry
    if (certificate.expiresAt) {
      const expiryStep = this.verifyExpiry(certificate.expiresAt);
      verificationSteps.push(expiryStep);
    }

    // 6. Check revocation status
    const revocationStep = this.verifyRevocation(certificate);
    verificationSteps.push(revocationStep);

    // Overall result
    const allPassed = verificationSteps.every(step => step.passed);

    let certificateResponse;
    try {
      certificateResponse = await this.certificatesService.getCertificateById(certificate.id);
    } catch {
      // If we can't get the full response, continue without it
    }

    return {
      valid: allPassed,
      certificate: certificateResponse,
      verificationSteps,
      verifiedAt: new Date(),
    };
  }

  /**
   * Quick verification - just checks if certificate exists and is valid
   */
  async quickVerify(certificateNumber: string): Promise<{ valid: boolean; reason?: string }> {
    const certificate = await prisma.certificate.findUnique({
      where: { certificateNumber },
    });

    if (!certificate) {
      return { valid: false, reason: 'Certificate not found' };
    }

    if (certificate.revokedAt) {
      return { valid: false, reason: 'Certificate has been revoked' };
    }

    if (certificate.expiresAt && certificate.expiresAt < new Date()) {
      return { valid: false, reason: 'Certificate has expired' };
    }

    // Verify signature
    const signatureValid = this.cryptoService.verifySignature(
      certificate.hash,
      certificate.signature,
      certificate.publicKey
    );

    if (!signatureValid) {
      return { valid: false, reason: 'Invalid signature' };
    }

    return { valid: true };
  }

  // ==========================================================================
  // PRIVATE VERIFICATION METHODS
  // ==========================================================================

  private async verifyHashIntegrity(certificate: {
    hash: string;
    candidateId: string;
    skillId: string | null;
    challengeId: string | null;
    submissionId: string | null;
    finalScore: unknown;
    percentile: unknown;
    grade: string;
    criteriaScores: unknown;
    aiScore: unknown;
    peerScore: unknown;
    confidence: unknown;
    issuedAt: Date;
    expiresAt: Date | null;
    candidate: { user: { email: string; firstName: string | null; lastName: string | null } };
    skill: { name: string; category: { name: string } | null } | null;
    challenge: { title: string } | null;
  }): Promise<VerificationStepDto> {
    try {
      // Reconstruct the certificate data that was hashed
      const candidateName = [
        certificate.candidate.user.firstName,
        certificate.candidate.user.lastName,
      ]
        .filter(Boolean)
        .join(' ');

      const certificateData = {
        candidateId: certificate.candidateId,
        candidateName: candidateName || 'Unknown',
        candidateEmailHash: this.cryptoService.hashEmail(certificate.candidate.user.email),
        skillId: certificate.skillId as string,
        skillName: certificate.skill?.name ?? 'Unknown Skill',
        skillCategory: certificate.skill?.category?.name ?? 'General',
        skillLevel: this.determineSkillLevel(Number(certificate.finalScore)),
        challengeId: certificate.challengeId ?? '',
        challengeTitle: certificate.challenge?.title ?? '',
        submissionId: certificate.submissionId ?? '',
        score: Number(certificate.finalScore),
        percentile: certificate.percentile ? Number(certificate.percentile) : undefined,
        grade: certificate.grade,
        criteriaScores: this.extractCriteriaScores(certificate.criteriaScores),
        aiScore: certificate.aiScore ? Number(certificate.aiScore) : undefined,
        peerScore: certificate.peerScore ? Number(certificate.peerScore) : undefined,
        confidence: certificate.confidence ? Number(certificate.confidence) : undefined,
        issuedAt: certificate.issuedAt,
        expiresAt: certificate.expiresAt ?? undefined,
      };

      const computedHash = this.cryptoService.hashCertificateData(certificateData);
      const hashValid = computedHash === certificate.hash;

      return {
        name: 'Hash Integrity',
        passed: hashValid,
        details: hashValid
          ? 'Certificate data has not been tampered with'
          : 'Hash mismatch detected - data may have been altered',
      };
    } catch (error) {
      this.logger.error('Hash verification failed', error);
      return {
        name: 'Hash Integrity',
        passed: false,
        details: 'Unable to verify hash integrity',
      };
    }
  }

  private verifySignature(certificate: {
    hash: string;
    signature: string;
    publicKey: string;
  }): VerificationStepDto {
    try {
      // Try with stored public key first; if it can't be parsed (legacy certs store
      // a raw 32-byte value instead of a full SPKI DER key), fall back to the
      // issuer's current key so the certificate still verifies correctly.
      let signatureValid = false;
      let usedFallback = false;

      try {
        signatureValid = this.cryptoService.verifySignature(
          certificate.hash,
          certificate.signature,
          certificate.publicKey
        );
      } catch {
        // Stored key is not a valid SPKI DER — verify against issuer key
        signatureValid = this.cryptoService.verifySignature(
          certificate.hash,
          certificate.signature
        );
        usedFallback = true;
      }

      return {
        name: 'Digital Signature',
        passed: signatureValid,
        details: signatureValid
          ? usedFallback
            ? 'Digital signature verified against issuer key'
            : 'Digital signature verified successfully'
          : 'Invalid digital signature',
      };
    } catch (error) {
      this.logger.error('Signature verification failed', error);
      return {
        name: 'Digital Signature',
        passed: false,
        details: 'Unable to verify digital signature',
      };
    }
  }

  private async verifyBlockchain(certificate: {
    blockchainTxId: string | null;
    blockchainNetwork: string | null;
    hash: string;
    certificateNumber: string;
  }): Promise<VerificationStepDto> {
    if (!certificate.blockchainTxId) {
      return {
        name: 'Blockchain Verification',
        passed: true,
        details: 'Certificate not yet anchored on blockchain',
      };
    }

    try {
      const result = await this.blockchainService.verifyCertificate(certificate.certificateNumber);

      if (!result.exists) {
        return {
          name: 'Blockchain Verification',
          passed: false,
          details: 'Certificate not found on blockchain',
        };
      }

      const hashMatch = result.onChainHash.toLowerCase() === `0x${certificate.hash}`.toLowerCase();

      return {
        name: 'Blockchain Verification',
        passed: hashMatch,
        details: hashMatch
          ? `Certificate anchored on ${certificate.blockchainNetwork} (TX: ${certificate.blockchainTxId.substring(0, 10)}...)`
          : 'Blockchain hash mismatch',
      };
    } catch (error) {
      this.logger.error('Blockchain verification failed', error);
      return {
        name: 'Blockchain Verification',
        passed: false,
        details: 'Unable to verify on blockchain',
      };
    }
  }

  private verifyExpiry(expiresAt: Date): VerificationStepDto {
    const now = new Date();
    const notExpired = expiresAt > now;

    return {
      name: 'Expiry Check',
      passed: notExpired,
      details: notExpired
        ? `Certificate valid until ${expiresAt.toLocaleDateString()}`
        : `Certificate expired on ${expiresAt.toLocaleDateString()}`,
    };
  }

  private verifyRevocation(certificate: {
    revokedAt: Date | null;
    revocationReason: string | null;
  }): VerificationStepDto {
    const notRevoked = certificate.revokedAt === null;

    return {
      name: 'Revocation Check',
      passed: notRevoked,
      details: notRevoked
        ? 'Certificate is active and has not been revoked'
        : `Certificate revoked on ${certificate.revokedAt?.toLocaleDateString()}: ${certificate.revocationReason || 'No reason provided'}`,
    };
  }

  private determineSkillLevel(score: number): string {
    if (score >= 90) return 'expert';
    if (score >= 75) return 'advanced';
    if (score >= 60) return 'intermediate';
    return 'beginner';
  }

  /**
   * Extract criteria scores from stored JSON
   */
  private extractCriteriaScores(
    criteriaScores: unknown
  ): { criterion: string; score: number; weight: number }[] {
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

    return Object.entries(criteriaScores as Record<string, unknown>).map(([criterion, value]) => ({
      criterion,
      score: typeof value === 'number' ? value : Number(value) || 0,
      weight: 1,
    }));
  }
}

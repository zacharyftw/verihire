import { Injectable, Logger } from '@nestjs/common';
import { prisma, SkillLevel } from '@verihire/database';
import { randomBytes, createHash } from 'crypto';

export interface CertificateData {
  candidateId: string;
  skillId: string;
  challengeId: string;
  submissionId: string;
  finalScore: number;
  aiScore: number;
  peerScore?: number;
  criteriaScores: Record<string, { score: number; maxScore: number }>;
  confidence: number;
  domainTag?: string;
  domainLevel?: string;
}

export interface GeneratedCertificate {
  id: string;
  certificateNumber: string;
  grade: string;
  finalScore: number;
  verificationUrl: string;
}

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  // Minimum passing score (70%)
  private readonly PASSING_SCORE = 70;

  /**
   * Check if a score qualifies for certification
   */
  isPassing(score: number): boolean {
    return score >= this.PASSING_SCORE;
  }

  /**
   * Calculate grade from score
   */
  calculateGrade(score: number): string {
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 67) return 'D+';
    if (score >= 63) return 'D';
    if (score >= 60) return 'D-';
    return 'F';
  }

  /**
   * Generate a unique certificate number
   */
  generateCertificateNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = randomBytes(4).toString('hex').toUpperCase();
    return `VH-${timestamp}-${random}`;
  }

  /**
   * Generate a certificate for a passing submission
   */
  async generateCertificate(data: CertificateData): Promise<GeneratedCertificate | null> {
    if (!this.isPassing(data.finalScore)) {
      this.logger.log(
        `Score ${data.finalScore} does not meet passing threshold of ${this.PASSING_SCORE}`
      );
      return null;
    }

    // Check if certificate already exists for this submission
    const existing = await prisma.certificate.findFirst({
      where: { submissionId: data.submissionId },
    });

    if (existing) {
      this.logger.log(`Certificate already exists for submission ${data.submissionId}`);
      return {
        id: existing.id,
        certificateNumber: existing.certificateNumber,
        grade: existing.grade,
        finalScore: Number(existing.finalScore),
        verificationUrl: this.getVerificationUrl(existing.certificateNumber),
      };
    }

    // Calculate percentile (would need more data in production)
    const percentile = await this.calculatePercentile(data.skillId, data.finalScore);

    // Generate certificate
    const certificateNumber = this.generateCertificateNumber();
    const grade = this.calculateGrade(data.finalScore);

    try {
      // Generate cryptographic data for verification
      const hash = createHash('sha256')
        .update(`${certificateNumber}:${data.candidateId}:${data.skillId}:${data.finalScore}`)
        .digest('hex');

      // In production, these would be actual cryptographic signatures
      const signature = randomBytes(64).toString('hex');
      const publicKey = randomBytes(32).toString('hex');
      const verificationUrl = this.getVerificationUrl(certificateNumber);

      const certificate = await prisma.certificate.create({
        data: {
          certificateNumber,
          candidateId: data.candidateId,
          skillId: data.skillId,
          challengeId: data.challengeId,
          submissionId: data.submissionId,
          finalScore: data.finalScore,
          aiScore: data.aiScore,
          peerScore: data.peerScore,
          criteriaScores: data.criteriaScores,
          confidence: data.confidence,
          percentile,
          grade,
          issuedAt: new Date(),
          expiresAt: this.calculateExpiryDate(),
          hash,
          signature,
          publicKey,
          verificationUrl,
          metadata: data.domainTag
            ? {
                domainTag: data.domainTag,
                domainLevel: data.domainLevel || grade,
                certificateType: 'DOMAIN',
                title: `Certified ${data.domainTag} Developer — ${data.domainLevel || grade}`,
              }
            : { certificateType: 'CHALLENGE' },
        },
      });

      this.logger.log(
        `Certificate ${certificateNumber} generated for submission ${data.submissionId}`
      );

      // Update candidate's skill level if they have this skill
      await this.updateCandidateSkillLevel(data.candidateId, data.skillId, certificate.id, grade);

      return {
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
        grade: certificate.grade,
        finalScore: Number(certificate.finalScore),
        verificationUrl: this.getVerificationUrl(certificate.certificateNumber),
      };
    } catch (error) {
      this.logger.error(`Failed to generate certificate: ${error}`);
      throw error;
    }
  }

  /**
   * Verify a certificate by its number
   */
  async verifyCertificate(certificateNumber: string) {
    const certificate = await prisma.certificate.findUnique({
      where: { certificateNumber },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        skill: {
          select: {
            name: true,
            slug: true,
            category: true,
          },
        },
        challenge: {
          select: {
            title: true,
            difficulty: true,
          },
        },
      },
    });

    if (!certificate) {
      return null;
    }

    const isValid = !certificate.revokedAt && this.isNotExpired(certificate.expiresAt);

    return {
      valid: isValid,
      certificate: {
        certificateNumber: certificate.certificateNumber,
        issuedAt: certificate.issuedAt,
        expiresAt: certificate.expiresAt,
        revokedAt: certificate.revokedAt,
        grade: certificate.grade,
        finalScore: Number(certificate.finalScore),
        percentile: certificate.percentile ? Number(certificate.percentile) : null,
        candidate: {
          name: `${certificate.candidate.user.firstName} ${certificate.candidate.user.lastName}`,
        },
        skill: certificate.skill,
        challenge: {
          title: certificate.challenge.title,
          difficulty: certificate.challenge.difficulty,
        },
      },
    };
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(certificateNumber: string, reason: string) {
    const certificate = await prisma.certificate.update({
      where: { certificateNumber },
      data: {
        revokedAt: new Date(),
        revocationReason: reason,
      },
    });

    this.logger.log(`Certificate ${certificateNumber} revoked: ${reason}`);
    return certificate;
  }

  /**
   * Get certificates for a candidate
   */
  async getCandidateCertificates(candidateId: string) {
    const certificates = await prisma.certificate.findMany({
      where: {
        candidateId,
        revokedAt: null,
      },
      include: {
        skill: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
          },
        },
        challenge: {
          select: {
            title: true,
            difficulty: true,
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });

    return certificates.map(cert => ({
      id: cert.id,
      certificateNumber: cert.certificateNumber,
      skill: cert.skill,
      challenge: cert.challenge,
      grade: cert.grade,
      finalScore: Number(cert.finalScore),
      percentile: cert.percentile ? Number(cert.percentile) : null,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      isValid: this.isNotExpired(cert.expiresAt),
      verificationUrl: this.getVerificationUrl(cert.certificateNumber),
    }));
  }

  private async calculatePercentile(skillId: string, score: number): Promise<number> {
    // Count how many submissions for this skill scored lower
    const totalCount = await prisma.certificate.count({
      where: { skillId },
    });

    if (totalCount === 0) {
      return 100; // First certificate gets 100th percentile
    }

    const lowerCount = await prisma.certificate.count({
      where: {
        skillId,
        finalScore: { lt: score },
      },
    });

    return Math.round((lowerCount / totalCount) * 100);
  }

  private calculateExpiryDate(): Date {
    // Certificates expire in 2 years
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 2);
    return expiry;
  }

  private getVerificationUrl(certificateNumber: string): string {
    // In production, this would be the actual verification URL
    return `https://verihire.com/verify/${certificateNumber}`;
  }

  private isNotExpired(expiresAt: Date | null): boolean {
    if (!expiresAt) return true;
    return new Date() < new Date(expiresAt);
  }

  private async updateCandidateSkillLevel(
    candidateId: string,
    skillId: string,
    certificateId: string,
    grade: string
  ) {
    // Map grade to skill level
    const levelMap: Record<string, SkillLevel> = {
      'A+': 'EXPERT',
      A: 'EXPERT',
      'A-': 'ADVANCED',
      'B+': 'ADVANCED',
      B: 'ADVANCED',
      'B-': 'INTERMEDIATE',
      'C+': 'INTERMEDIATE',
      C: 'INTERMEDIATE',
      'C-': 'BEGINNER',
    };

    const level: SkillLevel = levelMap[grade] || 'BEGINNER';

    // Check if candidate has this skill
    const existingSkill = await prisma.candidateSkill.findFirst({
      where: { candidateId, skillId },
    });

    if (existingSkill) {
      // Update with certificate
      await prisma.candidateSkill.update({
        where: { id: existingSkill.id },
        data: {
          level,
          certificateId,
          verified: true,
          verificationDate: new Date(),
        },
      });
    } else {
      // Add skill with certificate
      await prisma.candidateSkill.create({
        data: {
          candidateId,
          skillId,
          level,
          certificateId,
          verified: true,
          verificationDate: new Date(),
        },
      });
    }

    this.logger.log(`Updated candidate ${candidateId} skill ${skillId} to level ${level}`);
  }
}

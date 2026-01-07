import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@verihire/database';

/**
 * Certificate Revocation Service
 *
 * Handles certificate revocation and status management
 */
@Injectable()
export class RevocationService {
  private readonly logger = new Logger(RevocationService.name);

  /**
   * Revoke a certificate
   */
  async revokeCertificate(
    certificateId: string,
    reason: string,
    revokedBy?: string
  ): Promise<void> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    if (certificate.revokedAt) {
      throw new BadRequestException('Certificate is already revoked');
    }

    await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        revokedAt: new Date(),
        revocationReason: reason,
        metadata: {
          ...(certificate.metadata as Record<string, unknown>),
          revokedBy,
          revocationDate: new Date().toISOString(),
        },
      },
    });

    // Update candidate's certificate count
    await prisma.candidateProfile.update({
      where: { id: certificate.candidateId },
      data: {
        certificatesCount: { decrement: 1 },
      },
    });

    // Update skill's certification count
    await prisma.skill.update({
      where: { id: certificate.skillId },
      data: {
        totalCertifications: { decrement: 1 },
      },
    });

    this.logger.log(`Certificate ${certificate.certificateNumber} revoked: ${reason}`);
  }

  /**
   * Revoke certificate by certificate number
   */
  async revokeByCertificateNumber(
    certificateNumber: string,
    reason: string,
    revokedBy?: string
  ): Promise<void> {
    const certificate = await prisma.certificate.findUnique({
      where: { certificateNumber },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    await this.revokeCertificate(certificate.id, reason, revokedBy);
  }

  /**
   * Check if a certificate is revoked
   */
  async isRevoked(certificateId: string): Promise<boolean> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      select: { revokedAt: true },
    });

    return certificate?.revokedAt !== null;
  }

  /**
   * Reinstate a revoked certificate (admin only)
   */
  async reinstateCertificate(
    certificateId: string,
    reinstatedBy: string,
    reason: string
  ): Promise<void> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    if (!certificate.revokedAt) {
      throw new BadRequestException('Certificate is not revoked');
    }

    // Check if certificate has expired
    if (certificate.expiresAt && certificate.expiresAt < new Date()) {
      throw new BadRequestException('Cannot reinstate an expired certificate');
    }

    await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        revokedAt: null,
        revocationReason: null,
        metadata: {
          ...(certificate.metadata as Record<string, unknown>),
          reinstatedBy,
          reinstatedAt: new Date().toISOString(),
          reinstateReason: reason,
        },
      },
    });

    // Update candidate's certificate count
    await prisma.candidateProfile.update({
      where: { id: certificate.candidateId },
      data: {
        certificatesCount: { increment: 1 },
      },
    });

    // Update skill's certification count
    await prisma.skill.update({
      where: { id: certificate.skillId },
      data: {
        totalCertifications: { increment: 1 },
      },
    });

    this.logger.log(`Certificate ${certificate.certificateNumber} reinstated: ${reason}`);
  }

  /**
   * Get revocation history for a certificate
   */
  async getRevocationHistory(certificateId: string): Promise<{
    isRevoked: boolean;
    revokedAt?: Date;
    revocationReason?: string;
    revokedBy?: string;
    reinstatedAt?: string;
    reinstateReason?: string;
  }> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      select: {
        revokedAt: true,
        revocationReason: true,
        metadata: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    const metadata = (certificate.metadata || {}) as Record<string, unknown>;

    return {
      isRevoked: certificate.revokedAt !== null,
      revokedAt: certificate.revokedAt ?? undefined,
      revocationReason: certificate.revocationReason ?? undefined,
      revokedBy: metadata.revokedBy as string | undefined,
      reinstatedAt: metadata.reinstatedAt as string | undefined,
      reinstateReason: metadata.reinstateReason as string | undefined,
    };
  }

  /**
   * Bulk revoke certificates (e.g., for a compromised skill assessment)
   */
  async bulkRevoke(certificateIds: string[], reason: string, revokedBy?: string): Promise<number> {
    let revokedCount = 0;

    for (const id of certificateIds) {
      try {
        await this.revokeCertificate(id, reason, revokedBy);
        revokedCount++;
      } catch (error) {
        this.logger.warn(`Failed to revoke certificate ${id}`, error);
      }
    }

    return revokedCount;
  }

  /**
   * Get all revoked certificates
   */
  async getRevokedCertificates(options?: {
    page?: number;
    limit?: number;
    skillId?: string;
  }): Promise<{
    certificates: Array<{
      id: string;
      certificateNumber: string;
      revokedAt: Date;
      revocationReason: string | null;
      candidateId: string;
      skillId: string;
    }>;
    total: number;
  }> {
    const { page = 1, limit = 20, skillId } = options || {};

    const where: Record<string, unknown> = {
      revokedAt: { not: null },
    };

    if (skillId) {
      where.skillId = skillId;
    }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        select: {
          id: true,
          certificateNumber: true,
          revokedAt: true,
          revocationReason: true,
          candidateId: true,
          skillId: true,
        },
        orderBy: { revokedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.certificate.count({ where }),
    ]);

    return {
      certificates: certificates.map(cert => ({
        ...cert,
        revokedAt: cert.revokedAt!,
      })),
      total,
    };
  }
}

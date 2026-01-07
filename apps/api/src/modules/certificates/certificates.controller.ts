import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CertificatesService } from './certificates.service';
import { VerificationService } from './verification.service';
import { RevocationService } from './revocation.service';
import {
  GenerateCertificateDto,
  GenerateCertificateResponseDto,
  VerifyCertificateDto,
  VerificationResultDto,
  DownloadCertificateQueryDto,
  DownloadFormat,
  RevokeCertificateDto,
  ListCertificatesQueryDto,
  CertificateListResponseDto,
  CertificateResponseDto,
  CertificateStatsDto,
} from './dto';

@ApiTags('certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly certificatesService: CertificatesService,
    private readonly verificationService: VerificationService,
    private readonly revocationService: RevocationService
  ) {}

  // ==========================================================================
  // CERTIFICATE GENERATION
  // ==========================================================================

  @Post('generate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a certificate for a completed submission' })
  @ApiResponse({
    status: 201,
    description: 'Certificate generated successfully',
    type: GenerateCertificateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid submission or score too low' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  async generateCertificate(
    @Body() dto: GenerateCertificateDto
  ): Promise<GenerateCertificateResponseDto> {
    return this.certificatesService.generateCertificate(dto.submissionId);
  }

  // ==========================================================================
  // CERTIFICATE RETRIEVAL
  // ==========================================================================

  @Get()
  @ApiOperation({ summary: 'List certificates with optional filtering' })
  @ApiResponse({
    status: 200,
    description: 'List of certificates',
    type: CertificateListResponseDto,
  })
  async listCertificates(
    @Query() query: ListCertificatesQueryDto
  ): Promise<CertificateListResponseDto> {
    return this.certificatesService.listCertificates(query);
  }

  @Get('stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get certificate statistics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Certificate statistics',
    type: CertificateStatsDto,
  })
  async getStats(): Promise<CertificateStatsDto> {
    return this.certificatesService.getStats();
  }

  @Get('candidate/:candidateId')
  @ApiOperation({ summary: 'Get all certificates for a candidate' })
  @ApiParam({ name: 'candidateId', description: 'Candidate UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of certificates for the candidate',
    type: [CertificateResponseDto],
  })
  async getCandidateCertificates(
    @Param('candidateId', ParseUUIDPipe) candidateId: string
  ): Promise<CertificateResponseDto[]> {
    return this.certificatesService.getCandidateCertificates(candidateId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get certificate by ID' })
  @ApiParam({ name: 'id', description: 'Certificate UUID' })
  @ApiResponse({
    status: 200,
    description: 'Certificate details',
    type: CertificateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async getCertificateById(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<CertificateResponseDto> {
    return this.certificatesService.getCertificateById(id);
  }

  @Get('number/:certificateNumber')
  @ApiOperation({ summary: 'Get certificate by certificate number' })
  @ApiParam({
    name: 'certificateNumber',
    description: 'Certificate number (e.g., VH-2026-PYTH-00001)',
  })
  @ApiResponse({
    status: 200,
    description: 'Certificate details',
    type: CertificateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async getCertificateByNumber(
    @Param('certificateNumber') certificateNumber: string
  ): Promise<CertificateResponseDto> {
    return this.certificatesService.getCertificateByNumber(certificateNumber);
  }

  // ==========================================================================
  // CERTIFICATE DOWNLOAD
  // ==========================================================================

  @Get(':id/download')
  @ApiOperation({ summary: 'Download certificate in specified format' })
  @ApiParam({ name: 'id', description: 'Certificate UUID' })
  @ApiQuery({
    name: 'format',
    enum: DownloadFormat,
    required: false,
    description: 'Download format (pdf, json, image)',
  })
  @ApiResponse({ status: 200, description: 'Certificate file' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async downloadCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DownloadCertificateQueryDto,
    @Res() res: Response
  ): Promise<void> {
    const format = query.format || DownloadFormat.PDF;

    switch (format) {
      case DownloadFormat.PDF: {
        const pdfBuffer = await this.certificatesService.generatePdf(id);
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="certificate-${id}.pdf"`,
          'Content-Length': pdfBuffer.length,
        });
        res.status(HttpStatus.OK).send(pdfBuffer);
        break;
      }

      case DownloadFormat.IMAGE: {
        const imageBuffer = await this.certificatesService.generateImage(id);
        res.set({
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="certificate-${id}.png"`,
          'Content-Length': imageBuffer.length,
        });
        res.status(HttpStatus.OK).send(imageBuffer);
        break;
      }

      case DownloadFormat.JSON:
      default: {
        const certificate = await this.certificatesService.getCertificateJson(id);
        res.set({
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="certificate-${id}.json"`,
        });
        res.status(HttpStatus.OK).json(certificate);
        break;
      }
    }
  }

  // ==========================================================================
  // CERTIFICATE VERIFICATION
  // ==========================================================================

  @Get('verify/:certificateNumber')
  @ApiOperation({ summary: 'Verify certificate by certificate number' })
  @ApiParam({ name: 'certificateNumber', description: 'Certificate number to verify' })
  @ApiResponse({
    status: 200,
    description: 'Verification result',
    type: VerificationResultDto,
  })
  async verifyCertificateByNumber(
    @Param('certificateNumber') certificateNumber: string
  ): Promise<VerificationResultDto> {
    return this.verificationService.verify({ certificateNumber });
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify certificate by number or hash' })
  @ApiResponse({
    status: 200,
    description: 'Verification result',
    type: VerificationResultDto,
  })
  async verifyCertificate(@Body() dto: VerifyCertificateDto): Promise<VerificationResultDto> {
    return this.verificationService.verify(dto);
  }

  @Get('verify/:certificateNumber/quick')
  @ApiOperation({ summary: 'Quick verification check' })
  @ApiParam({ name: 'certificateNumber', description: 'Certificate number to verify' })
  @ApiResponse({
    status: 200,
    description: 'Quick verification result',
  })
  async quickVerify(
    @Param('certificateNumber') certificateNumber: string
  ): Promise<{ valid: boolean; reason?: string }> {
    return this.verificationService.quickVerify(certificateNumber);
  }

  // ==========================================================================
  // CERTIFICATE REVOCATION (Admin)
  // ==========================================================================

  @Post('revoke')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a certificate (admin only)' })
  @ApiResponse({ status: 200, description: 'Certificate revoked successfully' })
  @ApiResponse({ status: 400, description: 'Certificate already revoked' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async revokeCertificate(@Body() dto: RevokeCertificateDto): Promise<{ success: boolean }> {
    await this.revocationService.revokeCertificate(dto.certificateId, dto.reason);
    return { success: true };
  }

  @Post(':id/reinstate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reinstate a revoked certificate (admin only)' })
  @ApiParam({ name: 'id', description: 'Certificate UUID' })
  @ApiResponse({ status: 200, description: 'Certificate reinstated successfully' })
  @ApiResponse({ status: 400, description: 'Certificate is not revoked or has expired' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async reinstateCertificate(
    @Request() req: { user: { sub: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string }
  ): Promise<{ success: boolean }> {
    await this.revocationService.reinstateCertificate(id, req.user.sub, body.reason);
    return { success: true };
  }

  @Get(':id/revocation-history')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get revocation history for a certificate' })
  @ApiParam({ name: 'id', description: 'Certificate UUID' })
  @ApiResponse({ status: 200, description: 'Revocation history' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async getRevocationHistory(@Param('id', ParseUUIDPipe) id: string): Promise<{
    isRevoked: boolean;
    revokedAt?: Date;
    revocationReason?: string;
    revokedBy?: string;
    reinstatedAt?: string;
    reinstateReason?: string;
  }> {
    return this.revocationService.getRevocationHistory(id);
  }

  @Get('admin/revoked')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all revoked certificates (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skillId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of revoked certificates' })
  async getRevokedCertificates(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('skillId') skillId?: string
  ): Promise<{
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
    return this.revocationService.getRevokedCertificates({ page, limit, skillId });
  }
}

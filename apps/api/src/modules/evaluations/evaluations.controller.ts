import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EvaluationsService } from './evaluations.service';
import { CertificateService } from './certificate.service';

@Controller('evaluations')
export class EvaluationsController {
  constructor(
    private evaluationsService: EvaluationsService,
    private certificateService: CertificateService
  ) {}

  /**
   * Trigger evaluation for a submission (admin only)
   * POST /api/v1/evaluations/submissions/:submissionId/evaluate
   */
  @Post('submissions/:submissionId/evaluate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async evaluateSubmission(@Param('submissionId', ParseUUIDPipe) submissionId: string) {
    return this.evaluationsService.evaluateSubmission(submissionId);
  }

  /**
   * Re-evaluate a submission (admin only)
   * POST /api/v1/evaluations/submissions/:submissionId/re-evaluate
   */
  @Post('submissions/:submissionId/re-evaluate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async reEvaluateSubmission(@Param('submissionId', ParseUUIDPipe) submissionId: string) {
    return this.evaluationsService.reEvaluate(submissionId);
  }

  /**
   * Get evaluation for a submission
   * GET /api/v1/evaluations/submissions/:submissionId
   */
  @Get('submissions/:submissionId')
  @UseGuards(JwtAuthGuard)
  async getEvaluation(@Param('submissionId', ParseUUIDPipe) submissionId: string) {
    return this.evaluationsService.getEvaluation(submissionId);
  }

  /**
   * Get all evaluations (admin only)
   * GET /api/v1/evaluations
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getEvaluations(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('minScore') minScore?: string,
    @Query('maxScore') maxScore?: string
  ) {
    return this.evaluationsService.getEvaluations({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      minScore: minScore ? parseFloat(minScore) : undefined,
      maxScore: maxScore ? parseFloat(maxScore) : undefined,
    });
  }

  /**
   * Get evaluation statistics (admin only)
   * GET /api/v1/evaluations/stats
   */
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getStats() {
    return this.evaluationsService.getEvaluationStats();
  }

  /**
   * Process pending submissions (admin only, batch job)
   * POST /api/v1/evaluations/process-pending
   */
  @Post('process-pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async processPending(@Query('limit') limit?: string) {
    const processed = await this.evaluationsService.processPendingSubmissions(
      limit ? parseInt(limit, 10) : undefined
    );
    return { processed };
  }

  // === Certificate Endpoints ===

  /**
   * Verify a certificate (public)
   * GET /api/v1/evaluations/certificates/verify/:certificateNumber
   */
  @Get('certificates/verify/:certificateNumber')
  async verifyCertificate(@Param('certificateNumber') certificateNumber: string) {
    const result = await this.certificateService.verifyCertificate(certificateNumber);
    if (!result) {
      return { valid: false, message: 'Certificate not found' };
    }
    return result;
  }

  /**
   * Revoke a certificate (admin only)
   * POST /api/v1/evaluations/certificates/:certificateNumber/revoke
   */
  @Post('certificates/:certificateNumber/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async revokeCertificate(
    @Param('certificateNumber') certificateNumber: string,
    @Query('reason') reason: string
  ) {
    return this.certificateService.revokeCertificate(
      certificateNumber,
      reason || 'Revoked by administrator'
    );
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Ip,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubmissionsService } from './submissions.service';
import { StartSubmissionDto, UpdateSubmissionDto, SubmitDto } from './dto/submission.dto';
import { SubmissionStatus } from '@verihire/database';

@ApiTags('submissions')
@Controller('submissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start a new submission for a challenge' })
  @ApiResponse({ status: 201, description: 'Submission started' })
  @ApiResponse({ status: 400, description: 'Already have active submission' })
  @ApiResponse({ status: 404, description: 'Challenge not found' })
  async start(
    @Body() dto: StartSubmissionDto,
    @Request() req: any,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string
  ): Promise<any> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.submissionsService.startSubmission(candidateId, dto.challengeId, ip, userAgent);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get current user submissions' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['IN_PROGRESS', 'SUBMITTED', 'EVALUATING', 'EVALUATED', 'FAILED'],
  })
  @ApiQuery({ name: 'skillId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of submissions' })
  async getMySubmissions(
    @Request() req: any,
    @Query('status') status?: SubmissionStatus,
    @Query('skillId') skillId?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ): Promise<any> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { data: [], message: 'User is not a candidate' };
    }
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const offset = offsetStr ? parseInt(offsetStr, 10) : undefined;
    return this.submissionsService.getCandidateSubmissions(candidateId, {
      status,
      skillId,
      limit,
      offset,
    });
  }

  @Get('active/:challengeId')
  @ApiOperation({ summary: 'Get active submission for a challenge' })
  @ApiResponse({ status: 200, description: 'Active submission or null' })
  async getActive(@Param('challengeId') challengeId: string, @Request() req: any): Promise<any> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return null;
    }
    return this.submissionsService.getActiveSubmission(candidateId, challengeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get submission by ID' })
  @ApiResponse({ status: 200, description: 'Submission details' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  async getById(@Param('id') id: string, @Request() req: any): Promise<any> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.submissionsService.getSubmissionForCandidate(id, candidateId);
  }

  @Get(':id/results')
  @ApiOperation({ summary: 'Get submission with evaluation results' })
  @ApiResponse({ status: 200, description: 'Submission with results' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  async getResults(@Param('id') id: string, @Request() req: any): Promise<any> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.submissionsService.getSubmissionWithResults(id, candidateId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update submission content (save progress)' })
  @ApiResponse({ status: 200, description: 'Submission updated' })
  @ApiResponse({ status: 400, description: 'Cannot update submitted challenge' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubmissionDto,
    @Request() req: any
  ): Promise<any> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.submissionsService.updateSubmission(id, candidateId, dto);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit for evaluation' })
  @ApiResponse({ status: 200, description: 'Submission submitted for evaluation' })
  @ApiResponse({ status: 400, description: 'Already submitted' })
  async submit(@Param('id') id: string, @Body() dto: SubmitDto, @Request() req: any): Promise<any> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.submissionsService.submitForEvaluation(id, candidateId, dto.content, dto.language);
  }
}

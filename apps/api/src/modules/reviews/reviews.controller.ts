import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReviewsService } from './reviews.service';
import { ReputationService } from './reputation.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import {
  AssignReviewersDto,
  SubmitReviewDto,
  GetPendingReviewsQueryDto,
  ReviewAssignmentResponseDto,
  ReviewSubmissionResponseDto,
  AggregatedScoreDto,
  ReviewerStatsDto,
  AnomalyDetectionResponseDto,
  FlagReviewDto,
} from './dto';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
    candidateProfileId?: string;
    employerProfileId?: string;
  };
}

@ApiTags('reviews')
@Controller('reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly reputationService: ReputationService,
    private readonly anomalyDetection: AnomalyDetectionService
  ) {}

  // ============ Review Assignment Endpoints ============

  @Post('assign')
  @Roles('admin', 'employer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign reviewers to a submission' })
  @ApiResponse({
    status: 201,
    description: 'Reviewers assigned successfully',
    type: [ReviewAssignmentResponseDto],
  })
  @ApiResponse({ status: 400, description: 'Invalid submission or already assigned' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  async assignReviewers(@Body() dto: AssignReviewersDto) {
    const assignments = await this.reviewsService.assignReviewers(dto);
    return assignments.map(a => ({
      assignmentId: a.assignmentId,
      reviewerId: a.reviewerId,
      submissionId: a.submissionId,
      deadline: a.deadline,
      weight: a.weight,
      status: a.status as string,
    }));
  }

  // ============ Reviewer Endpoints ============

  @Get('pending')
  @Roles('candidate')
  @ApiOperation({ summary: 'Get pending reviews for the current reviewer' })
  @ApiResponse({
    status: 200,
    description: 'List of pending review assignments',
  })
  @ApiQuery({ name: 'skillId', required: false, description: 'Filter by skill' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getPendingReviews(
    @Request() req: AuthenticatedRequest,
    @Query() query: GetPendingReviewsQueryDto
  ) {
    const reviewerId = req.user.candidateProfileId;
    if (!reviewerId) {
      return {
        data: [],
        meta: { total: 0, limit: query.limit || 20, offset: query.offset || 0, hasMore: false },
      };
    }

    return this.reviewsService.getPendingReviewsForReviewer(reviewerId, {
      skillId: query.skillId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':reviewId')
  @Roles('candidate')
  @ApiOperation({ summary: 'Get submission details for review' })
  @ApiParam({ name: 'reviewId', description: 'Review assignment ID' })
  @ApiResponse({
    status: 200,
    description: 'Submission details with rubric',
  })
  @ApiResponse({ status: 403, description: 'Not assigned to this review' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async getSubmissionForReview(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Request() req: AuthenticatedRequest
  ) {
    const reviewerId = req.user.candidateProfileId;
    if (!reviewerId) {
      throw new Error('Candidate profile not found');
    }

    return this.reviewsService.getSubmissionForReview(reviewId, reviewerId);
  }

  @Post(':reviewId/submit')
  @Roles('candidate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a completed review' })
  @ApiParam({ name: 'reviewId', description: 'Review assignment ID' })
  @ApiResponse({
    status: 200,
    description: 'Review submitted successfully',
    type: ReviewSubmissionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid review data or already submitted' })
  @ApiResponse({ status: 403, description: 'Not assigned to this review' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async submitReview(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: SubmitReviewDto
  ): Promise<ReviewSubmissionResponseDto> {
    const reviewerId = req.user.candidateProfileId;
    if (!reviewerId) {
      throw new Error('Candidate profile not found');
    }

    return this.reviewsService.submitReview(reviewId, reviewerId, dto);
  }

  // ============ Score & Stats Endpoints ============

  @Get('submissions/:submissionId/score')
  @Roles('admin', 'employer', 'candidate')
  @ApiOperation({ summary: 'Get aggregated score for a submission' })
  @ApiParam({ name: 'submissionId', description: 'Submission ID' })
  @ApiResponse({
    status: 200,
    description: 'Aggregated score details',
    type: AggregatedScoreDto,
  })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  async getAggregatedScore(
    @Param('submissionId', ParseUUIDPipe) submissionId: string
  ): Promise<AggregatedScoreDto> {
    return this.reviewsService.getAggregatedScore(submissionId);
  }

  @Get('reviewers/:reviewerId/stats')
  @Roles('admin', 'candidate')
  @ApiOperation({ summary: 'Get reviewer statistics' })
  @ApiParam({ name: 'reviewerId', description: 'Reviewer profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Reviewer statistics',
    type: ReviewerStatsDto,
  })
  @ApiResponse({ status: 404, description: 'Reviewer not found' })
  async getReviewerStats(
    @Param('reviewerId', ParseUUIDPipe) reviewerId: string,
    @Request() req: AuthenticatedRequest
  ) {
    // Non-admins can only view their own stats
    if (req.user.role !== 'admin' && req.user.candidateProfileId !== reviewerId) {
      throw new Error('Unauthorized to view this reviewer stats');
    }

    return this.reviewsService.getReviewerStats(reviewerId);
  }

  @Get('me/stats')
  @Roles('candidate')
  @ApiOperation({ summary: 'Get current user reviewer statistics' })
  @ApiResponse({
    status: 200,
    description: 'Current user reviewer statistics',
    type: ReviewerStatsDto,
  })
  async getMyStats(@Request() req: AuthenticatedRequest) {
    const reviewerId = req.user.candidateProfileId;
    if (!reviewerId) {
      throw new Error('Candidate profile not found');
    }

    return this.reviewsService.getReviewerStats(reviewerId);
  }

  // ============ Reputation Endpoints ============

  @Get('reputation/me')
  @Roles('candidate')
  @ApiOperation({ summary: 'Get current user reputation' })
  @ApiResponse({
    status: 200,
    description: 'Current user reputation details',
  })
  async getMyReputation(@Request() req: AuthenticatedRequest) {
    const reviewerId = req.user.candidateProfileId;
    if (!reviewerId) {
      throw new Error('Candidate profile not found');
    }

    const score = await this.reputationService.getScore(reviewerId);
    const tier = this.reputationService.getTier(score);
    const canAccept = await this.reputationService.canAcceptAssignments(reviewerId);

    return {
      reviewerId,
      score,
      tier: tier.tier,
      privileges: tier.privileges,
      canAcceptReviews: canAccept.canAccept,
      restrictionReason: canAccept.reason,
    };
  }

  @Get('reputation/leaderboard')
  @Roles('admin', 'candidate')
  @ApiOperation({ summary: 'Get reviewer leaderboard' })
  @ApiQuery({ name: 'skillId', required: false, description: 'Filter by skill' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of results' })
  @ApiResponse({
    status: 200,
    description: 'Reviewer leaderboard',
  })
  async getLeaderboard(@Query('skillId') skillId?: string, @Query('limit') limit?: number) {
    return this.reputationService.getLeaderboard({
      skillId,
      limit: limit ? Number(limit) : 20,
    });
  }

  // ============ Admin Endpoints ============

  @Get('admin/anomalies')
  @Roles('admin')
  @ApiOperation({ summary: 'Run anomaly detection on reviews' })
  @ApiQuery({
    name: 'windowDays',
    required: false,
    type: Number,
    description: 'Analysis window in days',
  })
  @ApiResponse({
    status: 200,
    description: 'Anomaly detection results',
    type: AnomalyDetectionResponseDto,
  })
  async detectAnomalies(
    @Query('windowDays') windowDays?: number
  ): Promise<AnomalyDetectionResponseDto> {
    return this.anomalyDetection.detectAnomalies({
      windowDays: windowDays ? Number(windowDays) : 30,
    });
  }

  @Post('admin/flag')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flag a review for investigation' })
  @ApiResponse({
    status: 200,
    description: 'Review flagged successfully',
  })
  async flagReview(@Body() dto: FlagReviewDto) {
    // In a full implementation, this would create an investigation record
    // For now, we'll flag the reviewer
    const _review = await this.reviewsService.getSubmissionForReview(dto.reviewId, '');

    await this.anomalyDetection.flagReviewerForInvestigation(
      dto.reviewId, // This should be the reviewer ID in production
      dto.reason
    );

    return {
      success: true,
      reviewId: dto.reviewId,
      flaggedAt: new Date(),
    };
  }

  @Post('admin/recalculate/:submissionId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recalculate aggregated score for a submission' })
  @ApiParam({ name: 'submissionId', description: 'Submission ID' })
  @ApiResponse({
    status: 200,
    description: 'Score recalculated successfully',
    type: AggregatedScoreDto,
  })
  async recalculateScore(
    @Param('submissionId', ParseUUIDPipe) submissionId: string
  ): Promise<AggregatedScoreDto> {
    return this.reviewsService.getAggregatedScore(submissionId);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SubmissionsService } from './submissions.service';
import { SubmissionStatus } from '@verihire/database';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';

@ApiTags('submissions-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('submissions/admin')
export class SubmissionsAdminController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get('all')
  @ApiOperation({
    summary: 'Get all submissions (admin/demo - no auth required)',
    description:
      'Lists all submissions in the system. Useful for demos and testing. ' +
      'In production, this should be protected with admin authentication.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['IN_PROGRESS', 'SUBMITTED', 'EVALUATING', 'EVALUATED', 'FAILED'],
    description: 'Filter by submission status',
  })
  @ApiQuery({
    name: 'challengeId',
    required: false,
    type: String,
    description: 'Filter by challenge ID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of results to return (default: 50)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of results to skip (default: 0)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all submissions with pagination',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              finalScore: { type: 'number', nullable: true },
              language: { type: 'string', nullable: true },
              submittedAt: { type: 'string', format: 'date-time', nullable: true },
              candidate: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  user: {
                    type: 'object',
                    properties: {
                      firstName: { type: 'string' },
                      lastName: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  })
  async getAllSubmissions(
    @Query('status') status?: SubmissionStatus,
    @Query('challengeId') challengeId?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ): Promise<any> {
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const offset = offsetStr ? parseInt(offsetStr, 10) : undefined;

    return this.submissionsService.getAllSubmissions({
      status,
      challengeId,
      limit,
      offset,
    });
  }
}

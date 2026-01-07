import { Controller, Get, Param, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('recruiter/dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recruiter dashboard analytics' })
  async getRecruiterDashboard(@Request() req: { user: { recruiterProfileId: string } }) {
    return this.analyticsService.getRecruiterDashboard(req.user.recruiterProfileId);
  }

  @Get('recruiter/jobs/:jobId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get job metrics' })
  async getJobMetrics(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('jobId', ParseUUIDPipe) jobId: string
  ) {
    return this.analyticsService.getJobMetrics(jobId, req.user.recruiterProfileId);
  }

  @Get('platform/stats')
  @ApiOperation({ summary: 'Get platform-wide statistics' })
  async getPlatformStats() {
    return this.analyticsService.getPlatformStats();
  }
}

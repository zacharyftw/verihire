import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JobsService } from './jobs.service';
import {
  CreateJobDto,
  UpdateJobDto,
  AddJobSkillDto,
  ShortlistCandidateDto,
  UpdateShortlistDto,
  ApplyToJobDto,
  UpdateApplicationDto,
} from './dto/job.dto';

@Controller('jobs')
export class JobsController {
  constructor(private jobsService: JobsService) {}

  // ===== Public job search =====

  /**
   * Search jobs (public)
   * GET /api/v1/jobs/search
   */
  @Get('search')
  async searchJobs(
    @Query('query') query?: string,
    @Query('skillId') skillId?: string,
    @Query('locationCountry') locationCountry?: string,
    @Query('locationCity') locationCity?: string,
    @Query('remotePolicy') remotePolicy?: 'REMOTE' | 'HYBRID' | 'ONSITE',
    @Query('employmentType')
    employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'FREELANCE',
    @Query('salaryMin') salaryMin?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.jobsService.searchJobs({
      query,
      skillId,
      locationCountry,
      locationCity,
      remotePolicy,
      employmentType,
      salaryMin: salaryMin ? parseInt(salaryMin, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ===== Recruiter job management =====

  /**
   * Create new job (recruiter only)
   * POST /api/v1/jobs
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async createJob(
    @Request() req: { user: { recruiterProfileId: string } },
    @Body() body: CreateJobDto
  ) {
    return this.jobsService.createJob(req.user.recruiterProfileId, body);
  }

  /**
   * Get my jobs (recruiter only)
   * GET /api/v1/jobs/recruiter/my-jobs
   */
  @Get('recruiter/my-jobs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async getMyJobs(
    @Request() req: { user: { recruiterProfileId: string } },
    @Query('status') status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'FILLED',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.jobsService.getRecruiterJobs(req.user.recruiterProfileId, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ===== Candidate's job applications =====

  /**
   * Get my applications (candidate only)
   * GET /api/v1/jobs/candidate/my-applications
   */
  @Get('candidate/my-applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CANDIDATE')
  async getMyApplications(
    @Request() req: { user: { candidateProfileId: string } },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.jobsService.getCandidateApplications(req.user.candidateProfileId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * Get job by ID (public)
   * GET /api/v1/jobs/:id
   */
  @Get(':id')
  async getJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.getJobById(id, true, true);
  }

  /**
   * Update job (recruiter only)
   * PATCH /api/v1/jobs/:id
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async updateJob(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateJobDto
  ) {
    return this.jobsService.updateJob(id, req.user.recruiterProfileId, body);
  }

  /**
   * Publish job (recruiter only)
   * POST /api/v1/jobs/:id/publish
   */
  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @HttpCode(HttpStatus.OK)
  async publishJob(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string
  ) {
    return this.jobsService.publishJob(id, req.user.recruiterProfileId);
  }

  /**
   * Close job (recruiter only)
   * POST /api/v1/jobs/:id/close
   */
  @Post(':id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @HttpCode(HttpStatus.OK)
  async closeJob(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string
  ) {
    return this.jobsService.closeJob(id, req.user.recruiterProfileId);
  }

  /**
   * Apply to a job (candidate only)
   * POST /api/v1/jobs/:id/apply
   */
  @Post(':id/apply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CANDIDATE')
  async applyToJob(
    @Request() req: { user: { candidateProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApplyToJobDto
  ) {
    return this.jobsService.applyToJob(id, req.user.candidateProfileId, body);
  }

  /**
   * Delete job (recruiter only)
   * DELETE /api/v1/jobs/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async deleteJob(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string
  ) {
    return this.jobsService.deleteJob(id, req.user.recruiterProfileId);
  }

  // ===== Job skills management =====

  /**
   * Add skill to job (recruiter only)
   * POST /api/v1/jobs/:id/skills
   */
  @Post(':id/skills')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async addJobSkill(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddJobSkillDto
  ) {
    return this.jobsService.addJobSkill(id, req.user.recruiterProfileId, body);
  }

  /**
   * Remove skill from job (recruiter only)
   * DELETE /api/v1/jobs/:id/skills/:skillId
   */
  @Delete(':id/skills/:skillId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async removeJobSkill(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('skillId', ParseUUIDPipe) skillId: string
  ) {
    return this.jobsService.removeJobSkill(id, req.user.recruiterProfileId, skillId);
  }

  // ===== Job applications management (recruiter) =====

  /**
   * Get applications for a job (recruiter only)
   * GET /api/v1/jobs/:id/applications
   */
  @Get(':id/applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async getJobApplications(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status')
    status?:
      | 'APPLIED'
      | 'TESTING'
      | 'COMPLETED'
      | 'REVIEWED'
      | 'SHORTLISTED'
      | 'REJECTED'
      | 'HIRED',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.jobsService.getJobApplications(id, req.user.recruiterProfileId, {
      status: status as any,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * Update application status (recruiter only)
   * PATCH /api/v1/jobs/:id/applications/:applicationId
   */
  @Patch(':id/applications/:applicationId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async updateApplication(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() body: UpdateApplicationDto
  ) {
    return this.jobsService.updateJobApplication(
      id,
      applicationId,
      req.user.recruiterProfileId,
      body
    );
  }

  // ===== Shortlist management =====

  /**
   * Add candidate to shortlist (recruiter only)
   * POST /api/v1/jobs/:id/shortlist
   */
  @Post(':id/shortlist')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async shortlistCandidate(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ShortlistCandidateDto
  ) {
    return this.jobsService.shortlistCandidate(id, req.user.recruiterProfileId, body);
  }

  /**
   * Get job shortlist (recruiter only)
   * GET /api/v1/jobs/:id/shortlist
   */
  @Get(':id/shortlist')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async getJobShortlist(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('stage')
    stage?:
      | 'SHORTLISTED'
      | 'SCREENING'
      | 'INTERVIEW'
      | 'ASSESSMENT'
      | 'OFFER'
      | 'HIRED'
      | 'REJECTED',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.jobsService.getJobShortlist(id, req.user.recruiterProfileId, {
      stage,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * Update shortlist entry (recruiter only)
   * PATCH /api/v1/jobs/:id/shortlist/:candidateId
   */
  @Patch(':id/shortlist/:candidateId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async updateShortlist(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Body() body: UpdateShortlistDto
  ) {
    return this.jobsService.updateShortlist(id, candidateId, req.user.recruiterProfileId, body);
  }

  /**
   * Remove from shortlist (recruiter only)
   * DELETE /api/v1/jobs/:id/shortlist/:candidateId
   */
  @Delete(':id/shortlist/:candidateId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async removeFromShortlist(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('candidateId', ParseUUIDPipe) candidateId: string
  ) {
    return this.jobsService.removeFromShortlist(id, candidateId, req.user.recruiterProfileId);
  }

  /**
   * Find matching candidates for job (recruiter only)
   * GET /api/v1/jobs/:id/matching-candidates
   */
  @Get(':id/matching-candidates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  async findMatchingCandidates(
    @Request() req: { user: { recruiterProfileId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.jobsService.findMatchingCandidates(id, req.user.recruiterProfileId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}

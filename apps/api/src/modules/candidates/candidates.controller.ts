import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CandidatesService } from './candidates.service';
import { UpdateProfileDto, AddSkillDto, UpdateSkillDto } from './dto/candidate.dto';
import { RemotePreference, JobSearchStatus } from '@verihire/database';

@ApiTags('candidates')
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  // Current user's profile endpoints
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user candidate profile' })
  @ApiResponse({ status: 200, description: 'Candidate profile' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getMyProfile(
    @Request() req: Request & { user: { candidateProfileId?: string } }
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.candidatesService.getProfile(candidateId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user candidate profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateMyProfile(
    @Request() req: Request & { user: { candidateProfileId?: string } },
    @Body() dto: UpdateProfileDto
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.candidatesService.updateProfile(candidateId, dto);
  }

  @Get('me/skills')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user skills' })
  @ApiResponse({ status: 200, description: 'List of skills' })
  async getMySkills(
    @Request() req: Request & { user: { candidateProfileId?: string } }
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.candidatesService.getSkills(candidateId);
  }

  @Post('me/skills')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a skill to profile' })
  @ApiResponse({ status: 201, description: 'Skill added' })
  @ApiResponse({ status: 409, description: 'Skill already added' })
  async addSkill(
    @Request() req: Request & { user: { candidateProfileId?: string } },
    @Body() dto: AddSkillDto
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.candidatesService.addSkill(candidateId, dto.skillId, dto.level);
  }

  @Patch('me/skills/:skillId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update skill level' })
  @ApiResponse({ status: 200, description: 'Skill updated' })
  async updateSkill(
    @Request() req: Request & { user: { candidateProfileId?: string } },
    @Param('skillId') skillId: string,
    @Body() dto: UpdateSkillDto
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    if (!dto.level) {
      return { error: 'Level is required' };
    }
    return this.candidatesService.updateSkill(candidateId, skillId, dto.level);
  }

  @Delete('me/skills/:skillId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove skill from profile' })
  @ApiResponse({ status: 200, description: 'Skill removed' })
  async removeSkill(
    @Request() req: Request & { user: { candidateProfileId?: string } },
    @Param('skillId') skillId: string
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.candidatesService.removeSkill(candidateId, skillId);
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get candidate statistics' })
  @ApiResponse({ status: 200, description: 'Candidate stats' })
  async getMyStats(
    @Request() req: Request & { user: { candidateProfileId?: string } }
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.candidatesService.getStats(candidateId);
  }

  // Public profile endpoints
  @Get('profile/:slug')
  @ApiOperation({ summary: 'Get public candidate profile by slug or ID' })
  @ApiResponse({ status: 200, description: 'Public profile' })
  @ApiResponse({ status: 404, description: 'Profile not found or is private' })
  async getPublicProfile(@Param('slug') slug: string): Promise<unknown> {
    return this.candidatesService.getPublicProfile(slug);
  }

  // Search endpoint (for recruiters)
  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search candidates (recruiters only)' })
  @ApiQuery({
    name: 'skillIds',
    required: false,
    type: String,
    description: 'Comma-separated skill IDs',
  })
  @ApiQuery({ name: 'minExperience', required: false, type: Number })
  @ApiQuery({ name: 'maxExperience', required: false, type: Number })
  @ApiQuery({
    name: 'locations',
    required: false,
    type: String,
    description: 'Comma-separated locations',
  })
  @ApiQuery({
    name: 'remotePreference',
    required: false,
    enum: ['REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE'],
  })
  @ApiQuery({
    name: 'jobSearchStatus',
    required: false,
    enum: ['ACTIVELY_LOOKING', 'OPEN', 'NOT_LOOKING', 'EMPLOYED'],
  })
  @ApiQuery({ name: 'verifiedOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Search results' })
  async searchCandidates(
    @Request() req: Request & { user: { recruiterProfileId?: string } },
    @Query('skillIds') skillIdsStr?: string,
    @Query('minExperience') minExpStr?: string,
    @Query('maxExperience') maxExpStr?: string,
    @Query('locations') locationsStr?: string,
    @Query('remotePreference') remotePreference?: RemotePreference,
    @Query('jobSearchStatus') jobSearchStatus?: JobSearchStatus,
    @Query('verifiedOnly') verifiedOnlyStr?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ): Promise<unknown> {
    // Only recruiters can search candidates
    const recruiterId = req.user.recruiterProfileId;
    if (!recruiterId) {
      return { error: 'Only recruiters can search candidates' };
    }

    const skillIds = skillIdsStr ? skillIdsStr.split(',').map(s => s.trim()) : undefined;
    const locations = locationsStr ? locationsStr.split(',').map(s => s.trim()) : undefined;
    const minExperience = minExpStr ? parseInt(minExpStr, 10) : undefined;
    const maxExperience = maxExpStr ? parseInt(maxExpStr, 10) : undefined;
    const verifiedOnly = verifiedOnlyStr === 'true';
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const offset = offsetStr ? parseInt(offsetStr, 10) : undefined;

    return this.candidatesService.searchCandidates({
      skillIds,
      minExperience,
      maxExperience,
      locations,
      remotePreference,
      jobSearchStatus,
      verifiedOnly,
      limit,
      offset,
    });
  }

  // =========================================================================
  // FILE UPLOAD ENDPOINTS
  // =========================================================================

  @Post('me/resume')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload resume' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Resume uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadResume(
    @Request() req: Request & { user: { candidateProfileId?: string } },
    @UploadedFile() file: Express.Multer.File
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.candidatesService.uploadResume(candidateId, {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
  }

  @Delete('me/resume')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete resume' })
  @ApiResponse({ status: 200, description: 'Resume deleted' })
  async deleteResume(
    @Request() req: Request & { user: { candidateProfileId?: string } }
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.candidatesService.deleteResume(candidateId);
  }

  @Post('me/portfolio')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload portfolio file' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Portfolio file uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadPortfolioFile(
    @Request() req: Request & { user: { candidateProfileId?: string } },
    @UploadedFile() file: Express.Multer.File
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.candidatesService.uploadPortfolioFile(candidateId, {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
  }

  @Get('me/portfolio')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List portfolio files' })
  @ApiResponse({ status: 200, description: 'Portfolio files list' })
  async listPortfolioFiles(
    @Request() req: Request & { user: { candidateProfileId?: string } }
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.candidatesService.listPortfolioFiles(candidateId);
  }

  @Delete('me/portfolio/:key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete portfolio file' })
  @ApiResponse({ status: 200, description: 'Portfolio file deleted' })
  async deletePortfolioFile(
    @Request() req: Request & { user: { candidateProfileId?: string } },
    @Param('key') key: string
  ): Promise<unknown> {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    // Key comes URL encoded, decode it
    const decodedKey = decodeURIComponent(key);
    return this.candidatesService.deletePortfolioFile(candidateId, decodedKey);
  }

  @Get(':id/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get candidate profile for recruiter view' })
  @ApiResponse({ status: 200, description: 'Candidate profile' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async getCandidateProfile(@Param('id') id: string): Promise<unknown> {
    return this.candidatesService.getProfileForRecruiter(id);
  }

  @Get(':id/resume-analysis')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI resume analysis for a candidate' })
  async getResumeAnalysis(@Param('id') id: string) {
    return this.candidatesService.getResumeAnalysis(id);
  }

  @Get(':id/domain-scores')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get domain scores for a candidate' })
  async getDomainScores(@Param('id') id: string) {
    return this.candidatesService.getDomainScores(id);
  }

  @Get(':id/interview-questions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI-generated interview questions for a candidate' })
  @ApiQuery({
    name: 'domain',
    required: true,
    type: String,
    description: 'Domain to generate questions for (e.g. React, Node.js)',
  })
  @ApiResponse({ status: 200, description: 'Generated interview questions' })
  @ApiResponse({ status: 400, description: 'Missing domain or no resume analysis' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async getInterviewQuestions(@Param('id') id: string, @Query('domain') domain: string) {
    if (!domain) {
      throw new BadRequestException('domain query parameter is required');
    }
    return this.candidatesService.getInterviewQuestions(id, domain);
  }
}

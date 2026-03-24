import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ChallengesService } from './challenges.service';
import { ChallengeDifficulty, ChallengeType } from '@verihire/database';

@ApiTags('challenges')
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get challenges for the current candidate' })
  @ApiQuery({ name: 'skillId', required: false })
  @ApiQuery({
    name: 'difficulty',
    required: false,
    enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'],
  })
  @ApiQuery({ name: 'type', required: false, enum: ['CODING', 'DESIGN', 'WRITTEN', 'MIXED'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of challenges' })
  async findAll(
    @Request() req: any,
    @Query('skillId') skillId?: string,
    @Query('difficulty') difficulty?: ChallengeDifficulty,
    @Query('type') type?: ChallengeType,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const offset = offsetStr ? parseInt(offsetStr, 10) : undefined;
    const candidateId = req.user?.candidateProfileId;
    return this.challengesService.findAll({
      skillId,
      difficulty,
      type,
      limit,
      offset,
      candidateId,
    });
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get challenge templates' })
  @ApiQuery({ name: 'skillId', required: false })
  @ApiQuery({
    name: 'difficulty',
    required: false,
    enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'],
  })
  @ApiResponse({ status: 200, description: 'List of challenge templates' })
  async getTemplates(
    @Query('skillId') skillId?: string,
    @Query('difficulty') difficulty?: ChallengeDifficulty
  ) {
    return this.challengesService.getTemplates({ skillId, difficulty });
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get template by ID' })
  @ApiResponse({ status: 200, description: 'Template details' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplateById(@Param('id') id: string) {
    return this.challengesService.getTemplateById(id);
  }

  @Get('recommended')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recommended challenges for current user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of recommended challenges' })
  async getRecommended(@Request() req: any, @Query('limit') limitStr?: string) {
    // Get candidate profile ID from user
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { data: [], message: 'User is not a candidate' };
    }
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    return this.challengesService.getRecommendedChallenges(candidateId, limit);
  }

  @Get('skill/:slug')
  @ApiOperation({ summary: 'Get challenges for a skill' })
  @ApiResponse({ status: 200, description: 'List of challenges for the skill' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async getChallengesBySkill(@Param('slug') slug: string) {
    return this.challengesService.getChallengesBySkill(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get challenge by ID' })
  @ApiResponse({ status: 200, description: 'Challenge details' })
  @ApiResponse({ status: 404, description: 'Challenge not found' })
  async findById(@Param('id') id: string) {
    return this.challengesService.findById(id);
  }

  @Get(':id/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get challenge for candidate (start view)' })
  @ApiResponse({ status: 200, description: 'Challenge details for candidate' })
  @ApiResponse({ status: 404, description: 'Challenge not found' })
  async getForCandidate(@Param('id') id: string, @Request() req: any) {
    const candidateId = req.user.candidateProfileId;
    if (!candidateId) {
      return { error: 'User is not a candidate' };
    }
    return this.challengesService.findForCandidate(id, candidateId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a challenge (invalidates cached test cases when referenceSolution changes)',
  })
  @ApiResponse({ status: 200, description: 'Challenge updated' })
  @ApiResponse({ status: 404, description: 'Challenge not found' })
  async updateChallenge(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      requirements?: any;
      referenceSolution?: string;
      solutionLanguage?: string;
      starterCode?: string;
      difficulty?: ChallengeDifficulty;
      type?: ChallengeType;
      timeLimitMinutes?: number;
    }
  ) {
    return this.challengesService.update(id, body);
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a new challenge from template' })
  @ApiResponse({ status: 201, description: 'Challenge generated' })
  async generateChallenge(
    @Body()
    body: {
      templateId: string;
      difficulty?: ChallengeDifficulty;
      timeLimitMinutes?: number;
    }
  ) {
    return this.challengesService.generateFromTemplate(body.templateId, {
      difficulty: body.difficulty,
      timeLimitMinutes: body.timeLimitMinutes,
    });
  }
}

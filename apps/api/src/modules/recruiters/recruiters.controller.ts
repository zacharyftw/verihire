import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RecruitersService } from './recruiters.service';
import { CreateRecruiterProfileDto, UpdateRecruiterProfileDto } from './dto/recruiter.dto';

@ApiTags('recruiters')
@Controller('recruiters')
export class RecruitersController {
  constructor(private recruitersService: RecruitersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create recruiter profile' })
  async createProfile(@Body() body: CreateRecruiterProfileDto) {
    return this.recruitersService.createProfile(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my recruiter profile' })
  async getMyProfile(@Request() req: { user: { recruiterProfileId: string } }) {
    return this.recruitersService.getProfile(req.user.recruiterProfileId);
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my recruiter stats' })
  async getMyStats(@Request() req: { user: { recruiterProfileId: string } }) {
    return this.recruitersService.getStats(req.user.recruiterProfileId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my recruiter profile' })
  async updateMyProfile(
    @Request() req: { user: { recruiterProfileId: string } },
    @Body() body: UpdateRecruiterProfileDto
  ) {
    return this.recruitersService.updateProfile(req.user.recruiterProfileId, body);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recruiter profile by ID' })
  async getProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.recruitersService.getProfile(id);
  }
}

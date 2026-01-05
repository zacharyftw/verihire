import { IsString, IsOptional, IsInt, IsUrl, IsEnum, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RemotePreference, JobSearchStatus, SkillLevel } from '@verihire/database';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  yearsExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationCountry?: string;

  @ApiPropertyOptional({ enum: ['REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE'] })
  @IsOptional()
  @IsEnum(RemotePreference)
  remotePreference?: RemotePreference;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  githubUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  portfolioUrl?: string;

  @ApiPropertyOptional({ enum: ['ACTIVELY_LOOKING', 'OPEN', 'NOT_LOOKING', 'EMPLOYED'] })
  @IsOptional()
  @IsEnum(JobSearchStatus)
  jobSearchStatus?: JobSearchStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  preferredSalaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  preferredSalaryMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredSalaryCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  portfolioPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  portfolioSlug?: string;
}

export class AddSkillDto {
  @ApiProperty({ description: 'Skill ID to add' })
  @IsString()
  skillId: string;

  @ApiPropertyOptional({ enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] })
  @IsOptional()
  @IsEnum(SkillLevel)
  level?: SkillLevel;
}

export class UpdateSkillDto {
  @ApiPropertyOptional({ enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] })
  @IsOptional()
  @IsEnum(SkillLevel)
  level?: SkillLevel;
}

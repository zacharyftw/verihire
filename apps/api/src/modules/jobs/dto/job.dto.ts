import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateJobDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  requirements?: string;

  @IsOptional()
  @IsString()
  responsibilities?: string;

  @IsOptional()
  @IsString()
  locationCity?: string;

  @IsOptional()
  @IsString()
  locationCountry?: string;

  @IsOptional()
  @IsEnum(['REMOTE', 'HYBRID', 'ONSITE'])
  remotePolicy?: 'REMOTE' | 'HYBRID' | 'ONSITE';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsString()
  salaryCurrency?: string;

  @IsOptional()
  @IsEnum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'])
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'FREELANCE';

  @IsOptional()
  @IsString()
  experienceLevel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  experienceYearsMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  experienceYearsMax?: number;
}

export class UpdateJobDto extends CreateJobDto {
  @IsOptional()
  @IsEnum(['DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED', 'FILLED'])
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'FILLED';
}

export class AddJobSkillDto {
  @IsUUID()
  skillId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @IsEnum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'])
  minLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class SearchJobsDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  skillId?: string;

  @IsOptional()
  @IsString()
  locationCountry?: string;

  @IsOptional()
  @IsString()
  locationCity?: string;

  @IsOptional()
  @IsEnum(['REMOTE', 'HYBRID', 'ONSITE'])
  remotePolicy?: 'REMOTE' | 'HYBRID' | 'ONSITE';

  @IsOptional()
  @IsEnum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'])
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'FREELANCE';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offset?: number;
}

export class ShortlistCandidateDto {
  @IsUUID()
  candidateId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;
}

export class UpdateShortlistDto {
  @IsOptional()
  @IsEnum(['SHORTLISTED', 'SCREENING', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED', 'REJECTED'])
  stage?: 'SHORTLISTED' | 'SCREENING' | 'INTERVIEW' | 'ASSESSMENT' | 'OFFER' | 'HIRED' | 'REJECTED';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;
}

export class ApplyToJobDto {
  @IsOptional()
  @IsString()
  coverLetter?: string;
}

export class UpdateApplicationDto {
  @IsOptional()
  @IsEnum(['REVIEWED', 'SHORTLISTED', 'REJECTED', 'HIRED'])
  status?: 'REVIEWED' | 'SHORTLISTED' | 'REJECTED' | 'HIRED';

  @IsOptional()
  @IsString()
  reviewerNotes?: string;
}

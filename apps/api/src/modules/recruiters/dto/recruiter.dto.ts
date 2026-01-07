import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRecruiterProfileDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ enum: ['RECRUITER', 'HIRING_MANAGER', 'ADMIN'] })
  @IsOptional()
  @IsEnum(['RECRUITER', 'HIRING_MANAGER', 'ADMIN'])
  role?: 'RECRUITER' | 'HIRING_MANAGER' | 'ADMIN';
}

export class UpdateRecruiterProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ enum: ['RECRUITER', 'HIRING_MANAGER', 'ADMIN'] })
  @IsOptional()
  @IsEnum(['RECRUITER', 'HIRING_MANAGER', 'ADMIN'])
  role?: 'RECRUITER' | 'HIRING_MANAGER' | 'ADMIN';
}

export class RecruiterProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional()
  companyId?: string;

  @ApiPropertyOptional()
  title?: string;

  @ApiPropertyOptional()
  department?: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  totalHires: number;

  @ApiProperty()
  activeJobs: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class RecruiterStatsDto {
  @ApiProperty()
  activeJobs: number;

  @ApiProperty()
  totalJobs: number;

  @ApiProperty()
  totalShortlisted: number;

  @ApiProperty()
  totalHired: number;

  @ApiProperty()
  avgTimeToHire: number;
}

import { IsString, IsOptional, IsUUID, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartSubmissionDto {
  @ApiProperty({ description: 'Challenge ID' })
  @IsUUID()
  challengeId: string;
}

export class UpdateSubmissionDto {
  @ApiPropertyOptional({ description: 'Code or content' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ description: 'Programming language' })
  @IsString()
  @IsOptional()
  language?: string;
}

class SubmissionFileDto {
  @IsString()
  name: string;

  @IsString()
  content: string;

  @IsString()
  type: string;
}

export class SubmitDto {
  @ApiProperty({ description: 'Final code or content' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Programming language' })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ description: 'Additional files (behavioral metadata, etc.)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmissionFileDto)
  @IsOptional()
  files?: SubmissionFileDto[];
}

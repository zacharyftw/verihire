import { IsString, IsOptional, IsUUID } from 'class-validator';
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

export class SubmitDto {
  @ApiProperty({ description: 'Final code or content' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Programming language' })
  @IsString()
  @IsOptional()
  language?: string;
}

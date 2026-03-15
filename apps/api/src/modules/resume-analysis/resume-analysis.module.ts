import { Module } from '@nestjs/common';
import { ResumeAnalysisService } from './resume-analysis.service';

@Module({
  providers: [ResumeAnalysisService],
  exports: [ResumeAnalysisService],
})
export class ResumeAnalysisModule {}

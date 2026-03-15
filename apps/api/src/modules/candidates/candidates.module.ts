import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { StorageModule } from '../storage';
import { ResumeAnalysisModule } from '../resume-analysis/resume-analysis.module';

@Module({
  imports: [StorageModule, ResumeAnalysisModule],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}

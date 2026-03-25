import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { ResumeAnalysisModule } from '../resume-analysis/resume-analysis.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ResumeAnalysisModule, NotificationsModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

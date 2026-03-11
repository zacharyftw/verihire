import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsAdminController } from './submissions-admin.controller';
import { SubmissionsService } from './submissions.service';
import { EvaluationsModule } from '../evaluations/evaluations.module';

@Module({
  imports: [EvaluationsModule],
  controllers: [SubmissionsController, SubmissionsAdminController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}

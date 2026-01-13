import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsAdminController } from './submissions-admin.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  controllers: [SubmissionsController, SubmissionsAdminController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}

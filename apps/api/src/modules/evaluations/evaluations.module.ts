import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EvaluationsService } from './evaluations.service';
import { EvaluationsController } from './evaluations.controller';
import { CertificateService } from './certificate.service';
import { TestCaseGeneratorService } from './test-case-generator.service';
import { PlagiarismService } from './plagiarism.service';
import { CodeExecutionModule } from '../code-execution/code-execution.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ConfigModule, CodeExecutionModule, NotificationsModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, CertificateService, TestCaseGeneratorService, PlagiarismService],
  exports: [EvaluationsService, CertificateService, TestCaseGeneratorService, PlagiarismService],
})
export class EvaluationsModule {}

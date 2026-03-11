import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EvaluationsService } from './evaluations.service';
import { EvaluationsController } from './evaluations.controller';
import { CertificateService } from './certificate.service';
import { TestCaseGeneratorService } from './test-case-generator.service';
import { CodeExecutionModule } from '../code-execution/code-execution.module';

@Module({
  imports: [ConfigModule, CodeExecutionModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, CertificateService, TestCaseGeneratorService],
  exports: [EvaluationsService, CertificateService, TestCaseGeneratorService],
})
export class EvaluationsModule {}

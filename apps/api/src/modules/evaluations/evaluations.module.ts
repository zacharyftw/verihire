import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EvaluationsService } from './evaluations.service';
import { EvaluationsController } from './evaluations.controller';
import { AiEvaluationService } from './ai-evaluation.service';
import { CertificateService } from './certificate.service';

@Module({
  imports: [ConfigModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, AiEvaluationService, CertificateService],
  exports: [EvaluationsService, AiEvaluationService, CertificateService],
})
export class EvaluationsModule {}

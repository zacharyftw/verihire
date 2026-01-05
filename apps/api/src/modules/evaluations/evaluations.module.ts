import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EvaluationsService } from './evaluations.service';
import { EvaluationsController } from './evaluations.controller';
import { AiEvaluationService } from './ai-evaluation.service';
import { CertificateService } from './certificate.service';
import { MlServiceClient } from './ml-service.client';

@Module({
  imports: [ConfigModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, AiEvaluationService, CertificateService, MlServiceClient],
  exports: [EvaluationsService, AiEvaluationService, CertificateService, MlServiceClient],
})
export class EvaluationsModule {}

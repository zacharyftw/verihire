import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { ReviewQualityService } from './review-quality.service';
import { ReputationService } from './reputation.service';
import { ScoreAggregationService } from './score-aggregation.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule, // For JWT guards and auth decorators
  ],
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    ConflictDetectionService,
    ReviewQualityService,
    ReputationService,
    ScoreAggregationService,
    AnomalyDetectionService,
  ],
  exports: [
    ReviewsService,
    ConflictDetectionService,
    ReviewQualityService,
    ReputationService,
    ScoreAggregationService,
    AnomalyDetectionService,
  ],
})
export class ReviewsModule {}

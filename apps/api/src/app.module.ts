import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SkillsModule } from './modules/skills/skills.module';
import { ChallengesModule } from './modules/challenges/challenges.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { StorageModule } from './modules/storage/storage.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { RecruitersModule } from './modules/recruiters/recruiters.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ResumeAnalysisModule } from './modules/resume-analysis/resume-analysis.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MessagesModule } from './modules/messages/messages.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // Configuration - load from root .env and local .env
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [
        join(__dirname, '..', '..', '..', '.env'), // Root .env
        join(__dirname, '..', '..', '..', '.env.local'), // Root .env.local
        join(__dirname, '..', '.env'), // apps/api/.env
      ],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Feature modules
    HealthModule,
    AuthModule,
    UsersModule,
    SkillsModule,
    ChallengesModule,
    SubmissionsModule,
    CandidatesModule,
    EvaluationsModule,
    JobsModule,
    ReviewsModule,
    CertificatesModule,
    StorageModule,
    BlockchainModule,
    RecruitersModule,
    CompaniesModule,
    AnalyticsModule,
    ResumeAnalysisModule,
    NotificationsModule,
    MessagesModule,
  ],
})
export class AppModule {}

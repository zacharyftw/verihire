import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { EmailProcessor } from './processors/email.processor';
import { CertificateProcessor } from './processors/certificate.processor';
import { QUEUE_NAMES } from './constants';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    BlockchainModule,
    // Bull configuration with Redis
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url') || 'redis://localhost:6379';

        // Parse Redis URL
        const url = new URL(redisUrl);
        const password = url.password || undefined;
        const host = url.hostname;
        const port = parseInt(url.port || '6379', 10);

        return {
          redis: {
            host,
            port,
            password,
          },
          defaultJobOptions: {
            removeOnComplete: 100, // Keep last 100 completed jobs
            removeOnFail: 500, // Keep last 500 failed jobs
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        };
      },
      inject: [ConfigService],
    }),

    // Register queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.CERTIFICATE },
      { name: QUEUE_NAMES.EVALUATION },
      { name: QUEUE_NAMES.BLOCKCHAIN }
    ),
  ],
  providers: [QueueService, EmailProcessor, CertificateProcessor],
  exports: [QueueService, BullModule],
})
export class QueueModule {}

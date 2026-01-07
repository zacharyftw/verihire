import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, JobOptions } from 'bull';
import { QUEUE_NAMES } from './constants';

// Job types
export interface EmailJobData {
  type: 'verification' | 'password-reset' | 'welcome' | 'certificate-issued' | 'review-assigned';
  to: string;
  subject?: string;
  templateData: Record<string, unknown>;
}

export interface CertificateJobData {
  type: 'generate-pdf' | 'generate-image' | 'anchor-blockchain' | 'upload-storage';
  certificateId: string;
  data?: Record<string, unknown>;
}

export interface EvaluationJobData {
  type: 'ai-evaluation' | 'ml-scoring' | 'test-execution';
  submissionId: string;
  data?: Record<string, unknown>;
}

export interface BlockchainJobData {
  type: 'anchor-certificate' | 'verify-certificate' | 'batch-anchor';
  certificateId?: string;
  certificateIds?: string[];
  hash?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private emailQueue: Queue<EmailJobData>,
    @InjectQueue(QUEUE_NAMES.CERTIFICATE) private certificateQueue: Queue<CertificateJobData>,
    @InjectQueue(QUEUE_NAMES.EVALUATION) private evaluationQueue: Queue<EvaluationJobData>,
    @InjectQueue(QUEUE_NAMES.BLOCKCHAIN) private blockchainQueue: Queue<BlockchainJobData>
  ) {}

  // Email Queue Methods
  async addEmailJob(data: EmailJobData, options?: JobOptions) {
    const job = await this.emailQueue.add(data.type, data, {
      priority: this.getEmailPriority(data.type),
      ...options,
    });
    this.logger.log(`Email job ${job.id} added: ${data.type} to ${data.to}`);
    return job;
  }

  async sendVerificationEmail(to: string, token: string, name: string) {
    return this.addEmailJob({
      type: 'verification',
      to,
      templateData: { token, name },
    });
  }

  async sendPasswordResetEmail(to: string, token: string, name: string) {
    return this.addEmailJob({
      type: 'password-reset',
      to,
      templateData: { token, name },
    });
  }

  async sendWelcomeEmail(to: string, name: string) {
    return this.addEmailJob({
      type: 'welcome',
      to,
      templateData: { name },
    });
  }

  async sendCertificateIssuedEmail(to: string, certificateData: Record<string, unknown>) {
    return this.addEmailJob({
      type: 'certificate-issued',
      to,
      templateData: certificateData,
    });
  }

  async sendReviewAssignedEmail(to: string, reviewData: Record<string, unknown>) {
    return this.addEmailJob({
      type: 'review-assigned',
      to,
      templateData: reviewData,
    });
  }

  // Certificate Queue Methods
  async addCertificateJob(data: CertificateJobData, options?: JobOptions) {
    const job = await this.certificateQueue.add(data.type, data, {
      ...options,
    });
    this.logger.log(`Certificate job ${job.id} added: ${data.type} for ${data.certificateId}`);
    return job;
  }

  async generateCertificatePdf(certificateId: string) {
    return this.addCertificateJob({
      type: 'generate-pdf',
      certificateId,
    });
  }

  async generateCertificateImage(certificateId: string) {
    return this.addCertificateJob({
      type: 'generate-image',
      certificateId,
    });
  }

  async uploadCertificateToStorage(
    certificateId: string,
    data: { pdfBuffer?: Buffer; imageBuffer?: Buffer }
  ) {
    return this.addCertificateJob({
      type: 'upload-storage',
      certificateId,
      data,
    });
  }

  // Evaluation Queue Methods
  async addEvaluationJob(data: EvaluationJobData, options?: JobOptions) {
    const job = await this.evaluationQueue.add(data.type, data, {
      ...options,
    });
    this.logger.log(
      `Evaluation job ${job.id} added: ${data.type} for submission ${data.submissionId}`
    );
    return job;
  }

  async queueAiEvaluation(submissionId: string, data?: Record<string, unknown>) {
    return this.addEvaluationJob({
      type: 'ai-evaluation',
      submissionId,
      data,
    });
  }

  async queueMlScoring(submissionId: string, data?: Record<string, unknown>) {
    return this.addEvaluationJob({
      type: 'ml-scoring',
      submissionId,
      data,
    });
  }

  async queueTestExecution(submissionId: string, data?: Record<string, unknown>) {
    return this.addEvaluationJob({
      type: 'test-execution',
      submissionId,
      data,
    });
  }

  // Blockchain Queue Methods
  async addBlockchainJob(data: BlockchainJobData, options?: JobOptions) {
    const job = await this.blockchainQueue.add(data.type, data, {
      ...options,
    });
    this.logger.log(`Blockchain job ${job.id} added: ${data.type}`);
    return job;
  }

  async anchorCertificateOnChain(certificateId: string, hash: string) {
    return this.addBlockchainJob({
      type: 'anchor-certificate',
      certificateId,
      hash,
    });
  }

  async batchAnchorCertificates(certificateIds: string[]) {
    return this.addBlockchainJob({
      type: 'batch-anchor',
      certificateIds,
    });
  }

  // Queue Status Methods
  async getQueueStats() {
    const [emailStats, certStats, evalStats, blockchainStats] = await Promise.all([
      this.getQueueCounts(this.emailQueue),
      this.getQueueCounts(this.certificateQueue),
      this.getQueueCounts(this.evaluationQueue),
      this.getQueueCounts(this.blockchainQueue),
    ]);

    return {
      email: emailStats,
      certificate: certStats,
      evaluation: evalStats,
      blockchain: blockchainStats,
    };
  }

  private async getQueueCounts(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  private getEmailPriority(type: EmailJobData['type']): number {
    // Lower number = higher priority
    switch (type) {
      case 'password-reset':
        return 1;
      case 'verification':
        return 2;
      case 'certificate-issued':
        return 3;
      case 'review-assigned':
        return 4;
      case 'welcome':
        return 5;
      default:
        return 10;
    }
  }

  // Cleanup methods
  async cleanQueue(
    queueName: keyof typeof QUEUE_NAMES,
    status: 'completed' | 'failed' | 'delayed' | 'wait' | 'active',
    grace: number = 0
  ) {
    const queues: Record<string, Queue> = {
      EMAIL: this.emailQueue,
      CERTIFICATE: this.certificateQueue,
      EVALUATION: this.evaluationQueue,
      BLOCKCHAIN: this.blockchainQueue,
    };

    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Unknown queue: ${queueName}`);
    }

    await queue.clean(grace, status);
    this.logger.log(`Cleaned ${status} jobs from ${queueName} queue`);
  }

  async pauseQueue(queueName: keyof typeof QUEUE_NAMES) {
    const queues: Record<string, Queue> = {
      EMAIL: this.emailQueue,
      CERTIFICATE: this.certificateQueue,
      EVALUATION: this.evaluationQueue,
      BLOCKCHAIN: this.blockchainQueue,
    };

    const queue = queues[queueName];
    if (queue) {
      await queue.pause();
      this.logger.log(`Paused ${queueName} queue`);
    }
  }

  async resumeQueue(queueName: keyof typeof QUEUE_NAMES) {
    const queues: Record<string, Queue> = {
      EMAIL: this.emailQueue,
      CERTIFICATE: this.certificateQueue,
      EVALUATION: this.evaluationQueue,
      BLOCKCHAIN: this.blockchainQueue,
    };

    const queue = queues[queueName];
    if (queue) {
      await queue.resume();
      this.logger.log(`Resumed ${queueName} queue`);
    }
  }
}

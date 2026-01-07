import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../queue.module';
import { EvaluationJobData } from '../queue.service';

@Processor(QUEUE_NAMES.EVALUATION)
export class EvaluationProcessor {
  private readonly logger = new Logger(EvaluationProcessor.name);

  @OnQueueActive()
  onActive(job: Job<EvaluationJobData>) {
    this.logger.debug(
      `Processing evaluation job ${job.id}: ${job.data.type} for submission ${job.data.submissionId}`
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<EvaluationJobData>) {
    this.logger.log(`Evaluation job ${job.id} completed: ${job.data.type}`);
  }

  @OnQueueFailed()
  onFailed(job: Job<EvaluationJobData>, error: Error) {
    this.logger.error(`Evaluation job ${job.id} failed: ${error.message}`, error.stack);
  }

  @Process('ai-evaluation')
  async handleAiEvaluation(job: Job<EvaluationJobData>) {
    const { submissionId, data: _data } = job.data;
    this.logger.log(`Running AI evaluation for submission ${submissionId}`);

    // This will call the AI evaluation service
    // Simulating a longer process for AI evaluation
    await this.simulateProcessing(2000);

    return {
      submissionId,
      type: 'ai-evaluation',
      status: 'completed',
      // In production, this would contain actual AI scores
      scores: {
        overall: Math.random() * 40 + 60, // 60-100
        codeQuality: Math.random() * 40 + 60,
        correctness: Math.random() * 40 + 60,
        efficiency: Math.random() * 40 + 60,
      },
    };
  }

  @Process('ml-scoring')
  async handleMlScoring(job: Job<EvaluationJobData>) {
    const { submissionId, data: _data } = job.data;
    this.logger.log(`Running ML scoring for submission ${submissionId}`);

    // This will call the ML service
    await this.simulateProcessing(1500);

    return {
      submissionId,
      type: 'ml-scoring',
      status: 'completed',
      scores: {
        codebert: Math.random() * 40 + 60,
        bert: Math.random() * 40 + 60,
      },
    };
  }

  @Process('test-execution')
  async handleTestExecution(job: Job<EvaluationJobData>) {
    const { submissionId, data: _data } = job.data;
    this.logger.log(`Executing tests for submission ${submissionId}`);

    // This will integrate with the code execution sandbox
    await this.simulateProcessing(3000);

    const totalTests = 10;
    const passedTests = Math.floor(Math.random() * 3) + 7; // 7-10 passed

    return {
      submissionId,
      type: 'test-execution',
      status: 'completed',
      results: {
        totalTests,
        passedTests,
        failedTests: totalTests - passedTests,
        passRate: (passedTests / totalTests) * 100,
        executionTime: Math.random() * 5000 + 1000, // 1-6 seconds
      },
    };
  }

  private async simulateProcessing(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

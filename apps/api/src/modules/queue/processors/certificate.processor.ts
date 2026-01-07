import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../constants';
import { CertificateJobData } from '../queue.service';

@Processor(QUEUE_NAMES.CERTIFICATE)
export class CertificateProcessor {
  private readonly logger = new Logger(CertificateProcessor.name);

  @OnQueueActive()
  onActive(job: Job<CertificateJobData>) {
    this.logger.debug(
      `Processing certificate job ${job.id}: ${job.data.type} for ${job.data.certificateId}`
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<CertificateJobData>) {
    this.logger.log(`Certificate job ${job.id} completed: ${job.data.type}`);
  }

  @OnQueueFailed()
  onFailed(job: Job<CertificateJobData>, error: Error) {
    this.logger.error(`Certificate job ${job.id} failed: ${error.message}`, error.stack);
  }

  @Process('generate-pdf')
  async handleGeneratePdf(job: Job<CertificateJobData>) {
    const { certificateId } = job.data;
    this.logger.log(`Generating PDF for certificate ${certificateId}`);

    // This will be integrated with the PDF generator service
    // For now, we simulate the process
    await this.simulateProcessing(500);

    return {
      certificateId,
      type: 'pdf',
      status: 'generated',
      // In production, this would return the PDF buffer or URL
    };
  }

  @Process('generate-image')
  async handleGenerateImage(job: Job<CertificateJobData>) {
    const { certificateId } = job.data;
    this.logger.log(`Generating image for certificate ${certificateId}`);

    await this.simulateProcessing(300);

    return {
      certificateId,
      type: 'image',
      status: 'generated',
    };
  }

  @Process('upload-storage')
  async handleUploadStorage(job: Job<CertificateJobData>) {
    const { certificateId, data } = job.data;
    this.logger.log(`Uploading certificate ${certificateId} to storage`);

    // This will be integrated with the storage service
    await this.simulateProcessing(200);

    const uploadedFiles: string[] = [];
    if (data?.pdfBuffer) {
      uploadedFiles.push('pdf');
    }
    if (data?.imageBuffer) {
      uploadedFiles.push('image');
    }

    return {
      certificateId,
      status: 'uploaded',
      files: uploadedFiles,
    };
  }

  @Process('anchor-blockchain')
  async handleAnchorBlockchain(job: Job<CertificateJobData>) {
    const { certificateId } = job.data;
    this.logger.log(`Anchoring certificate ${certificateId} to blockchain`);

    // This will be integrated with the blockchain service
    await this.simulateProcessing(1000);

    return {
      certificateId,
      status: 'anchored',
      // In production, this would return the transaction hash
      txHash: `0x${Math.random().toString(16).substring(2)}`,
    };
  }

  private async simulateProcessing(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

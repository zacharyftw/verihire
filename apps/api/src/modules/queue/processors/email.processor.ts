import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../queue.module';
import { EmailJobData } from '../queue.service';

@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  @OnQueueActive()
  onActive(job: Job<EmailJobData>) {
    this.logger.debug(`Processing email job ${job.id}: ${job.data.type} to ${job.data.to}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job<EmailJobData>) {
    this.logger.log(`Email job ${job.id} completed: ${job.data.type} to ${job.data.to}`);
  }

  @OnQueueFailed()
  onFailed(job: Job<EmailJobData>, error: Error) {
    this.logger.error(`Email job ${job.id} failed: ${error.message}`, error.stack);
  }

  @Process('verification')
  async handleVerificationEmail(job: Job<EmailJobData>) {
    const { to, templateData } = job.data;
    this.logger.log(`Sending verification email to ${to}`);

    // TODO: Integrate with actual email service
    // For now, we'll simulate the email sending
    await this.sendEmail(
      to,
      'Verify your VeriHire account',
      this.getVerificationTemplate(templateData)
    );

    return { sent: true, to, type: 'verification' };
  }

  @Process('password-reset')
  async handlePasswordResetEmail(job: Job<EmailJobData>) {
    const { to, templateData } = job.data;
    this.logger.log(`Sending password reset email to ${to}`);

    await this.sendEmail(
      to,
      'Reset your VeriHire password',
      this.getPasswordResetTemplate(templateData)
    );

    return { sent: true, to, type: 'password-reset' };
  }

  @Process('welcome')
  async handleWelcomeEmail(job: Job<EmailJobData>) {
    const { to, templateData } = job.data;
    this.logger.log(`Sending welcome email to ${to}`);

    await this.sendEmail(to, 'Welcome to VeriHire!', this.getWelcomeTemplate(templateData));

    return { sent: true, to, type: 'welcome' };
  }

  @Process('certificate-issued')
  async handleCertificateIssuedEmail(job: Job<EmailJobData>) {
    const { to, templateData } = job.data;
    this.logger.log(`Sending certificate issued email to ${to}`);

    await this.sendEmail(
      to,
      'Your VeriHire Certificate is Ready!',
      this.getCertificateIssuedTemplate(templateData)
    );

    return { sent: true, to, type: 'certificate-issued' };
  }

  @Process('review-assigned')
  async handleReviewAssignedEmail(job: Job<EmailJobData>) {
    const { to, templateData } = job.data;
    this.logger.log(`Sending review assigned email to ${to}`);

    await this.sendEmail(
      to,
      'New Review Assignment on VeriHire',
      this.getReviewAssignedTemplate(templateData)
    );

    return { sent: true, to, type: 'review-assigned' };
  }

  // Email sending simulation - will be replaced with actual nodemailer integration
  private async sendEmail(to: string, subject: string, _html: string): Promise<void> {
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 100));

    this.logger.debug(`Email sent to ${to}: ${subject}`);
    // In production, this would use nodemailer or another email service
  }

  // Email templates
  private getVerificationTemplate(data: Record<string, unknown>): string {
    return `
      <h1>Verify your email</h1>
      <p>Hi ${data.name || 'there'},</p>
      <p>Please verify your email by clicking the link below:</p>
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${data.token}">
        Verify Email
      </a>
      <p>This link will expire in 24 hours.</p>
    `;
  }

  private getPasswordResetTemplate(data: Record<string, unknown>): string {
    return `
      <h1>Reset your password</h1>
      <p>Hi ${data.name || 'there'},</p>
      <p>You requested a password reset. Click the link below to set a new password:</p>
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${data.token}">
        Reset Password
      </a>
      <p>This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
    `;
  }

  private getWelcomeTemplate(data: Record<string, unknown>): string {
    return `
      <h1>Welcome to VeriHire!</h1>
      <p>Hi ${data.name || 'there'},</p>
      <p>Thank you for joining VeriHire, the AI-powered skill certification platform.</p>
      <p>Get started by:</p>
      <ul>
        <li>Completing your profile</li>
        <li>Taking a skill challenge</li>
        <li>Earning your first certificate</li>
      </ul>
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/dashboard">Go to Dashboard</a>
    `;
  }

  private getCertificateIssuedTemplate(data: Record<string, unknown>): string {
    return `
      <h1>Congratulations! Your Certificate is Ready</h1>
      <p>Hi ${data.candidateName || 'there'},</p>
      <p>You have successfully earned a certificate for <strong>${data.skillName || 'your skill'}</strong>!</p>
      <p>Certificate Details:</p>
      <ul>
        <li>Certificate Number: ${data.certificateNumber || 'N/A'}</li>
        <li>Score: ${data.score || 'N/A'}%</li>
        <li>Grade: ${data.grade || 'N/A'}</li>
      </ul>
      <a href="${data.verificationUrl || '#'}">View Certificate</a>
      <p>Share your achievement with employers and on social media!</p>
    `;
  }

  private getReviewAssignedTemplate(data: Record<string, unknown>): string {
    return `
      <h1>New Review Assignment</h1>
      <p>Hi ${data.reviewerName || 'there'},</p>
      <p>You have been assigned a new submission to review.</p>
      <p>Details:</p>
      <ul>
        <li>Skill: ${data.skillName || 'N/A'}</li>
        <li>Challenge: ${data.challengeTitle || 'N/A'}</li>
        <li>Deadline: ${data.deadline || 'N/A'}</li>
      </ul>
      <a href="${process.env.APP_URL || 'http://localhost:3000'}/reviews/${data.reviewId}">Start Review</a>
    `;
  }
}

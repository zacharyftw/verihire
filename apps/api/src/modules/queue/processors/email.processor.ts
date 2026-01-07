import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';
import { QUEUE_NAMES } from '../constants';
import { EmailJobData } from '../queue.service';

@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private transporter: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get('mail.host', 'localhost');
    const port = this.configService.get('mail.port', 1025);
    const user = this.configService.get('mail.user');
    const pass = this.configService.get('mail.pass');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    this.fromAddress = this.configService.get('mail.from', 'VeriHire <noreply@verihire.com>');
    this.appUrl = this.configService.get('APP_URL', 'http://localhost:3100');
  }

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

  // Send email using nodemailer
  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
      });
      this.logger.debug(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error}`);
      throw error; // Re-throw to trigger Bull retry
    }
  }

  // Email templates with professional styling
  private getBaseTemplate(content: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">VeriHire</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            ${content}
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              &copy; ${new Date().getFullYear()} VeriHire. All rights reserved.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private getVerificationTemplate(data: Record<string, unknown>): string {
    const verifyUrl = `${this.appUrl}/auth/verify-email?token=${data.token}`;
    return this.getBaseTemplate(`
      <h2 style="color: #333;">Welcome to VeriHire!</h2>
      <p>Hi ${data.name || 'there'},</p>
      <p>Thanks for signing up! Please verify your email address to get started:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verify Email</a>
      </div>
      <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
      <p style="color: #666; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
    `);
  }

  private getPasswordResetTemplate(data: Record<string, unknown>): string {
    const resetUrl = `${this.appUrl}/auth/reset-password?token=${data.token}`;
    return this.getBaseTemplate(`
      <h2 style="color: #333;">Reset Your Password</h2>
      <p>Hi ${data.name || 'there'},</p>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
      </div>
      <p style="color: #666; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
      <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email.</p>
    `);
  }

  private getWelcomeTemplate(data: Record<string, unknown>): string {
    return this.getBaseTemplate(`
      <h2 style="color: #333;">Welcome to VeriHire!</h2>
      <p>Hi ${data.name || 'there'},</p>
      <p>Thank you for joining VeriHire, the AI-powered skill certification platform.</p>
      <p>Get started by:</p>
      <ul style="color: #666;">
        <li>Completing your profile</li>
        <li>Taking a skill challenge</li>
        <li>Earning your first certificate</li>
      </ul>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${this.appUrl}/dashboard" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Go to Dashboard</a>
      </div>
    `);
  }

  private getCertificateIssuedTemplate(data: Record<string, unknown>): string {
    return this.getBaseTemplate(`
      <h2 style="color: #333;">Congratulations! Your Certificate is Ready</h2>
      <p>Hi ${data.candidateName || 'there'},</p>
      <p>You have successfully earned a certificate for <strong>${data.skillName || 'your skill'}</strong>!</p>
      <div style="background: #fff; padding: 20px; border-radius: 5px; margin: 20px 0; border: 1px solid #ddd;">
        <p style="margin: 5px 0;"><strong>Certificate Number:</strong> ${data.certificateNumber || 'N/A'}</p>
        <p style="margin: 5px 0;"><strong>Score:</strong> ${data.score || 'N/A'}%</p>
        <p style="margin: 5px 0;"><strong>Grade:</strong> ${data.grade || 'N/A'}</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.verificationUrl || '#'}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">View Certificate</a>
      </div>
      <p style="color: #666; font-size: 14px;">Share your achievement with employers and on social media!</p>
    `);
  }

  private getReviewAssignedTemplate(data: Record<string, unknown>): string {
    return this.getBaseTemplate(`
      <h2 style="color: #333;">New Review Assignment</h2>
      <p>Hi ${data.reviewerName || 'there'},</p>
      <p>You have been assigned a new submission to review.</p>
      <div style="background: #fff; padding: 20px; border-radius: 5px; margin: 20px 0; border: 1px solid #ddd;">
        <p style="margin: 5px 0;"><strong>Skill:</strong> ${data.skillName || 'N/A'}</p>
        <p style="margin: 5px 0;"><strong>Challenge:</strong> ${data.challengeTitle || 'N/A'}</p>
        <p style="margin: 5px 0;"><strong>Deadline:</strong> ${data.deadline || 'N/A'}</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${this.appUrl}/reviews/${data.reviewId}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Start Review</a>
      </div>
    `);
  }
}

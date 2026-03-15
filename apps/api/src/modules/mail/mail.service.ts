import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
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

  async sendVerificationEmail(to: string, token: string, name: string): Promise<void> {
    const verifyUrl = `${this.appUrl}/auth/verify-email?token=${token}`;
    await this.send(
      to,
      'Verify your VeriHire account',
      this.base(`
      <h2>Welcome to VeriHire!</h2>
      <p>Hi ${name},</p>
      <p>Thanks for signing up! Please verify your email address to get started:</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="${verifyUrl}" style="${this.btnStyle}">Verify Email</a>
      </div>
      <p style="color:#666;font-size:14px;">This link expires in 24 hours.</p>
    `)
    );
  }

  async sendPasswordResetEmail(to: string, token: string, name: string): Promise<void> {
    const resetUrl = `${this.appUrl}/auth/reset-password?token=${token}`;
    await this.send(
      to,
      'Reset your VeriHire password',
      this.base(`
      <h2>Reset Your Password</h2>
      <p>Hi ${name},</p>
      <p>Click the button below to create a new password:</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="${resetUrl}" style="${this.btnStyle}">Reset Password</a>
      </div>
      <p style="color:#666;font-size:14px;">This link expires in 1 hour.</p>
    `)
    );
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    await this.send(
      to,
      'Welcome to VeriHire!',
      this.base(`
      <h2>Welcome to VeriHire!</h2>
      <p>Hi ${name},</p>
      <p>Thank you for joining VeriHire, the AI-powered skill certification platform.</p>
      <ul style="color:#666;">
        <li>Complete your profile</li>
        <li>Take a skill challenge</li>
        <li>Earn your first certificate</li>
      </ul>
      <div style="text-align:center;margin:30px 0;">
        <a href="${this.appUrl}/dashboard" style="${this.btnStyle}">Go to Dashboard</a>
      </div>
    `)
    );
  }

  async sendCertificateIssuedEmail(
    to: string,
    data: {
      candidateName: string;
      skillName: string;
      certificateNumber: string;
      score: number;
      grade: string;
      verificationUrl: string;
    }
  ): Promise<void> {
    await this.send(
      to,
      'Your VeriHire Certificate is Ready!',
      this.base(`
      <h2>Congratulations! Your Certificate is Ready</h2>
      <p>Hi ${data.candidateName},</p>
      <p>You have earned a certificate for <strong>${data.skillName}</strong>!</p>
      <div style="background:#fff;padding:20px;border-radius:5px;margin:20px 0;border:1px solid #ddd;">
        <p><strong>Certificate Number:</strong> ${data.certificateNumber}</p>
        <p><strong>Score:</strong> ${data.score}%</p>
        <p><strong>Grade:</strong> ${data.grade}</p>
      </div>
      <div style="text-align:center;margin:30px 0;">
        <a href="${data.verificationUrl}" style="${this.btnStyle}">View Certificate</a>
      </div>
    `)
    );
  }

  async sendReviewAssignedEmail(
    to: string,
    data: {
      reviewerName: string;
      skillName: string;
      challengeTitle?: string;
      deadline?: string;
      reviewUrl: string;
    }
  ): Promise<void> {
    await this.send(
      to,
      'New Review Assignment on VeriHire',
      this.base(`
      <h2>New Review Assignment</h2>
      <p>Hi ${data.reviewerName},</p>
      <p>You have been assigned a new submission to review.</p>
      <div style="background:#fff;padding:20px;border-radius:5px;margin:20px 0;border:1px solid #ddd;">
        <p><strong>Skill:</strong> ${data.skillName}</p>
        ${data.challengeTitle ? `<p><strong>Challenge:</strong> ${data.challengeTitle}</p>` : ''}
        ${data.deadline ? `<p><strong>Deadline:</strong> ${data.deadline}</p>` : ''}
      </div>
      <div style="text-align:center;margin:30px 0;">
        <a href="${data.reviewUrl}" style="${this.btnStyle}">Start Review</a>
      </div>
    `)
    );
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.fromAddress, to, subject, html });
      this.logger.debug(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error}`);
    }
  }

  private get btnStyle(): string {
    return 'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:15px 30px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;';
  }

  private base(content: string): string {
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
        <h1 style="color:white;margin:0;">VeriHire</h1>
      </div>
      <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
        ${content}
        <hr style="border:none;border-top:1px solid #ddd;margin:30px 0;">
        <p style="color:#999;font-size:12px;text-align:center;">&copy; ${new Date().getFullYear()} VeriHire. All rights reserved.</p>
      </div>
    </body></html>`;
  }
}

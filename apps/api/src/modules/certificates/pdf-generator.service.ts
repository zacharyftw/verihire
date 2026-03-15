import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { CertificateResponseDto } from './dto';
import { QrCodeService } from './qrcode.service';

/**
 * PDF Generator Service for Certificates
 *
 * Generates professional PDF certificates using pdfkit
 */
@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private readonly baseUrl: string;

  // Certificate layout constants
  private readonly PAGE_WIDTH = 842; // A4 landscape width in points
  private readonly PAGE_HEIGHT = 595; // A4 landscape height in points
  private readonly MARGIN = 50;

  // Color scheme
  private readonly COLORS = {
    primary: '#1a365d', // Dark blue
    secondary: '#2c5282', // Medium blue
    accent: '#4299e1', // Light blue
    gold: '#d69e2e', // Gold for borders
    text: '#2d3748', // Dark gray
    lightText: '#718096', // Light gray
    white: '#ffffff',
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly qrCodeService: QrCodeService
  ) {
    this.baseUrl = this.configService.get<string>('APP_URL', 'https://verihire.io');
  }

  /**
   * Generate a professional PDF certificate
   *
   * @param certificate - Certificate data
   * @returns PDF buffer
   */
  async generatePdf(certificate: CertificateResponseDto): Promise<Buffer> {
    const qrBuffer = await this.qrCodeService.generateBuffer(
      certificate.verification.verificationUrl,
      120
    );

    return new Promise((resolve, reject) => {
      try {
        const chunks: Buffer[] = [];

        // Create PDF document in landscape A4
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margin: this.MARGIN,
          info: {
            Title: `VeriHire Certificate - ${certificate.certificateNumber}`,
            Author: 'VeriHire Platform',
            Subject: `${certificate.skill.name} Certification`,
            Keywords: 'certificate, skill, verification, verihire',
            Creator: 'VeriHire Certificate Generator',
          },
        });

        // Collect chunks
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Draw certificate content
        this.drawBackground(doc);
        this.drawBorder(doc);
        this.drawHeader(doc);
        this.drawCandidateName(doc, certificate);
        this.drawSkillInfo(doc, certificate);
        this.drawScoreSection(doc, certificate);
        this.drawDates(doc, certificate);
        this.drawVerificationSection(doc, certificate, qrBuffer);
        this.drawFooter(doc, certificate);

        // Finalize
        doc.end();
      } catch (error) {
        this.logger.error('PDF generation failed', error);
        reject(error);
      }
    });
  }

  /**
   * Generate a shareable image for social media
   * Note: For actual image generation, consider using canvas or sharp
   * This is a placeholder that returns a simple PNG representation
   */
  async generateShareableImage(certificate: CertificateResponseDto): Promise<Buffer> {
    // For now, return a QR code as the shareable image
    // In production, use canvas or sharp for proper image generation
    const qrBuffer = await this.qrCodeService.generateBuffer(
      certificate.verification.verificationUrl,
      600
    );
    return qrBuffer;
  }

  private drawBackground(doc: PDFKit.PDFDocument): void {
    // Light gradient effect (simulated)
    doc.rect(0, 0, this.PAGE_WIDTH, this.PAGE_HEIGHT).fill(this.COLORS.white);

    // Subtle pattern in corners
    doc
      .save()
      .opacity(0.05)
      .circle(0, 0, 200)
      .fill(this.COLORS.accent)
      .circle(this.PAGE_WIDTH, this.PAGE_HEIGHT, 200)
      .fill(this.COLORS.accent)
      .restore();
  }

  private drawBorder(doc: PDFKit.PDFDocument): void {
    const borderMargin = 30;

    // Outer gold border
    doc
      .rect(
        borderMargin,
        borderMargin,
        this.PAGE_WIDTH - borderMargin * 2,
        this.PAGE_HEIGHT - borderMargin * 2
      )
      .lineWidth(3)
      .stroke(this.COLORS.gold);

    // Inner blue border
    doc
      .rect(
        borderMargin + 8,
        borderMargin + 8,
        this.PAGE_WIDTH - (borderMargin + 8) * 2,
        this.PAGE_HEIGHT - (borderMargin + 8) * 2
      )
      .lineWidth(1)
      .stroke(this.COLORS.primary);
  }

  private drawHeader(doc: PDFKit.PDFDocument): void {
    const centerX = this.PAGE_WIDTH / 2;

    // VeriHire logo/text
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(this.COLORS.secondary)
      .text('VERIHIRE', centerX - 40, 55, { width: 80, align: 'center' });

    // Certificate title
    doc
      .font('Helvetica-Bold')
      .fontSize(36)
      .fillColor(this.COLORS.primary)
      .text('CERTIFICATE', centerX - 200, 85, { width: 400, align: 'center' });

    doc
      .font('Helvetica')
      .fontSize(16)
      .fillColor(this.COLORS.secondary)
      .text('OF SKILL PROFICIENCY', centerX - 200, 125, { width: 400, align: 'center' });

    // Decorative line
    doc
      .moveTo(centerX - 150, 155)
      .lineTo(centerX + 150, 155)
      .lineWidth(2)
      .stroke(this.COLORS.gold);
  }

  private drawCandidateName(doc: PDFKit.PDFDocument, certificate: CertificateResponseDto): void {
    const centerX = this.PAGE_WIDTH / 2;

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor(this.COLORS.lightText)
      .text('This is to certify that', centerX - 200, 175, { width: 400, align: 'center' });

    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(this.COLORS.primary)
      .text(certificate.candidate.name, centerX - 250, 195, { width: 500, align: 'center' });

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor(this.COLORS.lightText)
      .text('has successfully demonstrated proficiency in', centerX - 200, 235, {
        width: 400,
        align: 'center',
      });
  }

  private drawSkillInfo(doc: PDFKit.PDFDocument, certificate: CertificateResponseDto): void {
    const centerX = this.PAGE_WIDTH / 2;

    // Skill name
    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor(this.COLORS.accent)
      .text(certificate.skill.name.toUpperCase(), centerX - 250, 260, {
        width: 500,
        align: 'center',
      });

    // Skill level badge
    const level = certificate.skill.level.toUpperCase();
    const badgeWidth = 120;
    const badgeHeight = 25;
    const badgeX = centerX - badgeWidth / 2;
    const badgeY = 295;

    // Badge background
    doc
      .roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 5)
      .fill(this.getLevelColor(certificate.skill.level));

    // Badge text
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(this.COLORS.white)
      .text(level, badgeX, badgeY + 7, { width: badgeWidth, align: 'center' });

    // Category
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(this.COLORS.lightText)
      .text(`Category: ${certificate.skill.category}`, centerX - 100, 330, {
        width: 200,
        align: 'center',
      });
  }

  private drawScoreSection(doc: PDFKit.PDFDocument, certificate: CertificateResponseDto): void {
    const startX = 80;
    const startY = 360;

    // Score box
    doc.roundedRect(startX, startY, 150, 80, 5).fill(this.COLORS.primary);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(this.COLORS.white)
      .text('SCORE', startX, startY + 10, { width: 150, align: 'center' });

    doc
      .font('Helvetica-Bold')
      .fontSize(32)
      .text(`${certificate.evaluation.score.toFixed(1)}`, startX, startY + 25, {
        width: 150,
        align: 'center',
      });

    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Grade: ${certificate.evaluation.grade}`, startX, startY + 60, {
        width: 150,
        align: 'center',
      });

    // Percentile (if available)
    if (certificate.evaluation.percentile) {
      doc.roundedRect(startX + 170, startY, 150, 80, 5).fill(this.COLORS.secondary);

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(this.COLORS.white)
        .text('PERCENTILE', startX + 170, startY + 10, { width: 150, align: 'center' });

      const percentileText = `Top ${(100 - certificate.evaluation.percentile).toFixed(0)}%`;
      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .text(percentileText, startX + 170, startY + 30, { width: 150, align: 'center' });
    }

    // Challenge info
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(this.COLORS.lightText)
      .text(`Challenge: ${certificate.evaluation.challengeTitle}`, startX, startY + 90, {
        width: 320,
      });
  }

  private drawDates(doc: PDFKit.PDFDocument, certificate: CertificateResponseDto): void {
    const startX = 80;
    const startY = 470;

    // Issue date
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(this.COLORS.text)
      .text('Issued On:', startX, startY);

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(this.formatDate(certificate.issuedAt), startX, startY + 15);

    // Expiry date (if applicable)
    if (certificate.expiresAt) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(this.COLORS.text)
        .text('Valid Until:', startX + 150, startY);

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(this.formatDate(certificate.expiresAt), startX + 150, startY + 15);
    }
  }

  private drawVerificationSection(
    doc: PDFKit.PDFDocument,
    certificate: CertificateResponseDto,
    qrBuffer?: Buffer
  ): void {
    const qrX = this.PAGE_WIDTH - 200;
    const qrY = 350;

    // QR code — embed real image or fallback to placeholder box
    if (qrBuffer) {
      doc.image(qrBuffer, qrX, qrY, { width: 120, height: 120 });
    } else {
      doc.rect(qrX, qrY, 120, 120).lineWidth(1).stroke(this.COLORS.lightText);
    }

    // QR code label
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(this.COLORS.lightText)
      .text('Scan to Verify', qrX, qrY + 125, { width: 120, align: 'center' });

    // Verification info
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(this.COLORS.lightText)
      .text('Certificate ID:', qrX, qrY + 145);

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(this.COLORS.text)
      .text(certificate.certificateNumber, qrX, qrY + 157);

    // Hash preview
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(this.COLORS.lightText)
      .text('Hash: ' + certificate.verification.hash.substring(0, 16) + '...', qrX, qrY + 175);
  }

  private drawFooter(doc: PDFKit.PDFDocument, certificate: CertificateResponseDto): void {
    const centerX = this.PAGE_WIDTH / 2;
    const footerY = this.PAGE_HEIGHT - 60;

    // Signature line
    doc
      .moveTo(centerX - 100, footerY - 10)
      .lineTo(centerX + 100, footerY - 10)
      .lineWidth(1)
      .stroke(this.COLORS.text);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(this.COLORS.text)
      .text('VeriHire Platform', centerX - 100, footerY - 5, { width: 200, align: 'center' });

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(this.COLORS.lightText)
      .text('Authorized Digital Signature', centerX - 100, footerY + 8, {
        width: 200,
        align: 'center',
      });

    // Verification URL
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(this.COLORS.accent)
      .text(
        `Verify at: ${certificate.verification.verificationUrl}`,
        this.MARGIN,
        this.PAGE_HEIGHT - 40,
        { width: this.PAGE_WIDTH - this.MARGIN * 2, align: 'center' }
      );

    // Metadata
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor(this.COLORS.lightText)
      .text(
        `${certificate.metadata.issuer} | ${certificate.metadata.standard} | Version ${certificate.version}`,
        this.MARGIN,
        this.PAGE_HEIGHT - 30,
        { width: this.PAGE_WIDTH - this.MARGIN * 2, align: 'center' }
      );
  }

  private getLevelColor(level: string): string {
    const colors: Record<string, string> = {
      beginner: '#48bb78', // Green
      intermediate: '#4299e1', // Blue
      advanced: '#9f7aea', // Purple
      expert: '#ed8936', // Orange
    };
    return colors[level.toLowerCase()] || this.COLORS.accent;
  }

  private formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

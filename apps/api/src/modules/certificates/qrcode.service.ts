import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';

/**
 * QR Code Service for Certificate Generation
 *
 * Generates QR codes for certificate verification URLs
 */
@Injectable()
export class QrCodeService {
  private readonly logger = new Logger(QrCodeService.name);

  /**
   * Generate QR code as data URL (base64 PNG)
   *
   * @param data - The data to encode (typically verification URL)
   * @param size - Size of the QR code in pixels
   * @returns Base64-encoded PNG data URL
   */
  async generateDataUrl(data: string, size: number = 200): Promise<string> {
    try {
      const qrDataUrl = await QRCode.toDataURL(data, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H', // High error correction for reliability
      });

      return qrDataUrl;
    } catch (error) {
      this.logger.error('Failed to generate QR code data URL', error);
      throw new Error('QR code generation failed');
    }
  }

  /**
   * Generate QR code as Buffer (PNG)
   *
   * @param data - The data to encode
   * @param size - Size of the QR code in pixels
   * @returns PNG buffer
   */
  async generateBuffer(data: string, size: number = 200): Promise<Buffer> {
    try {
      const buffer = await QRCode.toBuffer(data, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });

      return buffer;
    } catch (error) {
      this.logger.error('Failed to generate QR code buffer', error);
      throw new Error('QR code generation failed');
    }
  }

  /**
   * Generate QR code as SVG string
   *
   * @param data - The data to encode
   * @param size - Size of the QR code
   * @returns SVG string
   */
  async generateSvg(data: string, size: number = 200): Promise<string> {
    try {
      const svg = await QRCode.toString(data, {
        type: 'svg',
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });

      return svg;
    } catch (error) {
      this.logger.error('Failed to generate QR code SVG', error);
      throw new Error('QR code generation failed');
    }
  }
}

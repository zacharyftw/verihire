import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import * as mimeTypes from 'mime-types';
import { v4 as uuidv4 } from 'uuid';

export interface UploadOptions {
  folder?: string;
  filename?: string;
  contentType?: string;
  metadata?: Record<string, string>;
  isPublic?: boolean;
}

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
  contentType: string;
  size: number;
}

export interface FileInfo {
  key: string;
  size: number;
  lastModified: Date;
  contentType?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;
  private bucket: string;
  private endpoint: string;
  private isMinIO: boolean;

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.get<string>('storage.endpoint') || 'http://localhost:9000';
    const accessKey = this.configService.get<string>('storage.accessKey') || 'minioadmin';
    const secretKey = this.configService.get<string>('storage.secretKey') || 'minioadmin';
    this.bucket = this.configService.get<string>('storage.bucket') || 'verihire';
    this.endpoint = endpoint;
    this.isMinIO = endpoint.includes('localhost') || endpoint.includes('minio');

    this.s3Client = new S3Client({
      endpoint,
      region: 'us-east-1', // Required for MinIO, ignored if using real S3
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    });

    this.logger.log(`Storage service initialized with endpoint: ${endpoint}`);
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  /**
   * Ensure the bucket exists, create if not
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" exists`);
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
        this.logger.log(`Creating bucket "${this.bucket}"...`);
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`Bucket "${this.bucket}" created successfully`);
        } catch (createError) {
          this.logger.warn(`Could not create bucket: ${createError}`);
        }
      } else {
        this.logger.warn(`Could not check bucket: ${error}`);
      }
    }
  }

  /**
   * Upload a file from buffer
   */
  async uploadBuffer(
    buffer: Buffer,
    originalFilename: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const { folder = '', filename, contentType, metadata = {}, isPublic = false } = options;

    const ext = originalFilename.split('.').pop() || '';
    const key = this.generateKey(folder, filename || `${uuidv4()}.${ext}`);
    const detectedContentType =
      contentType || mimeTypes.lookup(originalFilename) || 'application/octet-stream';

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: detectedContentType,
          Metadata: metadata,
          ACL: isPublic ? 'public-read' : 'private',
        })
      );

      const url = this.getFileUrl(key);
      this.logger.log(`File uploaded: ${key} (${buffer.length} bytes)`);

      return {
        key,
        url,
        bucket: this.bucket,
        contentType: detectedContentType,
        size: buffer.length,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error}`);
      throw error;
    }
  }

  /**
   * Upload a file from stream (for large files)
   */
  async uploadStream(
    stream: Readable,
    originalFilename: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const { folder = '', filename, contentType, metadata = {} } = options;

    const ext = originalFilename.split('.').pop() || '';
    const key = this.generateKey(folder, filename || `${uuidv4()}.${ext}`);
    const detectedContentType =
      contentType || mimeTypes.lookup(originalFilename) || 'application/octet-stream';

    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: stream,
          ContentType: detectedContentType,
          Metadata: metadata,
        },
      });

      const _result = await upload.done();
      const url = this.getFileUrl(key);

      this.logger.log(`File uploaded via stream: ${key}`);

      return {
        key,
        url,
        bucket: this.bucket,
        contentType: detectedContentType,
        size: 0, // Size unknown for streams
      };
    } catch (error) {
      this.logger.error(`Failed to upload stream: ${error}`);
      throw error;
    }
  }

  /**
   * Upload certificate PDF
   */
  async uploadCertificatePdf(certificateId: string, pdfBuffer: Buffer): Promise<UploadResult> {
    return this.uploadBuffer(pdfBuffer, `${certificateId}.pdf`, {
      folder: 'certificates/pdf',
      filename: `${certificateId}.pdf`,
      contentType: 'application/pdf',
      metadata: {
        certificateId,
        type: 'certificate-pdf',
      },
    });
  }

  /**
   * Upload certificate image
   */
  async uploadCertificateImage(certificateId: string, imageBuffer: Buffer): Promise<UploadResult> {
    return this.uploadBuffer(imageBuffer, `${certificateId}.png`, {
      folder: 'certificates/images',
      filename: `${certificateId}.png`,
      contentType: 'image/png',
      metadata: {
        certificateId,
        type: 'certificate-image',
      },
    });
  }

  /**
   * Upload candidate resume
   */
  async uploadResume(
    candidateId: string,
    buffer: Buffer,
    originalFilename: string
  ): Promise<UploadResult> {
    const ext = originalFilename.split('.').pop() || 'pdf';
    return this.uploadBuffer(buffer, originalFilename, {
      folder: `candidates/${candidateId}/resume`,
      filename: `resume.${ext}`,
      metadata: {
        candidateId,
        type: 'resume',
        originalFilename,
      },
    });
  }

  /**
   * Upload candidate portfolio file
   */
  async uploadPortfolioFile(
    candidateId: string,
    buffer: Buffer,
    originalFilename: string
  ): Promise<UploadResult> {
    return this.uploadBuffer(buffer, originalFilename, {
      folder: `candidates/${candidateId}/portfolio`,
      metadata: {
        candidateId,
        type: 'portfolio',
        originalFilename,
      },
    });
  }

  /**
   * Upload submission file (code, design, etc.)
   */
  async uploadSubmissionFile(
    submissionId: string,
    buffer: Buffer,
    originalFilename: string
  ): Promise<UploadResult> {
    return this.uploadBuffer(buffer, originalFilename, {
      folder: `submissions/${submissionId}`,
      metadata: {
        submissionId,
        type: 'submission',
        originalFilename,
      },
    });
  }

  /**
   * Get a file as buffer
   */
  async getFile(key: string): Promise<Buffer> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      this.logger.error(`Failed to get file ${key}: ${error}`);
      throw error;
    }
  }

  /**
   * Get file as stream
   */
  async getFileStream(key: string): Promise<Readable> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    return response.Body as Readable;
  }

  /**
   * Get file information
   */
  async getFileInfo(key: string): Promise<FileInfo | null> {
    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      return {
        key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        contentType: response.ContentType,
        metadata: response.Metadata,
      };
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    const info = await this.getFileInfo(key);
    return info !== null;
  }

  /**
   * Delete a file
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      this.logger.log(`File deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file ${key}: ${error}`);
      throw error;
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(prefix: string, maxKeys = 1000): Promise<FileInfo[]> {
    try {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: maxKeys,
        })
      );

      return (response.Contents || []).map(item => ({
        key: item.Key || '',
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
      }));
    } catch (error) {
      this.logger.error(`Failed to list files with prefix ${prefix}: ${error}`);
      throw error;
    }
  }

  /**
   * Generate a presigned URL for direct download
   */
  getFileUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  /**
   * Generate a time-limited signed URL for secure file access via Supabase Storage API
   */
  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      // Use Supabase Storage REST API to create a signed URL
      const supabaseUrl = this.endpoint.replace('/storage/v1/s3', '');
      const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/${this.bucket}/${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.configService.get<string>('S3_SECRET_KEY') || this.configService.get<string>('SUPABASE_SERVICE_KEY') || ''}`,
          apikey:
            this.configService.get<string>('SUPABASE_ANON_KEY') ||
            this.configService.get<string>('S3_ACCESS_KEY') ||
            '',
        },
        body: JSON.stringify({ expiresIn }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.signedURL) {
          return `${supabaseUrl}/storage/v1${data.signedURL}`;
        }
      }

      this.logger.warn(`Supabase signed URL failed, falling back to direct URL`);
      return this.getFileUrl(key);
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL for ${key}: ${error}`);
      return this.getFileUrl(key);
    }
  }

  /**
   * Generate storage key
   */
  private generateKey(folder: string, filename: string): string {
    const cleanFolder = folder.replace(/^\/|\/$/g, ''); // Remove leading/trailing slashes
    const cleanFilename = filename.replace(/^\//, ''); // Remove leading slash

    if (cleanFolder) {
      return `${cleanFolder}/${cleanFilename}`;
    }
    return cleanFilename;
  }

  /**
   * Get storage health status
   */
  async getHealthStatus(): Promise<{ healthy: boolean; bucket: string; endpoint: string }> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return {
        healthy: true,
        bucket: this.bucket,
        endpoint: this.endpoint,
      };
    } catch {
      return {
        healthy: false,
        bucket: this.bucket,
        endpoint: this.endpoint,
      };
    }
  }
}

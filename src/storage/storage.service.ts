import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
  key: string;
  url: string;
  isLocal: boolean;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private bucket: string;
  private region: string;
  private useLocalFallback: boolean;
  private localUploadPath: string;

  constructor(private configService: ConfigService) {
    this.region = this.configService.get<string>('aws.region') || 'eu-central-1';
    this.bucket = this.configService.get<string>('aws.s3Bucket') || 'recdesk-cvs';
    this.useLocalFallback =
      this.configService.get<string>('S3_USE_LOCAL_FALLBACK') === 'true' ||
      !this.configService.get<string>('aws.accessKeyId');
    this.localUploadPath = path.join(process.cwd(), 'uploads', 'cvs');
  }

  async onModuleInit() {
    if (this.useLocalFallback) {
      this.logger.warn(
        'S3 credentials not configured or local fallback enabled. Using local file storage.',
      );
      await this.ensureLocalDirectory();
    } else {
      this.initializeS3Client();
      await this.verifyBucketAccess();
    }
  }

  private initializeS3Client() {
    const accessKeyId = this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey = this.configService.get<string>('aws.secretAccessKey');

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn('AWS credentials not configured. Falling back to local storage.');
      this.useLocalFallback = true;
      return;
    }

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.logger.log(`S3 client initialized for region: ${this.region}, bucket: ${this.bucket}`);
  }

  private async verifyBucketAccess(): Promise<void> {
    if (!this.s3Client) return;

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Successfully connected to S3 bucket: ${this.bucket}`);
    } catch (error) {
      this.logger.error(`Failed to access S3 bucket: ${this.bucket}`, error);
      this.logger.warn('Falling back to local storage due to S3 access error.');
      this.useLocalFallback = true;
    }
  }

  private async ensureLocalDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.localUploadPath, { recursive: true });
      this.logger.log(`Local upload directory ensured: ${this.localUploadPath}`);
    } catch (error) {
      this.logger.error('Failed to create local upload directory', error);
    }
  }

  /**
   * Upload a file to S3 or local storage
   * @param buffer - File buffer
   * @param originalFilename - Original filename (for extension extraction)
   * @param contentType - MIME type of the file
   * @param companyId - Company ID for folder isolation
   * @param folder - Folder type within company (default: 'cvs')
   * @returns Upload result with key and URL
   *
   * Folder structure: {companyId}/{folder}/{uuid}.{ext}
   * Example: 550e8400-e29b-41d4-a716-446655440000/cvs/a1b2c3d4.pdf
   */
  async uploadFile(
    buffer: Buffer,
    originalFilename: string,
    contentType: string,
    companyId: string,
    folder: string = 'cvs',
  ): Promise<UploadResult> {
    const extension = path.extname(originalFilename).toLowerCase() || '.pdf';
    const key = `${companyId}/${folder}/${uuidv4()}${extension}`;

    if (this.useLocalFallback) {
      return this.uploadFileLocally(buffer, key);
    }

    return this.uploadFileToS3(buffer, key, contentType);
  }

  private async uploadFileToS3(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<UploadResult> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );

      this.logger.debug(`File uploaded to S3: ${key}`);

      return {
        key,
        url: `s3://${this.bucket}/${key}`,
        isLocal: false,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file to S3: ${key}`, error);
      throw error;
    }
  }

  private async uploadFileLocally(buffer: Buffer, key: string): Promise<UploadResult> {
    const filePath = path.join(process.cwd(), 'uploads', key);
    const directory = path.dirname(filePath);

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, buffer);

    this.logger.debug(`File saved locally: ${filePath}`);

    return {
      key,
      url: `/uploads/${key}`,
      isLocal: true,
    };
  }

  /**
   * Generate a presigned URL for secure file access
   * @param key - S3 object key or local file path
   * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
   * @returns Presigned URL for file access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // Handle legacy local paths (starting with /uploads/)
    if (key.startsWith('/uploads/') || this.useLocalFallback) {
      // For local files, return the path as-is (assuming static file serving)
      const localPath = key.startsWith('/uploads/') ? key : `/uploads/${key}`;
      return localPath;
    }

    // Handle S3 URLs (s3://bucket/key format)
    if (key.startsWith('s3://')) {
      key = key.replace(`s3://${this.bucket}/`, '');
    }

    if (!this.s3Client) {
      this.logger.warn('S3 client not available, returning key as URL');
      return `/uploads/${key}`;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      this.logger.error(`Failed to generate signed URL for: ${key}`, error);
      throw error;
    }
  }

  /**
   * Download a file from S3 or local storage
   * @param key - S3 object key or local file path
   * @returns File buffer
   */
  async downloadFile(key: string): Promise<Buffer> {
    // Handle legacy local paths
    if (key.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), key);
      return fs.readFile(filePath);
    }

    // Handle S3 URLs
    if (key.startsWith('s3://')) {
      key = key.replace(`s3://${this.bucket}/`, '');
    }

    if (this.useLocalFallback || !this.s3Client) {
      const filePath = path.join(process.cwd(), 'uploads', key);
      return fs.readFile(filePath);
    }

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      const stream = response.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to download file from S3: ${key}`, error);
      throw error;
    }
  }

  /**
   * Delete a file from S3 or local storage
   * @param key - S3 object key or local file path
   */
  async deleteFile(key: string): Promise<void> {
    // Handle legacy local paths
    if (key.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), key);
      try {
        await fs.unlink(filePath);
        this.logger.debug(`Local file deleted: ${filePath}`);
      } catch (error) {
        this.logger.warn(`Failed to delete local file: ${filePath}`, error);
      }
      return;
    }

    // Handle S3 URLs
    if (key.startsWith('s3://')) {
      key = key.replace(`s3://${this.bucket}/`, '');
    }

    if (this.useLocalFallback || !this.s3Client) {
      const filePath = path.join(process.cwd(), 'uploads', key);
      try {
        await fs.unlink(filePath);
        this.logger.debug(`Local file deleted: ${filePath}`);
      } catch (error) {
        this.logger.warn(`Failed to delete local file: ${filePath}`, error);
      }
      return;
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      this.logger.debug(`File deleted from S3: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${key}`, error);
      throw error;
    }
  }

  /**
   * Check if using local storage fallback
   */
  isUsingLocalStorage(): boolean {
    return this.useLocalFallback;
  }

  /**
   * Check if a key represents a local file path
   */
  isLocalPath(key: string): boolean {
    return key.startsWith('/uploads/');
  }

  /**
   * Extract the S3 key from a stored URL/path
   */
  extractKey(storedValue: string): string {
    if (storedValue.startsWith('s3://')) {
      return storedValue.replace(`s3://${this.bucket}/`, '');
    }
    if (storedValue.startsWith('/uploads/')) {
      return storedValue.replace('/uploads/', '');
    }
    return storedValue;
  }
}

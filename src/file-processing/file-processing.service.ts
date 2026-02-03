import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StorageService } from '../storage/storage.service';

export interface TextExtractionResult {
  text: string;
  confidence: number;
  pageCount?: number;
  error?: string;
}

@Injectable()
export class FileProcessingService {
  private readonly logger = new Logger(FileProcessingService.name);
  private readonly supportedExtensions = ['.pdf', '.docx', '.doc'];
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB

  constructor(private storageService: StorageService) {}

  async extractText(
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<TextExtractionResult> {
    const ext = path.extname(fileName).toLowerCase();

    if (!this.supportedExtensions.includes(ext)) {
      throw new BadRequestException(
        `Unsupported file type: ${ext}. Supported types: ${this.supportedExtensions.join(', ')}`,
      );
    }

    if (fileBuffer.length > this.maxFileSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    try {
      switch (ext) {
        case '.pdf':
          return this.extractFromPdf(fileBuffer);
        case '.docx':
        case '.doc':
          return this.extractFromDocx(fileBuffer);
        default:
          throw new BadRequestException(`Unsupported file type: ${ext}`);
      }
    } catch (error) {
      console.error(`Text extraction error for ${fileName}:`, error);
      return {
        text: '',
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown extraction error',
      };
    }
  }

  private async extractFromPdf(fileBuffer: Buffer): Promise<TextExtractionResult> {
    let pdfParser: PDFParse | null = null;
    try {
      // PDFParse v2.x: pass data in constructor options
      pdfParser = new PDFParse({ data: fileBuffer });

      // Get text from all pages
      const textResult = await pdfParser.getText();
      const text = textResult.text.trim();
      const pageCount = textResult.total;
      const confidence = this.calculateConfidence(text);

      return {
        text,
        confidence,
        pageCount,
      };
    } catch (error) {
      console.error('PDF extraction error:', error);
      return {
        text: '',
        confidence: 0,
        error: 'Failed to extract text from PDF',
      };
    } finally {
      // Clean up resources
      if (pdfParser) {
        await pdfParser.destroy();
      }
    }
  }

  private async extractFromDocx(fileBuffer: Buffer): Promise<TextExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });

      const text = result.value.trim();
      const confidence = this.calculateConfidence(text);

      return {
        text,
        confidence,
      };
    } catch (error) {
      console.error('DOCX extraction error:', error);
      return {
        text: '',
        confidence: 0,
        error: 'Failed to extract text from DOCX',
      };
    }
  }

  private calculateConfidence(text: string): number {
    if (!text || text.length < 50) {
      return 0;
    }

    let confidence = 50;

    // Check for common CV sections
    const cvIndicators = [
      /education/i,
      /experience/i,
      /skills/i,
      /work history/i,
      /employment/i,
      /qualifications/i,
      /projects/i,
      /certifications/i,
      /contact/i,
      /email/i,
      /phone/i,
      /linkedin/i,
    ];

    const matchedIndicators = cvIndicators.filter((regex) => regex.test(text));
    confidence += matchedIndicators.length * 4;

    // Check for reasonable text length
    if (text.length > 500) confidence += 10;
    if (text.length > 1000) confidence += 10;
    if (text.length > 2000) confidence += 5;

    // Check for email pattern
    if (/[\w.-]+@[\w.-]+\.\w+/.test(text)) confidence += 5;

    // Check for phone pattern
    if (/[\d\s\-\+\(\)]{10,}/.test(text)) confidence += 5;

    // Cap at 100
    return Math.min(confidence, 100);
  }

  validateFile(
    file: Express.Multer.File,
  ): { valid: boolean; error?: string } {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!this.supportedExtensions.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported file type: ${ext}. Supported: ${this.supportedExtensions.join(', ')}`,
      };
    }

    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: 'File size exceeds 10MB limit',
      };
    }

    return { valid: true };
  }

  getSupportedExtensions(): string[] {
    return [...this.supportedExtensions];
  }

  /**
   * Extract text from a file path or S3 key (for background processing)
   * Supports:
   * - Local paths: /uploads/cvs/filename.pdf
   * - S3 URLs: s3://bucket/cvs/filename.pdf
   * - S3 keys: cvs/filename.pdf
   */
  async extractTextFromFile(filePathOrKey: string): Promise<TextExtractionResult> {
    try {
      let fileBuffer: Buffer;
      let fileName: string;

      // Determine if this is an S3 URL/key or local path
      if (
        filePathOrKey.startsWith('s3://') ||
        (!filePathOrKey.startsWith('/') && !filePathOrKey.startsWith('.'))
      ) {
        // S3 URL or key - download from storage
        this.logger.debug(`Downloading file from storage: ${filePathOrKey}`);
        fileBuffer = await this.storageService.downloadFile(filePathOrKey);
        fileName = path.basename(filePathOrKey);
      } else if (filePathOrKey.startsWith('/uploads/')) {
        // Legacy local path - try storage service first (handles both local and S3 fallback)
        this.logger.debug(`Downloading file from local path via storage: ${filePathOrKey}`);
        fileBuffer = await this.storageService.downloadFile(filePathOrKey);
        fileName = path.basename(filePathOrKey);
      } else {
        // Absolute local path - read directly from filesystem
        this.logger.debug(`Reading file directly from filesystem: ${filePathOrKey}`);
        fileBuffer = await fs.readFile(filePathOrKey);
        fileName = path.basename(filePathOrKey);
      }

      return this.extractText(fileBuffer, fileName);
    } catch (error) {
      this.logger.error(`Error reading file ${filePathOrKey}:`, error);
      return {
        text: '',
        confidence: 0,
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

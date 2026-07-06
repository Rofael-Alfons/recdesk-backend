import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { FileProcessingService } from './file-processing.service';
import { StorageService } from '../storage/storage.service';

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({
      text: 'Jane Doe\nEmail: jane@example.com\nExperience: 3 years\nSkills: TypeScript',
      total: 1,
    }),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({
    value: 'Jane Doe resume with education and experience sections',
  }),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(
    Buffer.from('Jane Doe resume with education and experience sections'),
  ),
}));

describe('FileProcessingService', () => {
  let service: FileProcessingService;
  let storageService: { downloadFile: jest.Mock };

  beforeEach(async () => {
    storageService = {
      downloadFile: jest.fn().mockResolvedValue(
        Buffer.from('Jane Doe resume with education and experience sections'),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileProcessingService,
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get(FileProcessingService);
  });

  describe('validateFile', () => {
    it('rejects unsupported extensions', () => {
      const result = service.validateFile({
        originalname: 'resume.txt',
        size: 1000,
      } as Express.Multer.File);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    it('rejects files over 10MB', () => {
      const result = service.validateFile({
        originalname: 'resume.pdf',
        size: 11 * 1024 * 1024,
      } as Express.Multer.File);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('10MB');
    });

    it('accepts valid PDF files', () => {
      const result = service.validateFile({
        originalname: 'resume.pdf',
        size: 1024,
      } as Express.Multer.File);

      expect(result.valid).toBe(true);
    });
  });

  describe('extractText', () => {
    it('rejects unsupported file types', async () => {
      await expect(
        service.extractText(Buffer.from('data'), 'file.txt'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('extracts text from PDF with confidence score', async () => {
      const result = await service.extractText(
        Buffer.from('pdf-data'),
        'resume.pdf',
      );

      expect(result.text).toContain('Jane Doe');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.pageCount).toBe(1);
    });

    it('extracts text from DOCX', async () => {
      const result = await service.extractText(
        Buffer.from('docx-data'),
        'resume.docx',
      );

      expect(result.text).toContain('Jane Doe');
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('extractTextFromFile', () => {
    it('downloads S3 key via storage service', async () => {
      const result = await service.extractTextFromFile('comp-1/cvs/file.pdf');

      expect(storageService.downloadFile).toHaveBeenCalledWith(
        'comp-1/cvs/file.pdf',
      );
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('reads absolute local path directly', async () => {
      const fs = require('fs/promises');
      const result = await service.extractTextFromFile('/tmp/resume.pdf');

      expect(fs.readFile).toHaveBeenCalledWith('/tmp/resume.pdf');
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  describe('getSupportedExtensions', () => {
    it('returns pdf and docx extensions', () => {
      expect(service.getSupportedExtensions()).toEqual([
        '.pdf',
        '.docx',
        '.doc',
      ]);
    });
  });
});

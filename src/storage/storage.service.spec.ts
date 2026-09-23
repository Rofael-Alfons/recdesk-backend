import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'file-uuid'),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('file-data')),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const mockSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  };
});

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'S3_USE_LOCAL_FALLBACK') return 'true';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get(StorageService);
    await service.onModuleInit();
  });

  it('uses local storage fallback when configured', () => {
    expect(service.isUsingLocalStorage()).toBe(true);
  });

  it('uploads file locally with company-scoped key', async () => {
    const result = await service.uploadFile(
      Buffer.from('pdf'),
      'resume.pdf',
      'application/pdf',
      'comp-1',
      'cvs',
    );

    expect(result.key).toBe('comp-1/cvs/file-uuid.pdf');
    expect(result.url).toBe('/uploads/comp-1/cvs/file-uuid.pdf');
    expect(result.isLocal).toBe(true);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('returns local path for signed URL in fallback mode', async () => {
    const url = await service.getSignedUrl('comp-1/cvs/file.pdf');

    expect(url).toBe('/uploads/comp-1/cvs/file.pdf');
  });

  it('downloads local file by key', async () => {
    const buffer = await service.downloadFile('comp-1/cvs/file.pdf');

    expect(buffer.toString()).toBe('file-data');
    expect(fs.readFile).toHaveBeenCalled();
  });

  it('extracts key from stored s3 and local paths', () => {
    expect(service.extractKey('s3://recdesk-cvs/comp-1/cvs/a.pdf')).toBe(
      'comp-1/cvs/a.pdf',
    );
    expect(service.extractKey('/uploads/comp-1/cvs/a.pdf')).toBe(
      'comp-1/cvs/a.pdf',
    );
  });

  it('identifies local paths', () => {
    expect(service.isLocalPath('/uploads/comp-1/cvs/a.pdf')).toBe(true);
    expect(service.isLocalPath('comp-1/cvs/a.pdf')).toBe(false);
  });
});

describe('StorageService (real S3)', () => {
  let service: StorageService;

  beforeEach(async () => {
    mockSend.mockClear();
    mockSend.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const values: Record<string, string> = {
                'aws.accessKeyId': 'key',
                'aws.secretAccessKey': 'secret',
                'aws.s3Bucket': 'recdesk-cvs-dev',
                'aws.region': 'eu-central-1',
              };
              return values[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get(StorageService);
    await service.onModuleInit();
  });

  it('encrypts uploads at rest with SSE-S3 (AES256)', async () => {
    await service.uploadFile(
      Buffer.from('id-scan'),
      'national-id.pdf',
      'application/pdf',
      'comp-1',
      'documents/req-1',
    );

    const putCall = mockSend.mock.calls.find(
      (c) => c[0] instanceof PutObjectCommand,
    );
    expect(putCall).toBeTruthy();
    expect(putCall![0].input.ServerSideEncryption).toBe('AES256');
  });
});

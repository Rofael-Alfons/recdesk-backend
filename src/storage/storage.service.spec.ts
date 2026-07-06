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

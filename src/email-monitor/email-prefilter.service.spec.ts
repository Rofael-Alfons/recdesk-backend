import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailPrefilterService } from './email-prefilter.service';

describe('EmailPrefilterService', () => {
  let service: EmailPrefilterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailPrefilterService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: unknown) => {
              if (key === 'prefilter.enabled') return true;
              if (key === 'prefilter.autoClassifyEnabled') return true;
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get(EmailPrefilterService);
  });

  it('skips no-reply senders', () => {
    const result = service.prefilterEmail({
      subject: 'Hello',
      senderEmail: 'noreply@service.com',
      senderName: null,
      bodyText: 'Newsletter content',
      attachments: [],
    });

    expect(result.action).toBe('skip');
    expect(result.reason).toContain('No-reply');
  });

  it('skips internal company emails', () => {
    const result = service.prefilterEmail({
      subject: 'Team update',
      senderEmail: 'hr@acme.com',
      senderName: 'HR',
      bodyText: 'Internal memo',
      attachments: [],
      companyDomain: 'acme.com',
    });

    expect(result.action).toBe('skip');
    expect(result.reason).toContain('Internal email');
  });

  it('auto-classifies CV attachment with application subject', () => {
    const result = service.prefilterEmail({
      subject: 'Application for Backend Engineer',
      senderEmail: 'jane@example.com',
      senderName: 'Jane Doe',
      bodyText: 'Please find my resume attached.',
      attachments: [{ filename: 'jane-doe-cv.pdf', mimeType: 'application/pdf' }],
    });

    expect(result.action).toBe('auto_classify');
    expect(result.confidence).toBeGreaterThanOrEqual(80);
  });

  it('requires AI when uncertain', () => {
    const result = service.prefilterEmail({
      subject: 'Quick question about your job posting',
      senderEmail: 'candidate@example.com',
      senderName: 'Candidate',
      bodyText: 'I saw your job opening and wanted to ask a question.',
      attachments: [],
    });

    expect(result.action).toBe('needs_ai');
  });

  it('returns needs_ai when prefilter is disabled', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailPrefilterService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: unknown) => {
              if (key === 'prefilter.enabled') return false;
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    const disabledService = module.get(EmailPrefilterService);
    const result = disabledService.prefilterEmail({
      subject: 'Application',
      senderEmail: 'jane@example.com',
      senderName: 'Jane',
      bodyText: 'CV attached',
      attachments: [{ filename: 'cv.pdf', mimeType: 'application/pdf' }],
    });

    expect(result.action).toBe('needs_ai');
    expect(result.reason).toContain('disabled');
  });
});

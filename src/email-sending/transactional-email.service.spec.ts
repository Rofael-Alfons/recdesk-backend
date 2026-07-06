import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TransactionalEmailService } from './transactional-email.service';

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  SendEmailCommand: jest.fn().mockImplementation((input) => input),
}));

describe('TransactionalEmailService', () => {
  async function createService(configured: boolean) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionalEmailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (!configured) return undefined;
              const map: Record<string, string> = {
                'ses.region': 'eu-central-1',
                'ses.accessKeyId': 'key',
                'ses.secretAccessKey': 'secret',
                'ses.fromEmail': 'noreply@recdesk.io',
                'frontend.url': 'http://localhost:3001',
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    return module.get(TransactionalEmailService);
  }

  it('succeeds in dev mode when SES is not configured', async () => {
    const service = await createService(false);

    const result = await service.sendPasswordResetEmail(
      'user@acme.com',
      'http://localhost:3001/reset?token=abc',
      'User',
    );

    expect(result.success).toBe(true);
  });

  it('sends password reset email via SES when configured', async () => {
    const service = await createService(true);

    const result = await service.sendPasswordResetEmail(
      'user@acme.com',
      'http://localhost:3001/reset?token=abc',
      'User',
    );

    expect(result.success).toBe(true);
    const { SendEmailCommand } = require('@aws-sdk/client-sesv2');
    expect(SendEmailCommand).toHaveBeenCalled();
  });

  it('sends invitation email', async () => {
    const service = await createService(false);

    const result = await service.sendUserInvitationEmail(
      'new@acme.com',
      'http://localhost:3001/accept?token=abc',
      'Admin User',
      'Acme',
      'Recruiter',
    );

    expect(result.success).toBe(true);
  });

  it('sends waitlist welcome email', async () => {
    const service = await createService(false);

    const result = await service.sendWaitlistWelcomeEmail(
      'wait@example.com',
      'Wait User',
      42,
    );

    expect(result.success).toBe(true);
  });
});

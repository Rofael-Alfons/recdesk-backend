import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    gmail: jest.fn().mockReturnValue({
      users: {
        watch: jest.fn().mockResolvedValue({
          data: { historyId: '12345', expiration: `${Date.now() + 86400000}` },
        }),
        stop: jest.fn().mockResolvedValue({}),
      },
    }),
  },
}));

import { GmailPubsubService } from './gmail-pubsub.service';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { EmailMonitorService } from './email-monitor.service';

describe('GmailPubsubService', () => {
  let service: GmailPubsubService;
  let prisma: any;
  let integrations: { getValidAccessToken: jest.Mock };
  let emailMonitor: { pollEmailsForConnection: jest.Mock };

  beforeEach(async () => {
    prisma = {
      emailConnection: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    integrations = {
      getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    };
    emailMonitor = {
      pollEmailsForConnection: jest.fn().mockResolvedValue({
        emailsImported: 1,
        emailsProcessed: 2,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailPubsubService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                'google.clientId': 'id',
                'google.clientSecret': 'secret',
                'google.redirectUri': 'http://localhost/callback',
                'google.pubsubTopic': 'projects/test/topics/gmail',
              };
              return map[key];
            },
          },
        },
        { provide: IntegrationsService, useValue: integrations },
        { provide: EmailMonitorService, useValue: emailMonitor },
      ],
    }).compile();

    service = module.get(GmailPubsubService);
  });

  it('reports enabled when pubsub topic is configured', () => {
    expect(service.isEnabled()).toBe(true);
  });

  it('sets up Gmail watch and stores expiration', async () => {
    prisma.emailConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      email: 'jobs@acme.com',
      isActive: true,
    });

    await service.watchMailbox('conn-1');

    expect(integrations.getValidAccessToken).toHaveBeenCalledWith('conn-1');
    expect(prisma.emailConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: expect.objectContaining({
        watchHistoryId: '12345',
        watchExpiration: expect.any(Date),
      }),
    });
  });

  it('skips watch when topic is not configured', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailPubsubService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'google.clientId' ? 'id' : undefined,
          },
        },
        { provide: IntegrationsService, useValue: integrations },
        { provide: EmailMonitorService, useValue: emailMonitor },
      ],
    }).compile();

    const disabled = module.get(GmailPubsubService);
    prisma.emailConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      isActive: true,
    });

    await disabled.watchMailbox('conn-1');

    expect(prisma.emailConnection.update).not.toHaveBeenCalled();
  });
});

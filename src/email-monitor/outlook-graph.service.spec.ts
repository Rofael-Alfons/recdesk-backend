import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('axios');

import axios from 'axios';
import { OutlookGraphService } from './outlook-graph.service';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { OutlookMonitorService } from './outlook-monitor.service';

describe('OutlookGraphService', () => {
  let service: OutlookGraphService;
  let prisma: any;
  let integrations: { getValidAccessToken: jest.Mock };
  let outlookMonitor: { pollEmailsForConnection: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      emailConnection: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    integrations = {
      getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    };
    outlookMonitor = {
      pollEmailsForConnection: jest.fn().mockResolvedValue({
        emailsImported: 0,
        emailsProcessed: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookGraphService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                'microsoftEmail.clientId': 'ms-id',
                'microsoftEmail.webhookUrl': 'https://api.recdesk.io/webhooks/outlook',
                'microsoftEmail.webhookSecret': 'secret',
              };
              return map[key];
            },
          },
        },
        { provide: IntegrationsService, useValue: integrations },
        { provide: OutlookMonitorService, useValue: outlookMonitor },
      ],
    }).compile();

    service = module.get(OutlookGraphService);
  });

  it('reports enabled when client and webhook are configured', () => {
    expect(service.isEnabled()).toBe(true);
  });

  it('creates Graph subscription and stores metadata', async () => {
    prisma.emailConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      email: 'jobs@acme.com',
      isActive: true,
    });
    (axios.post as jest.Mock).mockResolvedValue({
      data: {
        id: 'sub-1',
        expirationDateTime: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    await service.createSubscription('conn-1');

    expect(axios.post).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/subscriptions',
      expect.objectContaining({
        changeType: 'created',
        resource: "me/mailFolders('Inbox')/messages",
      }),
      expect.any(Object),
    );
    expect(prisma.emailConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: expect.objectContaining({
        graphSubscriptionId: 'sub-1',
        watchExpiration: expect.any(Date),
      }),
    });
  });

  it('skips subscription when webhook URL is missing', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookGraphService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'microsoftEmail.clientId' ? 'ms-id' : undefined,
          },
        },
        { provide: IntegrationsService, useValue: integrations },
        { provide: OutlookMonitorService, useValue: outlookMonitor },
      ],
    }).compile();

    const disabled = module.get(OutlookGraphService);
    prisma.emailConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      isActive: true,
    });

    await disabled.createSubscription('conn-1');

    expect(axios.post).not.toHaveBeenCalled();
  });
});

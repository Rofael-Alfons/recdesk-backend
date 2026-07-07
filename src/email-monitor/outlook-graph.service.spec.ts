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

  describe('fetchNewMessages', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    it('anchors the initial sync at connection.createdAt and returns no historical backlog', async () => {
      prisma.emailConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        lastHistoryId: null,
        lastSyncAt: null,
        createdAt,
      });
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          value: [],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders(\'Inbox\')/messages/delta?$deltatoken=abc',
        },
      });

      const result = await service.fetchNewMessages('conn-1');

      expect(axios.get).toHaveBeenCalledTimes(1);
      const calledUrl = (axios.get as jest.Mock).mock.calls[0][0];
      const calledOptions = (axios.get as jest.Mock).mock.calls[0][1];
      expect(calledUrl).toContain(
        `$filter=${encodeURIComponent(`receivedDateTime ge ${createdAt.toISOString()}`)}`,
      );
      expect(calledUrl).toContain('internetMessageId');
      expect(calledUrl).not.toContain('deltatoken=latest');
      expect(calledOptions.headers).toEqual(
        expect.objectContaining({ Prefer: 'IdType="ImmutableId"' }),
      );
      expect(result).toEqual({
        messages: [],
        deltaLink:
          'https://graph.microsoft.com/v1.0/me/mailFolders(\'Inbox\')/messages/delta?$deltatoken=abc',
      });
    });

    it('uses the stored delta link verbatim when present (regression guard)', async () => {
      const storedLink =
        'https://graph.microsoft.com/v1.0/me/mailFolders(\'Inbox\')/messages/delta?$deltatoken=xyz';
      prisma.emailConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        lastHistoryId: storedLink,
        lastSyncAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt,
      });
      (axios.get as jest.Mock).mockResolvedValue({
        data: { value: [{ id: 'msg-1' }], '@odata.deltaLink': storedLink },
      });

      const result = await service.fetchNewMessages('conn-1');

      expect(axios.get).toHaveBeenCalledWith(
        storedLink,
        expect.objectContaining({
          headers: expect.objectContaining({ Prefer: 'IdType="ImmutableId"' }),
        }),
      );
      expect(result.messages).toEqual([{ id: 'msg-1' }]);
    });

    it('aggregates paginated results via @odata.nextLink before reaching deltaLink', async () => {
      const storedLink =
        'https://graph.microsoft.com/v1.0/me/mailFolders(\'Inbox\')/messages/delta?$deltatoken=xyz';
      prisma.emailConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        lastHistoryId: storedLink,
        lastSyncAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt,
      });
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            value: [{ id: 'msg-1' }],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next-page',
          },
        })
        .mockResolvedValueOnce({
          data: {
            value: [{ id: 'msg-2' }],
            '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/delta-final',
          },
        });

      const result = await service.fetchNewMessages('conn-1');

      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
        deltaLink: 'https://graph.microsoft.com/v1.0/delta-final',
      });
    });

    it('on 410 (expired delta link), re-anchors at lastSyncAt instead of re-enumerating the mailbox', async () => {
      const lastSyncAt = new Date('2026-03-01T00:00:00.000Z');
      prisma.emailConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        lastHistoryId: 'https://graph.microsoft.com/v1.0/expired-link',
        lastSyncAt,
        createdAt,
      });
      (axios.get as jest.Mock)
        .mockRejectedValueOnce({ response: { status: 410 } })
        .mockResolvedValueOnce({
          data: {
            value: [],
            '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/new-delta',
          },
        });

      const result = await service.fetchNewMessages('conn-1');

      expect(axios.get).toHaveBeenCalledTimes(2);
      const freshUrl = (axios.get as jest.Mock).mock.calls[1][0];
      const freshOptions = (axios.get as jest.Mock).mock.calls[1][1];
      expect(freshUrl).toContain(
        `$filter=${encodeURIComponent(`receivedDateTime ge ${lastSyncAt.toISOString()}`)}`,
      );
      expect(freshUrl).toContain('internetMessageId');
      expect(freshOptions.headers).toEqual(
        expect.objectContaining({ Prefer: 'IdType="ImmutableId"' }),
      );
      expect(result).toEqual({
        messages: [],
        deltaLink: 'https://graph.microsoft.com/v1.0/new-delta',
      });
    });

    it('on 410 with no prior lastSyncAt, falls back to createdAt as the anchor', async () => {
      prisma.emailConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        lastHistoryId: 'https://graph.microsoft.com/v1.0/expired-link',
        lastSyncAt: null,
        createdAt,
      });
      (axios.get as jest.Mock)
        .mockRejectedValueOnce({ response: { status: 410 } })
        .mockResolvedValueOnce({
          data: {
            value: [],
            '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/new-delta',
          },
        });

      await service.fetchNewMessages('conn-1');

      const freshUrl = (axios.get as jest.Mock).mock.calls[1][0];
      expect(freshUrl).toContain(
        `$filter=${encodeURIComponent(`receivedDateTime ge ${createdAt.toISOString()}`)}`,
      );
    });
  });

  describe('fetchMessageAttachments', () => {
    it('requests immutable IDs and returns decoded file attachments, filtering out non-file attachments', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          value: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: 'resume.pdf',
              contentType: 'application/pdf',
              size: 1234,
              contentBytes: Buffer.from('hello').toString('base64'),
            },
            {
              '@odata.type': '#microsoft.graph.itemAttachment',
              name: 'forwarded-email.eml',
            },
          ],
        },
      });

      const attachments = await service.fetchMessageAttachments(
        'conn-1',
        'msg-1',
      );

      expect(axios.get).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/messages/msg-1/attachments',
        expect.objectContaining({
          headers: expect.objectContaining({
            Prefer: 'IdType="ImmutableId"',
          }),
        }),
      );
      expect(attachments).toEqual([
        {
          filename: 'resume.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          data: Buffer.from('hello'),
        },
      ]);
    });
  });
});

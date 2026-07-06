import { Test, TestingModule } from '@nestjs/testing';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { OutlookMonitorService } from './outlook-monitor.service';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { EmailProcessingService } from './email-processing.service';

describe('OutlookMonitorService', () => {
  let service: OutlookMonitorService;
  let prisma: any;
  let outlookGraph: {
    fetchNewMessages: jest.Mock;
    fetchMessageAttachments: jest.Mock;
  };
  let emailProcessing: {
    processNormalizedEmail: jest.Mock;
    sendImportNotification: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      emailConnection: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
      },
    };
    outlookGraph = {
      fetchNewMessages: jest.fn().mockResolvedValue({
        messages: [],
        deltaLink: 'delta-link',
      }),
      fetchMessageAttachments: jest.fn().mockResolvedValue([]),
    };
    emailProcessing = {
      processNormalizedEmail: jest.fn().mockResolvedValue({ imported: false }),
      sendImportNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookMonitorService,
        { provide: PrismaService, useValue: prisma },
        { provide: IntegrationsService, useValue: { refreshOutlookToken: jest.fn() } },
        { provide: EmailProcessingService, useValue: emailProcessing },
        { provide: 'OutlookGraphService', useValue: outlookGraph },
      ],
    }).compile();

    service = module.get(OutlookMonitorService);
  });

  it('returns empty result when poll is already in progress', async () => {
    prisma.emailConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      companyId: 'comp-1',
      email: 'jobs@acme.com',
    });

    outlookGraph.fetchNewMessages.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ messages: [], deltaLink: 'delta-link' }),
            50,
          ),
        ),
    );

    const first = service.pollEmailsForConnection('conn-1');
    const second = await service.pollEmailsForConnection('conn-1');

    expect(second.emailsProcessed).toBe(0);
    await first;
  });

  it('updates delta link after successful poll', async () => {
    prisma.emailConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      companyId: 'comp-1',
      email: 'jobs@acme.com',
    });

    await service.pollEmailsForConnection('conn-1');

    expect(prisma.emailConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: expect.objectContaining({
        lastHistoryId: 'delta-link',
        lastSyncAt: expect.any(Date),
      }),
    });
  });

  it('syncs all active Outlook connections for a company', async () => {
    prisma.emailConnection.findMany.mockResolvedValue([
      { id: 'conn-1' },
      { id: 'conn-2' },
    ]);
    prisma.emailConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      companyId: 'comp-1',
      email: 'jobs@acme.com',
    });

    const result = await service.syncAllConnectionsForCompany('comp-1');

    expect(result.results).toHaveLength(2);
    expect(outlookGraph.fetchNewMessages).toHaveBeenCalled();
  });
});

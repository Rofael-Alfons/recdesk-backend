import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
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
        messages: { list: jest.fn(), get: jest.fn() },
        history: { list: jest.fn() },
      },
    }),
  },
}));

import { EmailMonitorService } from './email-monitor.service';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { EmailProcessingService } from './email-processing.service';

describe('EmailMonitorService', () => {
  let service: EmailMonitorService;
  let prisma: any;
  let integrations: { getValidAccessToken: jest.Mock };
  let emailProcessing: { processNormalizedEmail: jest.Mock };

  beforeEach(async () => {
    prisma = {
      emailConnection: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
      },
    };
    integrations = {
      getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    };
    emailProcessing = {
      processNormalizedEmail: jest.fn().mockResolvedValue({ imported: false }),
      sendImportNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailMonitorService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: () => 'google-config',
          },
        },
        { provide: IntegrationsService, useValue: integrations },
        { provide: EmailProcessingService, useValue: emailProcessing },
      ],
    }).compile();

    service = module.get(EmailMonitorService);
  });

  it('throws when connection is missing', async () => {
    prisma.emailConnection.findUnique.mockResolvedValue(null);

    await expect(
      service.pollEmailsForConnection('missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects connection from another company', async () => {
    prisma.emailConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      companyId: 'comp-1',
      email: 'jobs@acme.com',
    });

    await expect(
      service.pollEmailsForConnection('conn-1', 'other-comp'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns empty result when poll is already in progress', async () => {
    prisma.emailConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      companyId: 'comp-1',
      email: 'jobs@acme.com',
      lastHistoryId: null,
    });

    jest
      .spyOn(service as any, 'fetchNewEmails')
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve([]), 50),
          ),
      );

    const first = service.pollEmailsForConnection('conn-1');
    const second = await service.pollEmailsForConnection('conn-1');

    expect(second.emailsProcessed).toBe(0);
    await first;
  });
});

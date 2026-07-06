import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailProvider } from '@prisma/client';

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: jest.fn().mockReturnValue('https://google-auth'),
        getToken: jest.fn(),
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn(),
        revokeToken: jest.fn().mockResolvedValue(undefined),
      })),
    },
    oauth2: jest.fn().mockReturnValue({
      userinfo: { get: jest.fn() },
    }),
  },
}));

jest.mock('axios');

import axios from 'axios';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let prisma: any;
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
      emailConnection: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    encryption = {
      encrypt: jest.fn((v: string) => `enc:${v}`),
      decrypt: jest.fn((v: string) => v.replace('enc:', '')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                'google.clientId': 'google-id',
                'google.clientSecret': 'google-secret',
                'google.redirectUri': 'http://localhost/callback',
                'microsoftEmail.clientId': 'ms-id',
                'microsoftEmail.clientSecret': 'ms-secret',
                'microsoftEmail.redirectUri': 'http://localhost/outlook',
              };
              return map[key];
            },
          },
        },
        { provide: EncryptionService, useValue: encryption },
      ],
    }).compile();

    service = module.get(IntegrationsService);
  });

  describe('getGmailAuthUrl', () => {
    it('returns Google OAuth URL', async () => {
      const result = await service.getGmailAuthUrl('comp-1', 'user-1');

      expect(result.authUrl).toBe('https://google-auth');
    });
  });

  describe('getOutlookAuthUrl', () => {
    it('throws when Outlook is not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          IntegrationsService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: ConfigService,
            useValue: { get: () => undefined },
          },
          { provide: EncryptionService, useValue: encryption },
        ],
      }).compile();

      const unconfigured = module.get(IntegrationsService);

      await expect(
        unconfigured.getOutlookAuthUrl('comp-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns Microsoft authorize URL', async () => {
      const result = await service.getOutlookAuthUrl('comp-1', 'user-1');

      expect(result.authUrl).toContain(
        'login.microsoftonline.com/common/oauth2/v2.0/authorize',
      );
    });
  });

  describe('getEmailConnections', () => {
    it('lists company connections ordered by createdAt desc', async () => {
      prisma.emailConnection.findMany.mockResolvedValue([
        { id: 'conn-1', email: 'jobs@acme.com' },
      ]);

      const result = await service.getEmailConnections('comp-1');

      expect(result).toHaveLength(1);
      expect(prisma.emailConnection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'comp-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('disconnectEmail', () => {
    it('throws when connection is missing', async () => {
      prisma.emailConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.disconnectEmail('conn-1', 'comp-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes Gmail connection after revoke attempt', async () => {
      prisma.emailConnection.findFirst.mockResolvedValue({
        id: 'conn-1',
        provider: EmailProvider.GMAIL,
        accessToken: 'enc:token',
      });

      const result = await service.disconnectEmail('conn-1', 'comp-1');

      expect(result.message).toContain('disconnected');
      expect(prisma.emailConnection.delete).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
      });
    });
  });

  describe('getValidAccessToken', () => {
    it('returns decrypted token when not expired', async () => {
      prisma.emailConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        accessToken: 'enc:live-token',
        refreshToken: 'enc:refresh',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        provider: EmailProvider.GMAIL,
      });

      const token = await service.getValidAccessToken('conn-1');

      expect(token).toBe('live-token');
    });

    it('throws when connection is missing', async () => {
      prisma.emailConnection.findUnique.mockResolvedValue(null);

      await expect(service.getValidAccessToken('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('refreshOutlookToken', () => {
    it('updates encrypted tokens on success', async () => {
      prisma.emailConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        refreshToken: 'enc:refresh-token',
      });
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        },
      });

      const token = await service.refreshOutlookToken('conn-1');

      expect(token).toBe('new-access');
      expect(prisma.emailConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({
          accessToken: 'enc:new-access',
          refreshToken: 'enc:new-refresh',
        }),
      });
    });

    it('deactivates connection when refresh fails', async () => {
      prisma.emailConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        refreshToken: 'enc:refresh-token',
      });
      (axios.post as jest.Mock).mockRejectedValue(new Error('invalid_grant'));

      await expect(service.refreshOutlookToken('conn-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.emailConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: { isActive: false },
      });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PlatformAuthService } from './platform-auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PlatformAuthService', () => {
  let service: PlatformAuthService;
  let prisma: {
    platformAdmin: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    platformRefreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let jwt: { sign: jest.Mock };

  const passwordHash = bcrypt.hashSync('CorrectHorse1!', 10);
  const admin = {
    id: 'admin-1',
    email: 'ops@recdesk.io',
    passwordHash,
    firstName: 'Ops',
    lastName: 'Team',
    isActive: true,
    lastLoginAt: null,
  };

  beforeEach(async () => {
    prisma = {
      platformAdmin: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(admin),
      },
      platformRefreshToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-access-token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'platform.jwtSecret') return 'test-secret';
              if (key === 'platform.accessExpirationSeconds') return 900;
              if (key === 'platform.refreshExpirationSeconds') return 604800;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get(PlatformAuthService);
  });

  describe('login', () => {
    it('rejects unknown admin with UnauthorizedException', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@recdesk.io', password: 'whatever12' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a deactivated admin', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue({
        ...admin,
        isActive: false,
      });
      await expect(
        service.login({ email: admin.email, password: 'CorrectHorse1!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue(admin);
      await expect(
        service.login({ email: admin.email, password: 'WrongPassword1!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues tokens on valid credentials and records lastLoginAt', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue(admin);

      const result = await service.login({
        email: admin.email,
        password: 'CorrectHorse1!',
      });

      expect(result.accessToken).toBe('signed-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.admin.email).toBe(admin.email);
      // Token payload must carry the platform discriminator.
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'platform', sub: admin.id }),
        expect.any(Object),
      );
      expect(prisma.platformAdmin.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: admin.id } }),
      );
      expect(prisma.platformRefreshToken.create).toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    it('rejects an unknown refresh token', async () => {
      prisma.platformRefreshToken.findUnique.mockResolvedValue(null);
      await expect(
        service.refreshTokens({ refreshToken: 'missing' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects and deletes an expired refresh token', async () => {
      prisma.platformRefreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        expiresAt: new Date(Date.now() - 1000),
        admin,
      });
      await expect(
        service.refreshTokens({ refreshToken: 'expired' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.platformRefreshToken.deleteMany).toHaveBeenCalled();
    });

    it('rotates tokens on a valid refresh token', async () => {
      prisma.platformRefreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        expiresAt: new Date(Date.now() + 60_000),
        admin,
      });

      const result = await service.refreshTokens({ refreshToken: 'valid' });

      expect(result.accessToken).toBe('signed-access-token');
      // Old token rotated out before new tokens are minted.
      expect(prisma.platformRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
      });
      expect(prisma.platformRefreshToken.create).toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('throws when the admin is missing or inactive', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue(null);
      await expect(service.me('admin-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('returns a serialized admin', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue(admin);
      const result = await service.me('admin-1');
      expect(result).toEqual({
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        lastLoginAt: null,
      });
      // Never leak the password hash.
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  it('is defined', () => {
    // Guards against accidental import of ForbiddenException removal.
    expect(ForbiddenException).toBeDefined();
    expect(service).toBeDefined();
  });
});

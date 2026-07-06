import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-refresh-token'),
}));

import { AuthService, NOT_ALLOWED_MESSAGE } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AllowlistService } from '../allowlist/allowlist.service';
import { TransactionalEmailService } from '../email-sending/transactional-email.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UserRole } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let allowlist: { isAllowed: jest.Mock };
  let jwt: { sign: jest.Mock };
  let permissions: { getUserPermissions: jest.Mock };
  let transactionalEmail: { sendPasswordResetEmail: jest.Mock };

  const passwordHash = bcrypt.hashSync('Password123!', 10);
  const company = {
    id: 'comp-1',
    name: 'Acme',
    mode: 'FULL_ATS',
    plan: 'STARTER',
    status: 'ACTIVE',
  };
  const user = {
    id: 'user-1',
    email: 'owner@acme.com',
    firstName: 'Owner',
    lastName: 'User',
    role: UserRole.ADMIN,
    companyId: company.id,
    passwordHash,
    isActive: true,
    avatarUrl: null,
    company,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      company: { create: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
      invitation: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          company: {
            create: jest.fn().mockResolvedValue(company),
          },
          user: {
            create: jest.fn().mockResolvedValue({ ...user, company }),
            update: jest.fn().mockResolvedValue(user),
          },
          passwordResetToken: {
            update: jest.fn().mockResolvedValue({}),
          },
          refreshToken: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          invitation: {
            update: jest.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      }),
    };

    allowlist = { isAllowed: jest.fn().mockResolvedValue(true) };
    jwt = { sign: jest.fn().mockReturnValue('access-token') };
    permissions = {
      getUserPermissions: jest.fn().mockResolvedValue(['manageJobs']),
    };
    transactionalEmail = {
      sendPasswordResetEmail: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'bcrypt.saltRounds') return 10;
              if (key === 'jwt.accessExpirationSeconds') return 900;
              if (key === 'jwt.refreshExpirationSeconds') return 604800;
              if (key === 'frontend.url') return 'http://localhost:3001';
              return undefined;
            },
          },
        },
        { provide: AllowlistService, useValue: allowlist },
        { provide: TransactionalEmailService, useValue: transactionalEmail },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('rejects emails not on the allowlist', async () => {
      allowlist.isAllowed.mockResolvedValue(false);

      await expect(
        service.register({
          email: 'blocked@acme.com',
          password: 'Password123!',
          firstName: 'A',
          lastName: 'B',
          companyName: 'Acme',
        }),
      ).rejects.toThrow(NOT_ALLOWED_MESSAGE);
    });

    it('rejects duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.register({
          email: user.email,
          password: 'Password123!',
          firstName: 'A',
          lastName: 'B',
          companyName: 'Acme',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates company and admin user with tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.register({
        email: 'new@acme.com',
        password: 'Password123!',
        firstName: 'New',
        lastName: 'Admin',
        companyName: 'Acme',
      });

      expect(result.accessToken).toBe('access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.user.role).toBe(UserRole.ADMIN);
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects invalid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: user.email, password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects deactivated accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });

      await expect(
        service.login({ email: user.email, password: 'Password123!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects suspended company accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        company: { ...company, status: 'SUSPENDED' },
      });

      await expect(
        service.login({ email: user.email, password: 'Password123!' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects OAuth-only accounts without password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        passwordHash: null,
      });

      await expect(
        service.login({ email: user.email, password: 'Password123!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.login({
        email: user.email,
        password: 'Password123!',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.user.email).toBe(user.email);
      expect(permissions.getUserPermissions).toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    it('rejects unknown refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.refreshTokens({ refreshToken: 'missing' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects expired refresh token and deletes it', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        expiresAt: new Date(Date.now() - 1000),
        user,
      });

      await expect(
        service.refreshTokens({ refreshToken: 'expired' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
    });

    it('revokes refresh when allowlist check fails', async () => {
      allowlist.isAllowed.mockResolvedValue(false);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        expiresAt: new Date(Date.now() + 60_000),
        user,
      });

      await expect(
        service.refreshTokens({ refreshToken: 'valid' }),
      ).rejects.toThrow(NOT_ALLOWED_MESSAGE);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: user.id },
      });
    });
  });

  describe('forgotPassword', () => {
    it('returns generic success when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'missing@acme.com' });

      expect(result.message).toContain('If an account exists');
      expect(transactionalEmail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates reset token and sends email for active user', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.forgotPassword({ email: user.email });

      expect(result.message).toContain('If an account exists');
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(transactionalEmail.sendPasswordResetEmail).toHaveBeenCalledWith(
        user.email,
        expect.stringContaining('/reset-password?token='),
        user.firstName,
      );
    });
  });

  describe('resetPassword', () => {
    it('rejects invalid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'bad', newPassword: 'NewPass123!' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects already used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        used: true,
        expiresAt: new Date(Date.now() + 60_000),
        userId: user.id,
        user,
      });

      await expect(
        service.resetPassword({ token: 'used', newPassword: 'NewPass123!' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getInvitation', () => {
    it('rejects revoked invitation', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'REVOKED',
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.getInvitation('token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns invitation details for pending invite', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        email: 'hire@acme.com',
        firstName: 'Hire',
        lastName: 'Me',
        role: UserRole.RECRUITER,
        company: { name: 'Acme' },
      });

      const result = await service.getInvitation('token');

      expect(result).toEqual({
        email: 'hire@acme.com',
        firstName: 'Hire',
        lastName: 'Me',
        role: UserRole.RECRUITER,
        companyName: 'Acme',
      });
    });
  });

  describe('validateOAuthUser', () => {
    it('rejects email not on allowlist', async () => {
      allowlist.isAllowed.mockResolvedValue(false);

      await expect(
        service.validateOAuthUser(
          {
            id: 'google-1',
            email: 'blocked@acme.com',
            firstName: 'A',
            lastName: 'B',
          },
          'google',
        ),
      ).rejects.toThrow(NOT_ALLOWED_MESSAGE);
    });

    it('returns existing user found by provider id', async () => {
      prisma.user.findFirst.mockResolvedValue(user);

      const result = await service.validateOAuthUser(
        {
          id: 'google-1',
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        'google',
      );

      expect(result.isNewUser).toBe(false);
      expect(result.id).toBe(user.id);
    });
  });

  describe('logout', () => {
    it('deletes refresh token', async () => {
      await service.logout('refresh-token');
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'refresh-token' },
      });
    });
  });
});

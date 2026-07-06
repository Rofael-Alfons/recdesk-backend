import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InvitationStatus, UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionalEmailService } from '../email-sending/transactional-email.service';
import { AllowlistService } from '../allowlist/allowlist.service';
import { PermissionsService } from '../permissions/permissions.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let allowlist: { allow: jest.Mock };
  let transactionalEmail: { sendUserInvitationEmail: jest.Mock };
  let permissions: { getUserPermissions: jest.Mock };

  const companyId = 'comp-1';
  const adminId = 'admin-1';

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      invitation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    allowlist = { allow: jest.fn().mockResolvedValue(undefined) };
    transactionalEmail = {
      sendUserInvitationEmail: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };
    permissions = {
      getUserPermissions: jest.fn().mockResolvedValue(['manageJobs']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'frontend.url' ? 'http://localhost:3001' : undefined,
          },
        },
        { provide: TransactionalEmailService, useValue: transactionalEmail },
        { provide: AllowlistService, useValue: allowlist },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findAll', () => {
    it('returns users for a company ordered by createdAt desc', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);

      const result = await service.findAll(companyId);

      expect(result).toEqual([{ id: 'u1' }]);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when user is missing', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing', companyId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns user with activity stats', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'recruiter@acme.com',
        firstName: 'Rec',
        lastName: 'Ruiter',
        role: UserRole.RECRUITER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: {
          candidateNotes: 2,
          candidateActions: 5,
          emailsSent: 1,
        },
      });

      const result = await service.findOne('u1', companyId);

      expect(result.stats).toEqual({
        notesCreated: 2,
        actionsPerformed: 5,
        emailsSent: 1,
      });
    });
  });

  describe('invite', () => {
    it('requires admin role', async () => {
      await expect(
        service.invite(
          {
            email: 'new@acme.com',
            firstName: 'New',
            lastName: 'User',
          },
          companyId,
          adminId,
          UserRole.RECRUITER,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects already registered email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.invite(
          {
            email: 'existing@acme.com',
            firstName: 'New',
            lastName: 'User',
          },
          companyId,
          adminId,
          UserRole.ADMIN,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates invitation, allowlists email, and sends email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.invitation.create.mockResolvedValue({
        id: 'inv-1',
        email: 'new@acme.com',
        firstName: 'New',
        lastName: 'User',
        role: UserRole.RECRUITER,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(),
        token: 'invite-token',
      });
      prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        firstName: 'Admin',
        lastName: 'User',
        company: { name: 'Acme' },
      });

      const result = await service.invite(
        {
          email: 'New@Acme.com',
          firstName: 'New',
          lastName: 'User',
        },
        companyId,
        adminId,
        UserRole.ADMIN,
      );

      expect(allowlist.allow).toHaveBeenCalledWith('new@acme.com');
      expect(transactionalEmail.sendUserInvitationEmail).toHaveBeenCalled();
      expect(result.invitation.email).toBe('new@acme.com');
    });
  });

  describe('update', () => {
    it('prevents demoting the last admin', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'admin-1',
        role: UserRole.ADMIN,
        companyId,
      });
      prisma.user.count.mockResolvedValue(1);

      await expect(
        service.update(
          'admin-1',
          { role: UserRole.RECRUITER },
          companyId,
          'other-admin',
          UserRole.ADMIN,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows self profile update without admin role', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        role: UserRole.RECRUITER,
        companyId,
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'user@acme.com',
        firstName: 'Updated',
        lastName: 'Name',
        role: UserRole.RECRUITER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.update(
        'user-1',
        { firstName: 'Updated' },
        companyId,
        'user-1',
        UserRole.RECRUITER,
      );

      expect(result.firstName).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('prevents deleting yourself', async () => {
      await expect(
        service.remove(adminId, companyId, adminId, UserRole.ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('soft-deletes user and clears refresh tokens', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-2',
        role: UserRole.RECRUITER,
        companyId,
      });

      const result = await service.remove(
        'user-2',
        companyId,
        adminId,
        UserRole.ADMIN,
      );

      expect(result.message).toContain('deactivated');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { isActive: false },
      });
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-2' },
      });
    });
  });

  describe('getMe', () => {
    it('throws when user is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns profile with permissions', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: adminId,
        email: 'admin@acme.com',
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
        companyId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        company: {
          id: companyId,
          name: 'Acme',
          mode: 'FULL_ATS',
          plan: 'STARTER',
        },
      });

      const result = await service.getMe(adminId);

      expect(result.permissions).toEqual(['manageJobs']);
      expect(result.company.name).toBe('Acme');
    });
  });
});

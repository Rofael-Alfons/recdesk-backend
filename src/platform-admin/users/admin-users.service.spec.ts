import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AdminUsersService);
  });

  describe('findAll', () => {
    it('scopes by companyId and search', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 20, search: 'jane' }, 'company-1');

      const arg = prisma.user.findMany.mock.calls[0][0];
      expect(arg.where.companyId).toBe('company-1');
      expect(arg.where.OR).toEqual([
        { email: { contains: 'jane', mode: 'insensitive' } },
        { firstName: { contains: 'jane', mode: 'insensitive' } },
        { lastName: { contains: 'jane', mode: 'insensitive' } },
      ]);
    });
  });

  describe('updateStatus', () => {
    it('deactivating a user revokes their refresh tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        isActive: false,
        companyId: 'c1',
      });

      await service.updateStatus('u1', { isActive: false });

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('activating a user does not revoke tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        isActive: true,
        companyId: 'c1',
      });

      await service.updateStatus('u1', { isActive: true });

      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus('missing', { isActive: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

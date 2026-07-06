import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AllowlistService } from './allowlist.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AllowlistService (admin methods)', () => {
  let service: AllowlistService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      allowedEmail: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllowlistService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = module.get(AllowlistService);
  });

  describe('add', () => {
    it('normalizes a bare domain into a DOMAIN entry', async () => {
      prisma.allowedEmail.upsert.mockResolvedValue({ id: '1' });
      await service.add('@acme.com', 'pilot');

      const arg = prisma.allowedEmail.upsert.mock.calls[0][0];
      expect(arg.create).toMatchObject({ value: 'acme.com', type: 'DOMAIN' });
      expect(arg.create.note).toBe('pilot');
    });

    it('stores a full address as an EMAIL entry', async () => {
      prisma.allowedEmail.upsert.mockResolvedValue({ id: '2' });
      await service.add('Owner@Acme.com');

      const arg = prisma.allowedEmail.upsert.mock.calls[0][0];
      expect(arg.create).toMatchObject({
        value: 'owner@acme.com',
        type: 'EMAIL',
      });
    });

    it('returns null for an invalid value', async () => {
      const result = await service.add('!!');
      expect(result).toBeNull();
      expect(prisma.allowedEmail.upsert).not.toHaveBeenCalled();
    });
  });

  describe('removeById', () => {
    it('returns true when a row is deleted', async () => {
      prisma.allowedEmail.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.removeById('abc')).resolves.toBe(true);
    });

    it('returns false when nothing is deleted', async () => {
      prisma.allowedEmail.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.removeById('missing')).resolves.toBe(false);
    });
  });

  describe('list', () => {
    it('returns entries ordered by createdAt desc', async () => {
      prisma.allowedEmail.findMany.mockResolvedValue([{ id: '1' }]);
      const result = await service.list();
      expect(result).toEqual([{ id: '1' }]);
      expect(prisma.allowedEmail.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});

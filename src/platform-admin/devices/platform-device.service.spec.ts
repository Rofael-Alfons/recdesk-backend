import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { PlatformDeviceService } from './platform-device.service';
import { PrismaService } from '../../prisma/prisma.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('PlatformDeviceService', () => {
  let service: PlatformDeviceService;
  let prisma: {
    platformDevice: { findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      platformDevice: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformDeviceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PlatformDeviceService);
  });

  it('hashes tokens with SHA-256 and trims whitespace', () => {
    expect(PlatformDeviceService.hashToken('  abc ')).toBe(sha256('abc'));
  });

  it('returns null for empty/undefined tokens without hitting the DB', async () => {
    expect(await service.verifyToken(undefined)).toBeNull();
    expect(await service.verifyToken('')).toBeNull();
    expect(prisma.platformDevice.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when no device matches', async () => {
    prisma.platformDevice.findUnique.mockResolvedValue(null);
    expect(await service.verifyToken('nope')).toBeNull();
  });

  it('returns null for a revoked (inactive) device', async () => {
    prisma.platformDevice.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Mac',
      isActive: false,
      lastSeenAt: null,
    });
    expect(await service.verifyToken('token')).toBeNull();
  });

  it('resolves an active device and looks it up by token hash', async () => {
    prisma.platformDevice.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Rofa MacBook',
      isActive: true,
      lastSeenAt: null,
    });

    const result = await service.verifyToken('secret-token');

    expect(result).toEqual({ id: 'd1', name: 'Rofa MacBook' });
    expect(prisma.platformDevice.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256('secret-token') },
    });
    // lastSeenAt was null → should refresh it.
    expect(prisma.platformDevice.update).toHaveBeenCalled();
  });

  it('does not refresh lastSeenAt more than once per minute', async () => {
    prisma.platformDevice.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Mac',
      isActive: true,
      lastSeenAt: new Date(), // just seen
    });

    await service.verifyToken('secret-token');

    expect(prisma.platformDevice.update).not.toHaveBeenCalled();
  });
});

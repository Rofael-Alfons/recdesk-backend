import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
    service.$connect = jest.fn().mockResolvedValue(undefined);
    service.$disconnect = jest.fn().mockResolvedValue(undefined);
  });

  it('connects on module init', async () => {
    await service.onModuleInit();

    expect(service.$connect).toHaveBeenCalled();
  });

  it('disconnects on module destroy', async () => {
    await service.onModuleDestroy();

    expect(service.$disconnect).toHaveBeenCalled();
  });

  it('blocks cleanDatabase in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await expect(service.cleanDatabase()).rejects.toThrow(
      'Cannot clean database in production',
    );

    process.env.NODE_ENV = originalEnv;
  });
});

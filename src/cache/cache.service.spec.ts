import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService, CACHE_KEYS, CACHE_TTLS } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let cacheManager: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    cacheManager = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    service = module.get(CacheService);
  });

  describe('getOrSet', () => {
    it('returns cached value when present', async () => {
      cacheManager.get.mockResolvedValue({ id: 'sub-1' });
      const factory = jest.fn();

      const result = await service.getOrSet('key', factory, 60);

      expect(result).toEqual({ id: 'sub-1' });
      expect(factory).not.toHaveBeenCalled();
    });

    it('executes factory and caches result on miss', async () => {
      cacheManager.get.mockResolvedValue(undefined);
      const factory = jest.fn().mockResolvedValue({ id: 'sub-2' });

      const result = await service.getOrSet('key', factory, 60);

      expect(result).toEqual({ id: 'sub-2' });
      expect(cacheManager.set).toHaveBeenCalledWith('key', { id: 'sub-2' }, 60);
    });
  });

  describe('subscription cache helpers', () => {
    it('stores subscription with configured TTL', async () => {
      await service.setSubscription('comp-1', { status: 'ACTIVE' });

      expect(cacheManager.set).toHaveBeenCalledWith(
        `${CACHE_KEYS.SUBSCRIPTION}comp-1`,
        { status: 'ACTIVE' },
        CACHE_TTLS.SUBSCRIPTION,
      );
    });

    it('invalidates subscription cache key', async () => {
      await service.invalidateSubscription('comp-1');

      expect(cacheManager.del).toHaveBeenCalledWith(
        `${CACHE_KEYS.SUBSCRIPTION}comp-1`,
      );
    });
  });

  describe('error handling', () => {
    it('returns undefined when cache get fails', async () => {
      cacheManager.get.mockRejectedValue(new Error('redis down'));

      const result = await service.get('missing');

      expect(result).toBeUndefined();
    });
  });
});

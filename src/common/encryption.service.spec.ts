import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

const VALID_KEY = randomBytes(32).toString('hex');

describe('EncryptionService', () => {
  async function createService(key?: string) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (name: string) =>
              name === 'encryption.key' ? key : undefined,
          },
        },
      ],
    }).compile();

    return module.get(EncryptionService);
  }

  it('is disabled when ENCRYPTION_KEY is missing', async () => {
    const service = await createService(undefined);
    expect(service.isEnabled()).toBe(false);
    expect(service.encrypt('secret')).toBe('secret');
    expect(service.decrypt('secret')).toBe('secret');
  });

  it('is disabled when key length is invalid', async () => {
    const service = await createService('abcd');
    expect(service.isEnabled()).toBe(false);
  });

  it('encrypts and decrypts round-trip when enabled', async () => {
    const service = await createService(VALID_KEY);
    expect(service.isEnabled()).toBe(true);

    const plaintext = 'oauth-access-token-12345';
    const ciphertext = service.encrypt(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.split(':')).toHaveLength(3);
    expect(service.decrypt(ciphertext)).toBe(plaintext);
  });

  it('returns ciphertext unchanged when decrypting invalid format', async () => {
    const service = await createService(VALID_KEY);
    expect(service.decrypt('not-valid-ciphertext')).toBe('not-valid-ciphertext');
  });

  it('returns ciphertext unchanged when auth tag is tampered', async () => {
    const service = await createService(VALID_KEY);
    const encrypted = service.encrypt('token');
    const parts = encrypted.split(':');
    parts[1] = Buffer.from('tampered-tag-value!!').toString('base64');

    expect(service.decrypt(parts.join(':'))).toBe(parts.join(':'));
  });
});

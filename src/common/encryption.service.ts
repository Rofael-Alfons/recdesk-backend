import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer | null;

  constructor(private configService: ConfigService) {
    const rawKey = this.configService.get<string>('encryption.key');
    if (rawKey) {
      this.key = Buffer.from(rawKey, 'hex');
      if (this.key.length !== 32) {
        this.logger.error(
          'ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars). Encryption disabled.',
        );
        this.key = null;
      }
    } else {
      this.key = null;
      this.logger.warn(
        'ENCRYPTION_KEY not configured. Token encryption is disabled.',
      );
    }
  }

  isEnabled(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): string {
    if (!this.key) return plaintext;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(ciphertext: string): string {
    if (!this.key) return ciphertext;

    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      return ciphertext;
    }

    try {
      const iv = Buffer.from(parts[0], 'base64');
      const authTag = Buffer.from(parts[1], 'base64');
      const encrypted = Buffer.from(parts[2], 'base64');

      const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      return ciphertext;
    }
  }
}

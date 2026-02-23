/**
 * One-time migration script to encrypt existing plain-text OAuth tokens.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/encrypt-existing-tokens.ts
 *
 * Requirements:
 *   - ENCRYPTION_KEY must be set in .env (64 hex chars = 32 bytes)
 *   - DATABASE_URL must be set in .env
 *
 * Safety:
 *   - Skips tokens that are already in encrypted format (iv:tag:data)
 *   - Idempotent: safe to run multiple times
 */

import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
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

function looksEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  try {
    Buffer.from(parts[0], 'base64');
    Buffer.from(parts[1], 'base64');
    Buffer.from(parts[2], 'base64');
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    console.error('ERROR: ENCRYPTION_KEY environment variable is not set.');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }

  const key = Buffer.from(rawKey, 'hex');
  if (key.length !== 32) {
    console.error('ERROR: ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters).');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const connections = await prisma.emailConnection.findMany({
      select: {
        id: true,
        email: true,
        accessToken: true,
        refreshToken: true,
      },
    });

    console.log(`Found ${connections.length} email connection(s).`);

    let encrypted = 0;
    let skipped = 0;

    for (const conn of connections) {
      const updates: { accessToken?: string; refreshToken?: string } = {};

      if (conn.accessToken && !looksEncrypted(conn.accessToken)) {
        updates.accessToken = encrypt(conn.accessToken, key);
      }

      if (conn.refreshToken && !looksEncrypted(conn.refreshToken)) {
        updates.refreshToken = encrypt(conn.refreshToken, key);
      }

      if (Object.keys(updates).length > 0) {
        await prisma.emailConnection.update({
          where: { id: conn.id },
          data: updates,
        });
        encrypted++;
        console.log(`  Encrypted tokens for ${conn.email}`);
      } else {
        skipped++;
        console.log(`  Skipped ${conn.email} (already encrypted or no tokens)`);
      }
    }

    console.log(`\nDone. Encrypted: ${encrypted}, Skipped: ${skipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

/**
 * Manage devices allowed to access the RecDesk super-admin console.
 *
 * The console is locked to enrolled devices: every /api/admin/* request must
 * send a device token whose SHA-256 hash matches an ACTIVE row in
 * `platform_devices`. This script mints those tokens.
 *
 * Usage (run against the target environment's DATABASE_URL):
 *   # Register a device — prints the one-time token to paste into the console:
 *   npm run platform-device -- --register --name="Rofa MacBook"
 *   npm run platform-device -- --register --name="Rofa iPhone"
 *
 *   # List enrolled devices:
 *   npm run platform-device -- --list
 *
 *   # Revoke (deactivate) or re-activate a device by id:
 *   npm run platform-device -- --revoke=<deviceId>
 *   npm run platform-device -- --activate=<deviceId>
 *
 *   # Permanently delete a device row by id:
 *   npm run platform-device -- --delete=<deviceId>
 *
 * The plaintext token is shown ONCE at registration and never stored — only its
 * hash is kept. If lost, revoke the device and register a new one.
 */

import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

interface Args {
  register: boolean;
  list: boolean;
  name?: string;
  revoke?: string;
  activate?: string;
  delete?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { register: false, list: false };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    switch (key) {
      case 'register':
        args.register = true;
        break;
      case 'list':
        args.list = true;
        break;
      case 'name':
        args.name = value?.trim();
        break;
      case 'revoke':
        args.revoke = value?.trim();
        break;
      case 'activate':
        args.activate = value?.trim();
        break;
      case 'delete':
        args.delete = value?.trim();
        break;
      default:
        break;
    }
  }
  return args;
}

async function listDevices(prisma: PrismaClient) {
  const devices = await prisma.platformDevice.findMany({
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\nFound ${devices.length} enrolled device(s):\n`);
  for (const d of devices) {
    console.log(`  - ${d.name}`);
    console.log(`      id:       ${d.id}`);
    console.log(`      active:   ${d.isActive}`);
    console.log(
      `      lastSeen: ${d.lastSeenAt ? d.lastSeenAt.toISOString() : 'never'}\n`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    if (args.list) {
      await listDevices(prisma);
      return;
    }

    if (args.revoke || args.activate) {
      const id = (args.revoke || args.activate) as string;
      const isActive = !!args.activate;
      const existing = await prisma.platformDevice.findUnique({
        where: { id },
      });
      if (!existing) {
        console.error(`ERROR: no device with id "${id}".`);
        process.exit(1);
      }
      await prisma.platformDevice.update({
        where: { id },
        data: { isActive },
      });
      console.log(
        `Device "${existing.name}" is now ${isActive ? 'ACTIVE' : 'REVOKED'}.`,
      );
      return;
    }

    if (args.delete) {
      const existing = await prisma.platformDevice.findUnique({
        where: { id: args.delete },
      });
      if (!existing) {
        console.error(`ERROR: no device with id "${args.delete}".`);
        process.exit(1);
      }
      await prisma.platformDevice.delete({ where: { id: args.delete } });
      console.log(`Deleted device "${existing.name}".`);
      return;
    }

    if (args.register) {
      if (!args.name) {
        console.error('ERROR: --name is required to register a device.');
        process.exit(1);
      }

      // 32 random bytes -> 43-char base64url secret. High entropy.
      const token = randomBytes(32).toString('base64url');
      const device = await prisma.platformDevice.create({
        data: { name: args.name, tokenHash: hashToken(token) },
      });

      console.log('\n============================================');
      console.log(' DEVICE REGISTERED');
      console.log('============================================');
      console.log(`  Name: ${device.name}`);
      console.log(`  Id:   ${device.id}`);
      console.log('\n  Device token (shown ONCE — paste into the console');
      console.log('  enrollment screen on this device):\n');
      console.log(`  ${token}\n`);
      console.log('  Store it in a password manager. It cannot be recovered.');
      console.log('============================================\n');
      return;
    }

    console.error(
      'Nothing to do. Use --register --name="…", --list, --revoke=<id>, --activate=<id>, or --delete=<id>.',
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('manage-platform-devices failed:', err);
  process.exit(1);
});

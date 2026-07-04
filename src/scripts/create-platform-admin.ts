/**
 * Create (or update) a RecDesk platform super-admin.
 *
 * Platform admins live in the isolated `platform_admins` table and authenticate
 * against the super-admin console with a SEPARATE JWT secret. They are never
 * tied to a company. This script is the bootstrap path for the first admin.
 *
 * Usage (run against the target environment's DATABASE_URL):
 *   npx ts-node -r tsconfig-paths/register src/scripts/create-platform-admin.ts \
 *     --email=ops@recdesk.io --password='StrongPass123!' \
 *     --first-name=Ops --last-name=Team
 *
 *   # list existing platform admins
 *   npx ts-node -r tsconfig-paths/register src/scripts/create-platform-admin.ts --list
 *
 *   # deactivate / reactivate
 *   npx ts-node -r tsconfig-paths/register src/scripts/create-platform-admin.ts \
 *     --email=ops@recdesk.io --deactivate
 *
 * Flags:
 *   --email        Admin email (required unless --list)
 *   --password     Password (required when creating; min 8 chars)
 *   --first-name   First name (default: derived from email)
 *   --last-name    Last name (default: "Admin")
 *   --deactivate   Set isActive=false for an existing admin
 *   --activate     Set isActive=true for an existing admin
 *   --list         List platform admins and exit
 *
 * Notes:
 *   - Idempotent: re-running with a password resets the password.
 *   - Requires DATABASE_URL in the environment (loaded from .env).
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

interface Args {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  deactivate: boolean;
  activate: boolean;
  list: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    deactivate: false,
    activate: false,
    list: false,
  };

  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    switch (key) {
      case 'email':
        args.email = value?.toLowerCase().trim();
        break;
      case 'password':
        args.password = value;
        break;
      case 'first-name':
        args.firstName = value?.trim();
        break;
      case 'last-name':
        args.lastName = value?.trim();
        break;
      case 'deactivate':
        args.deactivate = true;
        break;
      case 'activate':
        args.activate = true;
        break;
      case 'list':
        args.list = true;
        break;
      default:
        break;
    }
  }

  return args;
}

async function listAdmins(prisma: PrismaClient) {
  const admins = await prisma.platformAdmin.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      lastLoginAt: true,
    },
  });

  console.log(`\nFound ${admins.length} platform admin(s):\n`);
  for (const a of admins) {
    console.log(`  - ${a.firstName} ${a.lastName} <${a.email}>`);
    console.log(`      id:        ${a.id}`);
    console.log(`      active:    ${a.isActive}`);
    console.log(
      `      lastLogin: ${a.lastLoginAt ? a.lastLoginAt.toISOString() : 'never'}\n`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    if (args.list) {
      await listAdmins(prisma);
      return;
    }

    if (!args.email) {
      console.error('ERROR: --email is required (or use --list).');
      process.exit(1);
    }

    const existing = await prisma.platformAdmin.findUnique({
      where: { email: args.email },
    });

    // Toggle activation on an existing admin.
    if (args.deactivate || args.activate) {
      if (!existing) {
        console.error(`ERROR: no platform admin with email "${args.email}".`);
        process.exit(1);
      }
      const isActive = args.activate ? true : false;
      await prisma.platformAdmin.update({
        where: { id: existing.id },
        data: { isActive },
      });
      console.log(
        `Platform admin "${args.email}" is now ${isActive ? 'ACTIVE' : 'DEACTIVATED'}.`,
      );
      return;
    }

    if (!args.password || args.password.length < 8) {
      console.error('ERROR: --password is required (min 8 characters).');
      process.exit(1);
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const passwordHash = await bcrypt.hash(args.password, saltRounds);

    const firstName =
      args.firstName || args.email.split('@')[0] || 'Platform';
    const lastName = args.lastName || 'Admin';

    if (existing) {
      await prisma.platformAdmin.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          firstName,
          lastName,
          isActive: true,
        },
      });
      console.log(`Updated platform admin "${args.email}" (password reset).`);
    } else {
      const created = await prisma.platformAdmin.create({
        data: {
          email: args.email,
          passwordHash,
          firstName,
          lastName,
        },
      });
      console.log(`Created platform admin "${args.email}" (${created.id}).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('create-platform-admin failed:', err);
  process.exit(1);
});

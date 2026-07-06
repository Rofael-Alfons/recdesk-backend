/**
 * Manage the access allowlist that gates registration and login.
 *
 * Only emails matching an entry in the `allowed_emails` table may register or
 * sign in (email/password AND Google/Microsoft OAuth). Entries are either an
 * exact EMAIL or a whole DOMAIN (which allows every address at that domain).
 *
 * Usage (run against the target environment's DATABASE_URL):
 *   # add an individual email
 *   npx ts-node -r tsconfig-paths/register src/scripts/manage-allowlist.ts \
 *     --add=owner@acme.com [--note="Pilot customer"]
 *
 *   # add a whole domain (both forms work)
 *   npx ts-node -r tsconfig-paths/register src/scripts/manage-allowlist.ts --add=@acme.com
 *   npx ts-node -r tsconfig-paths/register src/scripts/manage-allowlist.ts --add=acme.com
 *
 *   # remove an entry (email or domain, with or without leading "@")
 *   npx ts-node -r tsconfig-paths/register src/scripts/manage-allowlist.ts --remove=owner@acme.com
 *
 *   # list all entries
 *   npx ts-node -r tsconfig-paths/register src/scripts/manage-allowlist.ts --list
 *
 * Flags:
 *   --add=<email|@domain|domain>     Add (upsert) an allowlist entry
 *   --remove=<email|@domain|domain>  Remove an allowlist entry
 *   --list                           List all entries and exit
 *   --note="..."                     Optional note stored with an added entry
 *
 * Notes:
 *   - Values are normalized to lowercase. A leading "@" (or a bare domain with
 *     no local part) is stored as a DOMAIN entry; anything with a local part is
 *     stored as an EMAIL entry.
 *   - Idempotent: re-adding the same value updates its note.
 *   - Requires DATABASE_URL in the environment (loaded from .env).
 */

import { PrismaClient, AllowlistEntryType } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

interface Args {
  add?: string;
  remove?: string;
  note?: string;
  list: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false };

  for (const raw of argv) {
    const [key, ...rest] = raw.replace(/^--/, '').split('=');
    const value = rest.join('=');
    switch (key) {
      case 'add':
        args.add = value?.trim();
        break;
      case 'remove':
        args.remove = value?.trim();
        break;
      case 'note':
        args.note = value?.trim();
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

/**
 * Normalizes a raw token into a typed allowlist entry.
 * "@acme.com" or "acme.com" -> DOMAIN "acme.com"
 * "user@acme.com" -> EMAIL "user@acme.com"
 */
function normalizeEntry(
  raw: string,
): { value: string; type: AllowlistEntryType } | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  if (trimmed.startsWith('@')) {
    const domain = trimmed.slice(1);
    return domain ? { value: domain, type: AllowlistEntryType.DOMAIN } : null;
  }

  if (trimmed.includes('@')) {
    return { value: trimmed, type: AllowlistEntryType.EMAIL };
  }

  return trimmed.includes('.')
    ? { value: trimmed, type: AllowlistEntryType.DOMAIN }
    : null;
}

async function listEntries(prisma: PrismaClient) {
  const entries = await prisma.allowedEmail.findMany({
    orderBy: [{ type: 'asc' }, { value: 'asc' }],
  });

  console.log(`\nAllowlist has ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}:\n`);
  for (const e of entries) {
    const label = e.type === AllowlistEntryType.DOMAIN ? `@${e.value}` : e.value;
    const note = e.note ? `  (${e.note})` : '';
    console.log(`  - [${e.type}] ${label}${note}`);
  }
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    if (args.list) {
      await listEntries(prisma);
      return;
    }

    if (!args.add && !args.remove) {
      console.error(
        'ERROR: provide one of --add=<email|@domain>, --remove=<email|@domain>, or --list.',
      );
      process.exit(1);
    }

    if (args.add) {
      const entry = normalizeEntry(args.add);
      if (!entry) {
        console.error(`ERROR: "${args.add}" is not a valid email or domain.`);
        process.exit(1);
      }

      const result = await prisma.allowedEmail.upsert({
        where: { value: entry.value },
        update: { type: entry.type, ...(args.note ? { note: args.note } : {}) },
        create: {
          value: entry.value,
          type: entry.type,
          note: args.note ?? null,
        },
      });

      const label =
        result.type === AllowlistEntryType.DOMAIN
          ? `@${result.value}`
          : result.value;
      console.log(`Added / updated allowlist entry: [${result.type}] ${label}`);
    }

    if (args.remove) {
      const entry = normalizeEntry(args.remove);
      if (!entry) {
        console.error(`ERROR: "${args.remove}" is not a valid email or domain.`);
        process.exit(1);
      }

      const deleted = await prisma.allowedEmail.deleteMany({
        where: { value: entry.value },
      });

      if (deleted.count === 0) {
        console.log(`No allowlist entry found for "${args.remove}".`);
      } else {
        console.log(`Removed allowlist entry: ${args.remove}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('manage-allowlist failed:', err);
  process.exit(1);
});

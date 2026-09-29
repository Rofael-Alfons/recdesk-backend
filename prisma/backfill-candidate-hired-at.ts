/**
 * One-off backfill: populates the new `hiredAt` field for candidates that
 * were already marked HIRED before this field existed, approximating it as
 * their `updatedAt` timestamp. This is best-effort — `updatedAt` may reflect
 * a later unrelated edit rather than the actual moment they were hired — but
 * it's the closest signal available in existing data.
 * Idempotent — only touches candidates where hiredAt is still NULL, so it's
 * safe to re-run (and safe to run after new code has already started
 * writing hiredAt on new HIRED transitions).
 *
 * Run with: npx ts-node prisma/backfill-candidate-hired-at.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRaw`
    UPDATE candidates
    SET "hiredAt" = "updatedAt"
    WHERE status = 'HIRED' AND "hiredAt" IS NULL
  `;

  console.log(`\nDone. Backfilled: ${result} candidate(s).`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

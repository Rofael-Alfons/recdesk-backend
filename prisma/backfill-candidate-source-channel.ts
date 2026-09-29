/**
 * One-off backfill: populates the new `sourceChannel` field for existing
 * candidates, inferred best-effort from their current `source` field.
 * Idempotent — only touches candidates where sourceChannel is still NULL,
 * so it's safe to re-run (and safe to run after new code has already
 * started writing sourceChannel on new candidates).
 *
 * Mapping (source -> sourceChannel):
 *   EMAIL     -> EMAIL_INBOX
 *   UPLOAD    -> BULK_UPLOAD
 *   REFERRAL  -> REFERRAL
 *   JOB_BOARD -> OTHER   (no way to tell which board from historical data)
 *   MANUAL    -> OTHER   (manual/API-created candidates predate this taxonomy)
 *
 * Run with: npx ts-node prisma/backfill-candidate-source-channel.ts
 */
import { PrismaClient, CandidateSource, CandidateSourceChannel } from '@prisma/client';

const prisma = new PrismaClient();

const SOURCE_TO_CHANNEL: Record<CandidateSource, CandidateSourceChannel> = {
  [CandidateSource.EMAIL]: CandidateSourceChannel.EMAIL_INBOX,
  [CandidateSource.UPLOAD]: CandidateSourceChannel.BULK_UPLOAD,
  [CandidateSource.REFERRAL]: CandidateSourceChannel.REFERRAL,
  [CandidateSource.JOB_BOARD]: CandidateSourceChannel.OTHER,
  [CandidateSource.MANUAL]: CandidateSourceChannel.OTHER,
};

async function main() {
  const candidates = await prisma.candidate.findMany({
    where: { sourceChannel: null },
    select: { id: true, source: true },
  });

  let updated = 0;

  for (const candidate of candidates) {
    const channel = SOURCE_TO_CHANNEL[candidate.source] ?? CandidateSourceChannel.OTHER;
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { sourceChannel: channel },
    });
    updated++;
  }

  console.log(`\nDone. Backfilled: ${updated} candidate(s).`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

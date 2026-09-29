/**
 * One-off backfill: seeds the default pipeline stages (New / Screening /
 * Interview / Offer / Hired) for every existing job that has no
 * PipelineStage rows. Interview feedback and interviewer assignment are
 * anchored to these stages, so every job needs them.
 * Idempotent — safe to re-run (skips jobs that already have any stages).
 *
 * New jobs don't need this — JobsService.create() seeds the same defaults.
 *
 * Run with: npx ts-node prisma/backfill-job-pipeline-stages.ts
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_PIPELINE_STAGES } from '../src/common/pipeline-stage.util';

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    where: { pipelineStages: { none: {} } },
    select: { id: true, title: true, companyId: true },
  });

  for (const job of jobs) {
    await prisma.pipelineStage.createMany({
      data: DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage, jobId: job.id })),
    });
    console.log(`Seeded default pipeline stages for "${job.title}" (${job.id}, company ${job.companyId})`);
  }

  console.log(`\nDone. Seeded: ${jobs.length} job(s) without stages.`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

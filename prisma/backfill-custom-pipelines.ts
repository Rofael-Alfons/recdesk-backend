/**
 * One-off backfill for custom per-job pipelines. Idempotent — safe to re-run.
 *
 * 1. pipeline_stages.category: set from the default stage name for rows
 *    created before categories existed (New→NEW, Screening→SCREENING,
 *    Interview→INTERVIEW, Offer→OFFER, Hired→HIRED, anything else→INTERVIEW).
 * 2. candidates.currentStageId: set for open candidates on a job, from their
 *    status (first stage of the matching category). Rejected/withdrawn
 *    candidates are left null (where they were rejected is unknown).
 *
 * The app works without this (it derives both at read time); the backfill
 * makes the stored values explicit so later stage edits behave predictably.
 * Run after prisma/backfill-job-pipeline-stages.ts.
 *
 * Run with: npx ts-node prisma/backfill-custom-pipelines.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  CLOSED_STATUSES,
  categoryFromName,
  stageForStatus,
} from '../src/common/pipeline-stage.util';

const prisma = new PrismaClient();

async function main() {
  // 1. Stage categories
  const uncategorized = await prisma.pipelineStage.findMany({
    where: { category: null },
    select: { id: true, name: true },
  });
  for (const stage of uncategorized) {
    await prisma.pipelineStage.update({
      where: { id: stage.id },
      data: { category: categoryFromName(stage.name) },
    });
  }
  console.log(`Stage categories set: ${uncategorized.length}`);

  // 2. Candidate positions, one job at a time
  const jobs = await prisma.job.findMany({
    where: {
      candidates: {
        some: { currentStageId: null, status: { notIn: CLOSED_STATUSES } },
      },
    },
    select: {
      id: true,
      title: true,
      pipelineStages: {
        select: { id: true, name: true, orderIndex: true, category: true },
      },
    },
  });

  let placed = 0;
  for (const job of jobs) {
    if (job.pipelineStages.length === 0) {
      console.warn(`Skipping "${job.title}" (${job.id}): no stages — run backfill-job-pipeline-stages.ts first`);
      continue;
    }
    const candidates = await prisma.candidate.findMany({
      where: { jobId: job.id, currentStageId: null, status: { notIn: CLOSED_STATUSES } },
      select: { id: true, status: true },
    });
    const byStage = new Map<string, string[]>();
    for (const c of candidates) {
      const stage = stageForStatus(job.pipelineStages, c.status)!;
      byStage.set(stage.id, [...(byStage.get(stage.id) ?? []), c.id]);
    }
    for (const [stageId, ids] of byStage) {
      // currentStageId: null guard keeps concurrent app moves authoritative.
      const { count } = await prisma.candidate.updateMany({
        where: { id: { in: ids }, currentStageId: null },
        data: { currentStageId: stageId },
      });
      placed += count;
    }
  }
  console.log(`Candidates placed in a stage: ${placed} (across ${jobs.length} job(s))`);
  console.log('\nDone.');
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

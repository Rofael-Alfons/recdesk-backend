/**
 * One-off backfill: derives the candidate filter facets (skillsNormalized,
 * languageNames, currentTitle, currentCompany, university,
 * totalExperienceYears, educationLevel) for candidates parsed before these
 * columns existed, and fills country/region/city from the free-text
 * `location` where they are still empty.
 *
 * - Code-derived facets come straight from the stored parsed-CV JSON.
 * - Experience years, education level and the location split come from one
 *   small AiService.deriveProfileFacets call per candidate, made only when
 *   the candidate has experience/education JSON or an undecomposed location.
 *   These calls are platform cost, not billed to the customer's usage.
 *
 * Idempotent — only touches candidates where facetsDerivedAt is still NULL,
 * and the UPDATE re-checks that, so it's safe to re-run and safe to run
 * while new code is already deriving facets at parse time. A candidate whose
 * AI call fails stays NULL and is retried on the next run.
 * Never overwrites data: country/region/city are only filled where NULL (so
 * recruiter edits win), and updatedAt is left untouched.
 *
 * Run with: npx ts-node prisma/backfill-candidate-facets.ts [--dry-run]
 *   --dry-run  reports what would change; no AI calls, no writes.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import configuration from '../src/config/configuration';
import { AiService, ProfileFacetsResult } from '../src/ai/ai.service';
import { deriveCandidateFacets } from '../src/candidates/candidate-facets.util';

const BATCH_SIZE = 20;
const CONCURRENCY = 3;

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

type PendingCandidate = {
  id: string;
  location: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  skills: unknown;
  experience: unknown;
  education: unknown;
  languages: unknown;
};

function cleanPart(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 100) : null;
}

function hasEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function needsAi(c: PendingCandidate): boolean {
  const locationUnsplit = !!c.location?.trim() && (!c.country || !c.region || !c.city);
  return hasEntries(c.experience) || hasEntries(c.education) || locationUnsplit;
}

async function backfillOne(ai: AiService | null, c: PendingCandidate) {
  let aiFacets: ProfileFacetsResult | null = null;
  if (ai && needsAi(c)) {
    aiFacets = await ai.deriveProfileFacets({
      experience: c.experience,
      education: c.education,
      location: c.location,
    });
  }

  const facets = deriveCandidateFacets({
    skills: c.skills,
    experience: c.experience,
    education: c.education,
    languages: c.languages,
    totalExperienceYears: aiFacets?.totalExperienceYears,
    highestEducationLevel: aiFacets?.highestEducationLevel,
  });

  const country = cleanPart(aiFacets?.country);
  const region = cleanPart(aiFacets?.region);
  const city = cleanPart(aiFacets?.city);

  // Raw SQL on purpose: a Prisma update would bump @updatedAt on every
  // existing candidate, corrupting "last updated" filters and sorting.
  return prisma.$executeRaw`
    UPDATE candidates SET
      "skillsNormalized" = ${facets.skillsNormalized}::text[],
      "languageNames" = ${facets.languageNames}::text[],
      "currentTitle" = ${facets.currentTitle},
      "currentCompany" = ${facets.currentCompany},
      university = ${facets.university},
      "totalExperienceYears" = ${facets.totalExperienceYears}::double precision,
      "educationLevel" = ${facets.educationLevel}::"EducationLevel",
      "facetsDerivedAt" = ${facets.facetsDerivedAt},
      country = COALESCE(country, ${country}),
      region = COALESCE(region, ${region}),
      city = COALESCE(city, ${city})
    WHERE id = ${c.id} AND "facetsDerivedAt" IS NULL
  `;
}

async function main() {
  const pending = await prisma.candidate.count({ where: { facetsDerivedAt: null } });
  console.log(`${dryRun ? '[dry-run] ' : ''}Candidates pending facets: ${pending}`);
  if (pending === 0) return;

  const ai = dryRun ? null : new AiService(new ConfigService(configuration()));

  let cursor: string | undefined;
  let processed = 0;
  let updated = 0;
  let aiCalls = 0;
  const failures: string[] = [];

  for (;;) {
    // Cursor pagination, so candidates that fail (and stay NULL) are not
    // re-fetched in the same run.
    const batch: PendingCandidate[] = await prisma.candidate.findMany({
      where: { facetsDerivedAt: null, ...(cursor && { id: { gt: cursor } }) },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        location: true,
        country: true,
        region: true,
        city: true,
        skills: true,
        experience: true,
        education: true,
        languages: true,
      },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      aiCalls += chunk.filter(needsAi).length;

      if (dryRun) {
        for (const c of chunk) {
          const facets = deriveCandidateFacets(c);
          console.log(
            `  ${c.id}: ${facets.skillsNormalized.length} skills, ${facets.languageNames.length} languages, ` +
              `role=${JSON.stringify(facets.currentTitle)}, ai=${needsAi(c) ? 'yes' : 'no'}`,
          );
        }
        processed += chunk.length;
        continue;
      }

      const results = await Promise.allSettled(chunk.map((c) => backfillOne(ai, c)));
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          updated += result.value;
        } else {
          failures.push(chunk[index].id);
          console.error(`  Failed ${chunk[index].id}:`, result.reason?.message ?? result.reason);
        }
      });
      processed += chunk.length;
    }

    console.log(`  Progress: ${processed}/${pending}`);
  }

  if (dryRun) {
    console.log(
      `\n[dry-run] Done. Would process ${processed} candidate(s), with ${aiCalls} AI call(s). Nothing was written.`,
    );
    return;
  }

  console.log(
    `\nDone. Backfilled: ${updated} candidate(s), AI calls: ${aiCalls}, failed: ${failures.length}.`,
  );
  if (failures.length) {
    console.log('Failed candidates stay pending and will be retried on the next run.');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

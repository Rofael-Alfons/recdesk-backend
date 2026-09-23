/**
 * One-off backfill: seeds the default document checklist presets for every
 * existing company that doesn't have any DocumentTemplateItem rows yet.
 * Idempotent — safe to re-run (skips companies that already have items,
 * whether from this script or from a recruiter's own edits).
 *
 * New companies no longer need this — DocumentTemplatesService.
 * createDefaultDocumentTemplates() is called automatically at signup
 * (src/auth/auth.service.ts). This script only covers companies created
 * before that hook existed.
 *
 * Run with: npx ts-node prisma/backfill-document-templates.ts
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_TEMPLATE_ITEMS } from '../src/document-templates/document-templates.service';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });

  let seeded = 0;
  let skipped = 0;

  for (const company of companies) {
    const existingCount = await prisma.documentTemplateItem.count({
      where: { companyId: company.id },
    });
    if (existingCount > 0) {
      skipped++;
      continue;
    }

    await prisma.documentTemplateItem.createMany({
      data: DEFAULT_TEMPLATE_ITEMS.map((item, index) => ({
        ...item,
        orderIndex: index,
        companyId: company.id,
      })),
    });
    seeded++;
    console.log(`Seeded default document checklist for "${company.name}" (${company.id})`);
  }

  console.log(`\nDone. Seeded: ${seeded}, already had items (skipped): ${skipped}`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

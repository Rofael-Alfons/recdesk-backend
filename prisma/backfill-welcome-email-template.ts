/**
 * One-off backfill: seeds the default "Welcome to the Team" email template
 * for every existing company that doesn't have a WELCOME-type template yet.
 * Idempotent — safe to re-run (EmailTemplatesService.seedDefaults() skips
 * any template that already exists by name+type per company, so it's safe
 * to call for companies that already have some templates too).
 *
 * New companies no longer need this — EmailTemplatesService.seedDefaults()
 * is already called automatically at signup (src/auth/auth.service.ts).
 * This script only covers companies created before the WELCOME type existed.
 *
 * Run with: npx ts-node prisma/backfill-welcome-email-template.ts
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailTemplatesService } from '../src/email-templates/email-templates.service';
import { EmailTemplateType } from '../src/email-templates/dto';

const prisma = new PrismaService();
const emailTemplatesService = new EmailTemplatesService(prisma);

async function main() {
  await prisma.$connect();

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });

  let seeded = 0;
  let skipped = 0;

  for (const company of companies) {
    const existing = await emailTemplatesService.findDefaultByType(
      EmailTemplateType.WELCOME,
      company.id,
    );
    if (existing) {
      skipped++;
      continue;
    }

    await emailTemplatesService.seedDefaults(company.id);
    seeded++;
    console.log(`Seeded default welcome email template for "${company.name}" (${company.id})`);
  }

  console.log(`\nDone. Seeded: ${seeded}, already had a welcome template (skipped): ${skipped}`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Grant an ACTIVE subscription to a company without going through Stripe.
 *
 * Use case: demos / pilots / manual comping. Core features (CV upload, AI
 * parsing/scoring, rescoring) are gated behind `SubscriptionGuard`, which
 * returns 403 "Subscription Required" when a company has no active
 * subscription. Subscriptions are normally only created by the Stripe
 * `checkout.session.completed` webhook, so this script provides the missing
 * admin path.
 *
 * Usage (run against the target environment's DATABASE_URL):
 *   npx ts-node -r tsconfig-paths/register src/scripts/grant-subscription.ts \
 *     --admin-email=owner@agency.com [--plan=Professional] [--months=12]
 *
 *   # or target a company directly
 *   npx ts-node -r tsconfig-paths/register src/scripts/grant-subscription.ts \
 *     --company-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register src/scripts/grant-subscription.ts \
 *     --company-name="Agency Name"
 *
 *   # list companies to find the right one
 *   npx ts-node -r tsconfig-paths/register src/scripts/grant-subscription.ts --list
 *
 * Flags:
 *   --admin-email   Resolve the company via one of its users' email (most convenient)
 *   --company-id    Target company by id
 *   --company-name  Target company by exact name (case-insensitive)
 *   --plan          Plan name to grant: Starter | Professional | Enterprise (default: Professional)
 *   --months        Subscription length in months (default: 12)
 *   --list          List companies (id, name, current subscription) and exit
 *   --dry-run       Show what would change without writing
 *
 * Notes:
 *   - Idempotent: re-running upserts the same company's subscription.
 *   - No cache invalidation needed: BillingService.getSubscription does NOT
 *     cache null results, so there is no stale "no subscription" entry. The
 *     active-subscription cache TTL is 5 minutes; the new record is picked up
 *     on the next read at the latest.
 *   - Requires DATABASE_URL in the environment (loaded from .env).
 */

import { PrismaClient, SubscriptionStatus, PlanType } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

interface Args {
  adminEmail?: string;
  companyId?: string;
  companyName?: string;
  plan: string;
  months: number;
  list: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    plan: 'Professional',
    months: 12,
    list: false,
    dryRun: false,
  };

  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    switch (key) {
      case 'admin-email':
        args.adminEmail = value?.toLowerCase().trim();
        break;
      case 'company-id':
        args.companyId = value?.trim();
        break;
      case 'company-name':
        args.companyName = value?.trim();
        break;
      case 'plan':
        if (value) args.plan = value.trim();
        break;
      case 'months': {
        const n = Number(value);
        if (!Number.isNaN(n) && n > 0) args.months = n;
        break;
      }
      case 'list':
        args.list = true;
        break;
      case 'dry-run':
        args.dryRun = true;
        break;
      default:
        break;
    }
  }

  return args;
}

const PLAN_TO_PLAN_TYPE: Record<string, PlanType> = {
  Starter: PlanType.STARTER,
  Professional: PlanType.PROFESSIONAL,
  Enterprise: PlanType.ENTERPRISE,
};

async function listCompanies(prisma: PrismaClient) {
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      subscription: {
        select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
      },
      users: {
        where: { role: 'ADMIN' },
        select: { email: true },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\nFound ${companies.length} company/companies:\n`);
  for (const c of companies) {
    const sub = c.subscription
      ? `${c.subscription.plan?.name ?? '?'} / ${c.subscription.status} (ends ${c.subscription.currentPeriodEnd.toISOString().slice(0, 10)})`
      : 'NO SUBSCRIPTION';
    const admin = c.users[0]?.email ?? 'no admin';
    console.log(`  - ${c.name}`);
    console.log(`      id:    ${c.id}`);
    console.log(`      admin: ${admin}`);
    console.log(`      sub:   ${sub}\n`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    if (args.list) {
      await listCompanies(prisma);
      return;
    }

    if (!args.adminEmail && !args.companyId && !args.companyName) {
      console.error(
        'ERROR: provide one of --admin-email, --company-id, or --company-name (or use --list).',
      );
      process.exit(1);
    }

    // Resolve the company
    let companyId = args.companyId;

    if (!companyId && args.adminEmail) {
      const user = await prisma.user.findUnique({
        where: { email: args.adminEmail },
        select: { companyId: true, company: { select: { name: true } } },
      });
      if (!user) {
        console.error(`ERROR: no user found with email "${args.adminEmail}".`);
        process.exit(1);
      }
      companyId = user.companyId;
      console.log(`Resolved company "${user.company.name}" via ${args.adminEmail}.`);
    }

    if (!companyId && args.companyName) {
      const company = await prisma.company.findFirst({
        where: { name: { equals: args.companyName, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      if (!company) {
        console.error(`ERROR: no company found with name "${args.companyName}".`);
        process.exit(1);
      }
      companyId = company.id;
      console.log(`Resolved company "${company.name}".`);
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      console.error(`ERROR: company "${companyId}" not found.`);
      process.exit(1);
    }

    // Resolve the plan
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { name: { equals: args.plan, mode: 'insensitive' } },
    });
    if (!plan) {
      console.error(
        `ERROR: plan "${args.plan}" not found. Seed plans first via POST /api/billing/seed-plans, ` +
          `or run with --list to inspect. Available plan names are usually: Starter, Professional, Enterprise.`,
      );
      process.exit(1);
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + args.months);

    const companyPlanType = PLAN_TO_PLAN_TYPE[plan.name] ?? PlanType.PROFESSIONAL;

    console.log('\nAbout to grant subscription:');
    console.log(`  company:      ${company.name} (${company.id})`);
    console.log(`  plan:         ${plan.name} (${plan.id})`);
    console.log(`  status:       ${SubscriptionStatus.ACTIVE}`);
    console.log(`  period:       ${now.toISOString().slice(0, 10)} -> ${periodEnd.toISOString().slice(0, 10)} (${args.months} months)`);
    console.log(`  company.plan: ${companyPlanType}`);

    if (args.dryRun) {
      console.log('\n[dry-run] No changes written.');
      return;
    }

    await prisma.$transaction([
      prisma.subscription.upsert({
        where: { companyId: company.id },
        create: {
          companyId: company.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt: null,
        },
        update: {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          gracePeriodEndsAt: null,
        },
      }),
      prisma.company.update({
        where: { id: company.id },
        data: { plan: companyPlanType },
      }),
    ]);

    console.log('\nDone. Active subscription granted.');
    console.log(
      'If a user already loaded the app for this company in the last 5 minutes, ' +
        'wait up to 5 minutes (cache TTL) or have them reload.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('grant-subscription failed:', err);
  process.exit(1);
});

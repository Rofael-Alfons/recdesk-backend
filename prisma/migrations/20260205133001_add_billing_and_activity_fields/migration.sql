/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `companies` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `companyId` to the `email_templates` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('CV_PROCESSED', 'AI_PARSING_CALL', 'AI_SCORING_CALL', 'EMAIL_SENT', 'EMAIL_IMPORTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('EMAIL_IMPORT_COMPLETE', 'CV_PROCESSING_COMPLETE', 'BULK_UPLOAD_COMPLETE', 'USAGE_WARNING_80', 'USAGE_WARNING_90', 'USAGE_LIMIT_REACHED', 'TRIAL_EXPIRING_SOON', 'TRIAL_EXPIRING_TOMORROW', 'TRIAL_EXPIRED', 'SUBSCRIPTION_EXPIRED', 'PAYMENT_FAILED_WARNING');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "email_imports" ADD COLUMN     "skipReason" TEXT;

-- AlterTable
ALTER TABLE "email_templates" ADD COLUMN     "companyId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stripePriceId" TEXT,
    "monthlyPrice" INTEGER NOT NULL,
    "annualPrice" INTEGER,
    "cvLimit" INTEGER NOT NULL,
    "userLimit" INTEGER NOT NULL,
    "aiCallLimit" INTEGER NOT NULL DEFAULT -1,
    "emailSentLimit" INTEGER NOT NULL DEFAULT -1,
    "emailImportLimit" INTEGER NOT NULL DEFAULT -1,
    "features" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "type" "UsageType" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "amountDue" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "InvoiceStatus" NOT NULL,
    "invoicePdf" TEXT,
    "hostedInvoiceUrl" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_alert_trackers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "threshold80Sent" BOOLEAN NOT NULL DEFAULT false,
    "threshold90Sent" BOOLEAN NOT NULL DEFAULT false,
    "threshold100Sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_alert_trackers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_stripePriceId_key" ON "subscription_plans"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_companyId_key" ON "subscriptions"("companyId");

-- CreateIndex
CREATE INDEX "usage_records_companyId_type_periodStart_idx" ON "usage_records"("companyId", "type", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripeInvoiceId_key" ON "invoices"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "invoices_companyId_idx" ON "invoices"("companyId");

-- CreateIndex
CREATE INDEX "notifications_companyId_isRead_createdAt_idx" ON "notifications"("companyId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "usage_alert_trackers_companyId_periodStart_key" ON "usage_alert_trackers"("companyId", "periodStart");

-- CreateIndex
CREATE INDEX "candidate_actions_candidateId_createdAt_idx" ON "candidate_actions"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "candidate_actions_userId_idx" ON "candidate_actions"("userId");

-- CreateIndex
CREATE INDEX "candidate_notes_candidateId_idx" ON "candidate_notes"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_notes_userId_idx" ON "candidate_notes"("userId");

-- CreateIndex
CREATE INDEX "candidate_stages_candidateId_idx" ON "candidate_stages"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_stages_stageId_idx" ON "candidate_stages"("stageId");

-- CreateIndex
CREATE INDEX "candidates_companyId_jobId_idx" ON "candidates"("companyId", "jobId");

-- CreateIndex
CREATE INDEX "candidates_companyId_status_idx" ON "candidates"("companyId", "status");

-- CreateIndex
CREATE INDEX "candidates_companyId_source_idx" ON "candidates"("companyId", "source");

-- CreateIndex
CREATE INDEX "candidates_jobId_idx" ON "candidates"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_stripeCustomerId_key" ON "companies"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "email_imports_status_createdAt_idx" ON "email_imports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "email_imports_emailConnectionId_status_idx" ON "email_imports"("emailConnectionId", "status");

-- CreateIndex
CREATE INDEX "email_imports_emailConnectionId_idx" ON "email_imports"("emailConnectionId");

-- CreateIndex
CREATE INDEX "email_templates_companyId_idx" ON "email_templates"("companyId");

-- CreateIndex
CREATE INDEX "email_templates_companyId_type_idx" ON "email_templates"("companyId", "type");

-- CreateIndex
CREATE INDEX "emails_sent_candidateId_idx" ON "emails_sent"("candidateId");

-- CreateIndex
CREATE INDEX "emails_sent_sentById_idx" ON "emails_sent"("sentById");

-- CreateIndex
CREATE INDEX "jobs_companyId_status_idx" ON "jobs"("companyId", "status");

-- CreateIndex
CREATE INDEX "jobs_companyId_createdAt_idx" ON "jobs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "pipeline_stages_jobId_orderIndex_idx" ON "pipeline_stages"("jobId", "orderIndex");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('NOT_QUALIFIED', 'INSUFFICIENT_EXPERIENCE', 'SKILLS_MISMATCH', 'SALARY_EXPECTATIONS', 'LOCATION', 'POSITION_FILLED', 'NO_RESPONSE', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduledEmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SAVED_VIEW_MATCH';

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "rejectionNote" TEXT,
ADD COLUMN     "rejectionReason" "RejectionReason";

-- CreateTable
CREATE TABLE "saved_view_alerts" (
    "id" TEXT NOT NULL,
    "emailDigest" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDigestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,

    CONSTRAINT "saved_view_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_emails" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "subjectOverride" TEXT,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledEmailStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "templateId" TEXT,
    "createdById" TEXT,
    "cancelledById" TEXT,

    CONSTRAINT "scheduled_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_view_alerts_viewId_idx" ON "saved_view_alerts"("viewId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_view_alerts_userId_viewId_key" ON "saved_view_alerts"("userId", "viewId");

-- CreateIndex
CREATE INDEX "scheduled_emails_status_sendAt_idx" ON "scheduled_emails"("status", "sendAt");

-- CreateIndex
CREATE INDEX "scheduled_emails_candidateId_status_idx" ON "scheduled_emails"("candidateId", "status");

-- CreateIndex
CREATE INDEX "scheduled_emails_companyId_status_idx" ON "scheduled_emails"("companyId", "status");

-- AddForeignKey
ALTER TABLE "saved_view_alerts" ADD CONSTRAINT "saved_view_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view_alerts" ADD CONSTRAINT "saved_view_alerts_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "saved_candidate_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


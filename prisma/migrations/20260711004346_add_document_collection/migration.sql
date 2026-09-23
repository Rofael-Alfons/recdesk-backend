-- CreateEnum
CREATE TYPE "DocumentRequestStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETE', 'EXPIRED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_UPLOADED';

-- CreateTable
CREATE TABLE "document_requests" (
    "id" TEXT NOT NULL,
    "status" "DocumentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "retentionExpiresAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "completedAt" TIMESTAMP(3),
    "lastNudgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_checklist_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "document_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_uploads" (
    "id" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checklistItemId" TEXT NOT NULL,

    CONSTRAINT "document_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_requests_token_key" ON "document_requests"("token");

-- CreateIndex
CREATE INDEX "document_requests_companyId_status_idx" ON "document_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "document_requests_candidateId_idx" ON "document_requests"("candidateId");

-- CreateIndex
CREATE INDEX "document_checklist_items_requestId_orderIndex_idx" ON "document_checklist_items"("requestId", "orderIndex");

-- CreateIndex
CREATE INDEX "document_uploads_checklistItemId_idx" ON "document_uploads"("checklistItemId");

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_checklist_items" ADD CONSTRAINT "document_checklist_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "document_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "document_checklist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

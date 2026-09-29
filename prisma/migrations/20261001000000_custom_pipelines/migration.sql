-- CreateEnum
CREATE TYPE "StageCategory" AS ENUM ('NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED');

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "currentStageId" TEXT;

-- AlterTable
ALTER TABLE "pipeline_stages" ADD COLUMN     "category" "StageCategory";

-- CreateTable
CREATE TABLE "pipeline_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "stages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "pipeline_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_templates_companyId_idx" ON "pipeline_templates"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_templates_companyId_name_key" ON "pipeline_templates"("companyId", "name");

-- CreateIndex
CREATE INDEX "candidates_currentStageId_idx" ON "candidates"("currentStageId");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_templates" ADD CONSTRAINT "pipeline_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


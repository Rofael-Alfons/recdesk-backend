-- CreateEnum
CREATE TYPE "CandidateGender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "gender" "CandidateGender",
ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "collectGenderData" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "candidates_companyId_country_idx" ON "candidates"("companyId", "country");

-- CreateIndex
CREATE INDEX "candidates_companyId_region_idx" ON "candidates"("companyId", "region");

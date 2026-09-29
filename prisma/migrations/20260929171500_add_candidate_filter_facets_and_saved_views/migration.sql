-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('HIGH_SCHOOL', 'DIPLOMA', 'BACHELOR', 'MASTER', 'DOCTORATE');

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "currentCompany" TEXT,
ADD COLUMN     "currentTitle" TEXT,
ADD COLUMN     "educationLevel" "EducationLevel",
ADD COLUMN     "facetsDerivedAt" TIMESTAMP(3),
ADD COLUMN     "languageNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "skillsNormalized" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totalExperienceYears" DOUBLE PRECISION,
ADD COLUMN     "university" TEXT;

-- CreateTable
CREATE TABLE "saved_candidate_views" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "saved_candidate_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_candidate_views_companyId_isShared_idx" ON "saved_candidate_views"("companyId", "isShared");

-- CreateIndex
CREATE UNIQUE INDEX "saved_candidate_views_userId_name_key" ON "saved_candidate_views"("userId", "name");

-- CreateIndex
CREATE INDEX "candidates_companyId_city_idx" ON "candidates"("companyId", "city");

-- CreateIndex
CREATE INDEX "candidates_companyId_totalExperienceYears_idx" ON "candidates"("companyId", "totalExperienceYears");

-- CreateIndex
CREATE INDEX "candidates_companyId_educationLevel_idx" ON "candidates"("companyId", "educationLevel");

-- CreateIndex
CREATE INDEX "candidates_companyId_updatedAt_idx" ON "candidates"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "candidates_skillsNormalized_idx" ON "candidates" USING GIN ("skillsNormalized");

-- CreateIndex
CREATE INDEX "candidates_languageNames_idx" ON "candidates" USING GIN ("languageNames");

-- CreateIndex
CREATE INDEX "candidates_tags_idx" ON "candidates" USING GIN ("tags");

-- AddForeignKey
ALTER TABLE "saved_candidate_views" ADD CONSTRAINT "saved_candidate_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_candidate_views" ADD CONSTRAINT "saved_candidate_views_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


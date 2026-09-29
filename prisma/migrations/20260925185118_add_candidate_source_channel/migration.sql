-- CreateEnum
CREATE TYPE "CandidateSourceChannel" AS ENUM ('EMAIL_INBOX', 'BULK_UPLOAD', 'REFERRAL', 'WUZZUF', 'TANQEEB', 'CAREER_FAIR', 'LINKEDIN', 'DIRECT_APPLY', 'OTHER');

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "sourceChannel" "CandidateSourceChannel",
ADD COLUMN     "sourceDetail" TEXT;

-- CreateIndex
CREATE INDEX "candidates_companyId_sourceChannel_idx" ON "candidates"("companyId", "sourceChannel");

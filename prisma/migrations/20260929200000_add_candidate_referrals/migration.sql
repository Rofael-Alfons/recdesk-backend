-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredByUserId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "referralCode" TEXT;

-- CreateIndex
CREATE INDEX "candidates_companyId_referredByUserId_idx" ON "candidates"("companyId", "referredByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

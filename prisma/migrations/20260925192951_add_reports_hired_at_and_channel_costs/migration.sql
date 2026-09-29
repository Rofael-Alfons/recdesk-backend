-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "hiredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "channel_costs" (
    "id" TEXT NOT NULL,
    "channel" "CandidateSourceChannel" NOT NULL,
    "monthlyCost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "channel_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_costs_companyId_channel_key" ON "channel_costs"("companyId", "channel");

-- CreateIndex
CREATE INDEX "candidates_companyId_hiredAt_idx" ON "candidates"("companyId", "hiredAt");

-- AddForeignKey
ALTER TABLE "channel_costs" ADD CONSTRAINT "channel_costs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

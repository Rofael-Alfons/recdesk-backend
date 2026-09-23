-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('ADVANCE', 'HOLD', 'REJECT');

-- CreateTable
CREATE TABLE "interview_evaluations" (
    "id" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "criteria" JSONB,
    "notes" TEXT,
    "recommendation" "InterviewRecommendation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,

    CONSTRAINT "interview_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_evaluations_candidateId_jobId_idx" ON "interview_evaluations"("candidateId", "jobId");

-- CreateIndex
CREATE INDEX "interview_evaluations_evaluatorId_idx" ON "interview_evaluations"("evaluatorId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_evaluations_candidateId_jobId_evaluatorId_key" ON "interview_evaluations"("candidateId", "jobId", "evaluatorId");

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

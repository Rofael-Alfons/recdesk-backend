-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEWER_ASSIGNED';

-- CreateEnum
CREATE TYPE "FeedbackRecommendation" AS ENUM ('STRONG_YES', 'YES', 'NO', 'STRONG_NO');

-- CreateTable
CREATE TABLE "interview_feedback" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "notes" TEXT,
    "recommendation" "FeedbackRecommendation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,

    CONSTRAINT "interview_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_stage_interviewers" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candidateId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,

    CONSTRAINT "candidate_stage_interviewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_feedback_candidateId_idx" ON "interview_feedback"("candidateId");

-- CreateIndex
CREATE INDEX "interview_feedback_jobId_idx" ON "interview_feedback"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_feedback_candidateId_stageId_interviewerId_key" ON "interview_feedback"("candidateId", "stageId", "interviewerId");

-- CreateIndex
CREATE INDEX "candidate_stage_interviewers_candidateId_idx" ON "candidate_stage_interviewers"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_stage_interviewers_userId_idx" ON "candidate_stage_interviewers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_stage_interviewers_candidateId_stageId_userId_key" ON "candidate_stage_interviewers"("candidateId", "stageId", "userId");

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_stage_interviewers" ADD CONSTRAINT "candidate_stage_interviewers_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_stage_interviewers" ADD CONSTRAINT "candidate_stage_interviewers_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_stage_interviewers" ADD CONSTRAINT "candidate_stage_interviewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_stage_interviewers" ADD CONSTRAINT "candidate_stage_interviewers_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

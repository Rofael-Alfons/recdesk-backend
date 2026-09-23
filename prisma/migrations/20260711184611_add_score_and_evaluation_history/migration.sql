-- CreateTable
CREATE TABLE "candidate_score_history" (
    "id" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "skillsMatchScore" INTEGER,
    "experienceScore" INTEGER,
    "educationScore" INTEGER,
    "growthScore" INTEGER,
    "bonusScore" INTEGER,
    "scoreExplanation" JSONB,
    "recommendation" TEXT,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "source" TEXT,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,

    CONSTRAINT "candidate_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_evaluation_history" (
    "id" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "criteria" JSONB,
    "notes" TEXT,
    "recommendation" "InterviewRecommendation" NOT NULL,
    "versionCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interviewEvaluationId" TEXT NOT NULL,
    "editedById" TEXT,

    CONSTRAINT "interview_evaluation_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_score_history_candidateId_jobId_scoredAt_idx" ON "candidate_score_history"("candidateId", "jobId", "scoredAt");

-- CreateIndex
CREATE INDEX "interview_evaluation_history_interviewEvaluationId_createdA_idx" ON "interview_evaluation_history"("interviewEvaluationId", "createdAt");

-- AddForeignKey
ALTER TABLE "candidate_score_history" ADD CONSTRAINT "candidate_score_history_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_score_history" ADD CONSTRAINT "candidate_score_history_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluation_history" ADD CONSTRAINT "interview_evaluation_history_interviewEvaluationId_fkey" FOREIGN KEY ("interviewEvaluationId") REFERENCES "interview_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluation_history" ADD CONSTRAINT "interview_evaluation_history_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

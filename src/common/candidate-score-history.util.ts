import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordCandidateScoreHistoryParams {
  candidateId: string;
  jobId: string;
  overallScore: number;
  skillsMatchScore?: number | null;
  experienceScore?: number | null;
  educationScore?: number | null;
  growthScore?: number | null;
  bonusScore?: number | null;
  scoreExplanation?: Prisma.InputJsonValue | null;
  recommendation?: string | null;
  algorithmVersion?: string;
  // Which pipeline produced this scoring event, for debugging only.
  source: string;
}

// Appends one row to the candidate_score_history audit log. Called
// alongside (never instead of) the existing CandidateScore upsert/create at
// each of its call sites, so the "current score" semantics of
// CandidateScore are entirely unchanged.
export async function recordCandidateScoreHistory(
  prisma: PrismaService,
  params: RecordCandidateScoreHistoryParams,
): Promise<void> {
  await prisma.candidateScoreHistory.create({
    data: {
      candidateId: params.candidateId,
      jobId: params.jobId,
      overallScore: params.overallScore,
      skillsMatchScore: params.skillsMatchScore ?? undefined,
      experienceScore: params.experienceScore ?? undefined,
      educationScore: params.educationScore ?? undefined,
      growthScore: params.growthScore ?? undefined,
      bonusScore: params.bonusScore ?? undefined,
      scoreExplanation: params.scoreExplanation ?? undefined,
      recommendation: params.recommendation ?? undefined,
      algorithmVersion: params.algorithmVersion ?? undefined,
      source: params.source,
    },
  });
}

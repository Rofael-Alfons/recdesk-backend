import { recordCandidateScoreHistory } from './candidate-score-history.util';

describe('recordCandidateScoreHistory', () => {
  it('inserts a candidate_score_history row with the given fields and source', async () => {
    const prisma: any = { candidateScoreHistory: { create: jest.fn() } };

    await recordCandidateScoreHistory(prisma, {
      candidateId: 'cand-1',
      jobId: 'job-1',
      overallScore: 82,
      skillsMatchScore: 90,
      experienceScore: null,
      scoreExplanation: { skillsMatch: 'Good' },
      recommendation: 'Recommended',
      source: 'queue_scoring',
    });

    expect(prisma.candidateScoreHistory.create).toHaveBeenCalledWith({
      data: {
        candidateId: 'cand-1',
        jobId: 'job-1',
        overallScore: 82,
        skillsMatchScore: 90,
        experienceScore: undefined,
        educationScore: undefined,
        growthScore: undefined,
        bonusScore: undefined,
        scoreExplanation: { skillsMatch: 'Good' },
        recommendation: 'Recommended',
        algorithmVersion: undefined,
        source: 'queue_scoring',
      },
    });
  });
});

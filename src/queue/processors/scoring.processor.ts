import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService, ParsedCVData } from '../../ai/ai.service';
import { QUEUE_NAMES } from '../queue.constants';
import type { ScoringJobData } from '../queue.service';

@Processor(QUEUE_NAMES.SCORING)
export class ScoringProcessor {
  private readonly logger = new Logger(ScoringProcessor.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) { }

  @Process('score-candidate')
  async scoreCandidate(job: Job<ScoringJobData>) {
    const { candidateId, jobId } = job.data;

    this.logger.log(`Scoring candidate ${candidateId} for job ${jobId}`);

    try {
      // Get candidate with parsed data
      const candidate = await this.prisma.candidate.findUnique({
        where: { id: candidateId },
      });

      if (!candidate) {
        throw new Error(`Candidate ${candidateId} not found`);
      }

      // Get job requirements
      const targetJob = await this.prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!targetJob) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Prepare parsed data from candidate
      const parsedData: ParsedCVData = {
        personalInfo: {
          fullName: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          location: candidate.location,
          linkedinUrl: candidate.linkedinUrl,
          githubUrl: candidate.githubUrl,
          portfolioUrl: candidate.portfolioUrl,
        },
        education: (candidate.education as ParsedCVData['education']) || [],
        experience: (candidate.experience as ParsedCVData['experience']) || [],
        skills: (candidate.skills as string[]) || [],
        projects: (candidate.projects as ParsedCVData['projects']) || [],
        certifications: (candidate.certifications as ParsedCVData['certifications']) || [],
        languages: (candidate.languages as ParsedCVData['languages']) || [],
        summary: null,
      };

      const requirements = {
        title: targetJob.title,
        requiredSkills: targetJob.requiredSkills,
        preferredSkills: targetJob.preferredSkills,
        experienceLevel: targetJob.experienceLevel,
        requirements: (targetJob.requirements as Record<string, any>) || {},
      };

      // Score with AI
      const scoreResult = await this.aiService.scoreCandidate(parsedData, requirements);

      // Upsert the score
      await this.prisma.candidateScore.upsert({
        where: {
          candidateId_jobId: {
            candidateId,
            jobId,
          },
        },
        update: {
          overallScore: scoreResult.overallScore,
          skillsMatchScore: scoreResult.skillsMatchScore,
          experienceScore: scoreResult.experienceScore,
          educationScore: scoreResult.educationScore,
          growthScore: scoreResult.growthScore,
          bonusScore: scoreResult.bonusScore,
          scoreExplanation: scoreResult.scoreExplanation || undefined,
          recommendation: scoreResult.recommendation,
          scoredAt: new Date(),
        },
        create: {
          candidateId,
          jobId,
          overallScore: scoreResult.overallScore,
          skillsMatchScore: scoreResult.skillsMatchScore,
          experienceScore: scoreResult.experienceScore,
          educationScore: scoreResult.educationScore,
          growthScore: scoreResult.growthScore,
          bonusScore: scoreResult.bonusScore,
          scoreExplanation: scoreResult.scoreExplanation || undefined,
          recommendation: scoreResult.recommendation,
        },
      });

      // Update overall score on candidate if this is their assigned job
      // Note: aiSummary is set during initial CV parsing, not overwritten here
      if (candidate.jobId === jobId) {
        await this.prisma.candidate.update({
          where: { id: candidateId },
          data: {
            overallScore: scoreResult.overallScore,
            scoreBreakdown: scoreResult.scoreExplanation || undefined,
          },
        });
      }

      return {
        success: true,
        candidateId,
        jobId,
        score: scoreResult.overallScore,
      };
    } catch (error) {
      this.logger.error(
        `Failed to score candidate ${candidateId} for job ${jobId}:`,
        error,
      );
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job<ScoringJobData>, result: any) {
    this.logger.log(
      `Completed scoring job ${job.id}: candidate ${job.data.candidateId} scored ${result?.score}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: Job<ScoringJobData>, error: Error) {
    this.logger.error(
      `Failed scoring job ${job.id} for candidate ${job.data.candidateId}: ${error.message}`,
    );
  }
}

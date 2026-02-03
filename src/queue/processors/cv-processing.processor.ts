import {
  Processor,
  Process,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { FileProcessingService } from '../../file-processing/file-processing.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { BillingService } from '../../billing/billing.service';
import { QUEUE_NAMES } from '../queue.constants';
import type { CvProcessingJobData } from '../queue.service';
import { NotificationType, UsageType } from '@prisma/client';

@Processor(QUEUE_NAMES.CV_PROCESSING)
export class CvProcessingProcessor {
  private readonly logger = new Logger(CvProcessingProcessor.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private fileProcessingService: FileProcessingService,
    private notificationsService: NotificationsService,
    private billingService: BillingService,
  ) {}

  @Process('process-cv')
  async processCv(job: Job<CvProcessingJobData>) {
    const { candidateId, jobId } = job.data;

    this.logger.log(`Processing CV for candidate ${candidateId}`);

    try {
      // Get the candidate
      const candidate = await this.prisma.candidate.findUnique({
        where: { id: candidateId },
        include: { job: true },
      });

      if (!candidate) {
        throw new Error(`Candidate ${candidateId} not found`);
      }

      // Extract text from CV if not already done
      let cvText = candidate.cvText;
      if (!cvText && candidate.cvFileUrl) {
        this.logger.log(`Extracting text from CV: ${candidate.cvFileName}`);

        const extractionResult =
          await this.fileProcessingService.extractTextFromFile(
            candidate.cvFileUrl,
          );

        cvText = extractionResult.text;

        await this.prisma.candidate.update({
          where: { id: candidateId },
          data: {
            cvText,
            extractionConfidence: extractionResult.confidence,
          },
        });
      }

      // Parse CV with AI
      if (cvText) {
        this.logger.log(`Parsing CV with AI for candidate ${candidateId}`);
        const parsed = await this.aiService.parseCV(
          cvText,
          candidate.cvFileName || null,
        );

        // Track AI parsing usage
        await this.billingService.trackUsage(
          candidate.companyId,
          UsageType.AI_PARSING_CALL,
        );

        await this.prisma.candidate.update({
          where: { id: candidateId },
          data: {
            fullName: parsed.personalInfo?.fullName || candidate.fullName,
            email: parsed.personalInfo?.email || candidate.email,
            phone: parsed.personalInfo?.phone || candidate.phone,
            location: parsed.personalInfo?.location || candidate.location,
            linkedinUrl:
              parsed.personalInfo?.linkedinUrl || candidate.linkedinUrl,
            githubUrl: parsed.personalInfo?.githubUrl || candidate.githubUrl,
            education: parsed.education || undefined,
            experience: parsed.experience || undefined,
            skills: parsed.skills || undefined,
            projects: parsed.projects || undefined,
            certifications: parsed.certifications || undefined,
            languages: parsed.languages || undefined,
            aiSummary: parsed.summary || undefined,
          },
        });

        // Score candidate if job is assigned
        const targetJobId = jobId || candidate.jobId;
        if (targetJobId) {
          this.logger.log(
            `Scoring candidate ${candidateId} for job ${targetJobId}`,
          );
          await this.scoreCandidate(
            candidateId,
            targetJobId,
            parsed,
            candidate.companyId,
          );
        }
      }

      return { success: true, candidateId };
    } catch (error) {
      this.logger.error(
        `Failed to process CV for candidate ${candidateId}:`,
        error,
      );
      throw error;
    }
  }

  private async scoreCandidate(
    candidateId: string,
    jobId: string,
    parsedData: any,
    companyId: string,
  ) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      this.logger.warn(`Job ${jobId} not found for scoring`);
      return;
    }

    const requirements = {
      title: job.title,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      experienceLevel: job.experienceLevel,
      requirements: (job.requirements as Record<string, any>) || {},
    };

    const scoreResult = await this.aiService.scoreCandidate(
      parsedData,
      requirements,
    );

    // Track AI scoring usage
    await this.billingService.trackUsage(companyId, UsageType.AI_SCORING_CALL);

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

    // Update overall score on candidate (aiSummary is set during initial parsing, not overwritten here)
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        overallScore: scoreResult.overallScore,
        scoreBreakdown: scoreResult.scoreExplanation || undefined,
      },
    });
  }

  @OnQueueActive()
  onActive(job: Job<CvProcessingJobData>) {
    this.logger.log(
      `Processing job ${job.id} for candidate ${job.data.candidateId}`,
    );
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<CvProcessingJobData>) {
    this.logger.log(
      `Completed job ${job.id} for candidate ${job.data.candidateId}`,
    );

    // Get candidate to find companyId and name
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: job.data.candidateId },
      select: { companyId: true, fullName: true },
    });

    if (candidate) {
      // Track CV processed usage
      await this.billingService.trackUsage(
        candidate.companyId,
        UsageType.CV_PROCESSED,
      );

      // Create notification for CV processing completion
      await this.notificationsService.createNotification({
        type: NotificationType.CV_PROCESSING_COMPLETE,
        companyId: candidate.companyId,
        title: 'CV Processed',
        message: `CV for ${candidate.fullName || 'candidate'} has been processed and scored.`,
        metadata: { candidateId: job.data.candidateId, jobId: job.data.jobId },
      });

      // Check usage limits and send notifications if thresholds crossed
      await this.notificationsService.checkAndNotifyUsageLimits(
        candidate.companyId,
      );
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<CvProcessingJobData>, error: Error) {
    this.logger.error(
      `Failed job ${job.id} for candidate ${job.data.candidateId}: ${error.message}`,
    );
  }
}

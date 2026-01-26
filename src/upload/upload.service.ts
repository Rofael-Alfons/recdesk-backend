import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FileProcessingService } from '../file-processing/file-processing.service';
import { AiService } from '../ai/ai.service';
import { BillingService } from '../billing/billing.service';
import { UsageType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface UploadResult {
  fileName: string;
  status: 'success' | 'failed' | 'processing';
  candidateId?: string;
  error?: string;
}

export interface BulkUploadResult {
  totalFiles: number;
  successful: number;
  failed: number;
  results: UploadResult[];
}

@Injectable()
export class UploadService {
  private uploadDir: string;

  constructor(
    private prisma: PrismaService,
    private fileProcessingService: FileProcessingService,
    private aiService: AiService,
    private configService: ConfigService,
    private billingService: BillingService,
  ) {
    // For local development, store files in a local directory
    // In production, this would be replaced with S3
    this.uploadDir = path.join(process.cwd(), 'uploads', 'cvs');
    this.ensureUploadDir();
  }

  private async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create upload directory:', error);
    }
  }

  async uploadBulkCVs(
    files: Express.Multer.File[],
    companyId: string,
    jobId?: string,
  ): Promise<BulkUploadResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    if (files.length > 200) {
      throw new BadRequestException('Maximum 200 files per upload');
    }

    // Verify job belongs to company if provided
    if (jobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: jobId, companyId },
      });
      if (!job) {
        throw new BadRequestException('Job not found');
      }
    }

    const results: UploadResult[] = [];
    let successful = 0;
    let failed = 0;

    // Process files in batches of 10 for better performance
    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((file) => this.processFile(file, companyId, jobId)),
      );

      for (const result of batchResults) {
        results.push(result);
        if (result.status === 'success') {
          successful++;
        } else {
          failed++;
        }
      }
    }

    return {
      totalFiles: files.length,
      successful,
      failed,
      results,
    };
  }

  private async processFile(
    file: Express.Multer.File,
    companyId: string,
    jobId?: string,
  ): Promise<UploadResult> {
    const fileName = file.originalname;

    try {
      // Validate file
      const validation = this.fileProcessingService.validateFile(file);
      if (!validation.valid) {
        return { fileName, status: 'failed', error: validation.error };
      }

      // Save file locally (in production, upload to S3)
      const fileId = uuidv4();
      const ext = path.extname(fileName);
      const savedFileName = `${fileId}${ext}`;
      const filePath = path.join(this.uploadDir, savedFileName);

      await fs.writeFile(filePath, file.buffer);

      // Extract text from CV
      const extraction = await this.fileProcessingService.extractText(
        file.buffer,
        fileName,
      );

      if (!extraction.text || extraction.confidence < 30) {
        return {
          fileName,
          status: 'failed',
          error: 'Could not extract text from file',
        };
      }

      // Parse CV using AI
      let parsedData;
      let aiSummary = null;

      try {
        parsedData = await this.aiService.parseCV(extraction.text, fileName);
        aiSummary = parsedData.summary || null;
        // Track AI parsing usage
        await this.billingService.trackUsage(companyId, UsageType.AI_PARSING_CALL);
      } catch (error) {
        console.error('AI parsing error:', error);
        // Continue with basic data extraction from filename
        parsedData = this.extractBasicDataFromFilename(fileName);
      }

      // Check for duplicate by email
      if (parsedData.personalInfo?.email) {
        const existing = await this.prisma.candidate.findFirst({
          where: {
            companyId,
            email: parsedData.personalInfo.email.toLowerCase(),
          },
        });

        if (existing) {
          return {
            fileName,
            status: 'failed',
            error: `Duplicate: candidate with email ${parsedData.personalInfo.email} already exists`,
          };
        }
      }

      // Create candidate record
      const candidate = await this.prisma.candidate.create({
        data: {
          fullName: parsedData.personalInfo?.fullName || this.extractNameFromFilename(fileName),
          email: parsedData.personalInfo?.email?.toLowerCase(),
          phone: parsedData.personalInfo?.phone,
          location: parsedData.personalInfo?.location,
          linkedinUrl: parsedData.personalInfo?.linkedinUrl,
          githubUrl: parsedData.personalInfo?.githubUrl,
          portfolioUrl: parsedData.personalInfo?.portfolioUrl,
          source: 'UPLOAD',
          status: 'NEW',
          cvFileUrl: `/uploads/cvs/${savedFileName}`, // Local path for now
          cvFileName: fileName,
          cvText: extraction.text,
          extractionConfidence: extraction.confidence,
          education: parsedData.education || [],
          experience: parsedData.experience || [],
          skills: parsedData.skills || [],
          projects: parsedData.projects || [],
          certifications: parsedData.certifications || [],
          languages: parsedData.languages || [],
          aiSummary,
          companyId,
          jobId,
        },
      });

      // Track CV processed usage
      await this.billingService.trackUsage(companyId, UsageType.CV_PROCESSED);

      // If job is assigned, calculate score
      if (jobId) {
        await this.scoreCandidate(candidate.id, jobId, companyId);
      }

      return {
        fileName,
        status: 'success',
        candidateId: candidate.id,
      };
    } catch (error) {
      console.error(`Error processing file ${fileName}:`, error);
      return {
        fileName,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async scoreCandidate(candidateId: string, jobId: string, companyId: string) {
    try {
      const candidate = await this.prisma.candidate.findUnique({
        where: { id: candidateId },
      });

      const job = await this.prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!candidate || !job) return;

      const parsedCV = {
        personalInfo: {
          fullName: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          location: candidate.location,
          linkedinUrl: candidate.linkedinUrl,
          githubUrl: candidate.githubUrl,
          portfolioUrl: candidate.portfolioUrl,
        },
        education: candidate.education as any[] || [],
        experience: candidate.experience as any[] || [],
        skills: candidate.skills as any || [],
        projects: candidate.projects as any[] || [],
        certifications: candidate.certifications as any[] || [],
        languages: candidate.languages as any[] || [],
        summary: candidate.aiSummary,
      };

      const scoreResult = await this.aiService.scoreCandidate(parsedCV, {
        title: job.title,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        experienceLevel: job.experienceLevel,
        requirements: job.requirements as Record<string, any> || {},
      });

      // Track AI scoring usage
      await this.billingService.trackUsage(companyId, UsageType.AI_SCORING_CALL);

      // Save score
      await this.prisma.candidateScore.create({
        data: {
          candidateId,
          jobId,
          overallScore: scoreResult.overallScore,
          skillsMatchScore: scoreResult.skillsMatchScore,
          experienceScore: scoreResult.experienceScore,
          educationScore: scoreResult.educationScore,
          growthScore: scoreResult.growthScore,
          bonusScore: scoreResult.bonusScore,
          recommendation: scoreResult.recommendation,
          scoreExplanation: scoreResult.scoreExplanation,
        },
      });

      // Update candidate overall score
      await this.prisma.candidate.update({
        where: { id: candidateId },
        data: {
          overallScore: scoreResult.overallScore,
          scoreBreakdown: scoreResult.scoreExplanation,
        },
      });
    } catch (error) {
      console.error('Scoring error:', error);
      // Don't fail the upload if scoring fails
    }
  }

  private extractNameFromFilename(fileName: string): string {
    // Remove extension and common CV indicators
    let name = path.basename(fileName, path.extname(fileName));
    name = name
      .replace(/[-_]/g, ' ')
      .replace(/cv|resume|curriculum|vitae/gi, '')
      .replace(/\d+/g, '')
      .trim();

    // Capitalize words
    return name
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ') || 'Unknown Candidate';
  }

  private extractBasicDataFromFilename(fileName: string) {
    return {
      personalInfo: {
        fullName: this.extractNameFromFilename(fileName),
        email: null,
        phone: null,
        location: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
      },
      education: [],
      experience: [],
      skills: [],
      projects: [],
      certifications: [],
      languages: [],
      summary: null,
    };
  }
}

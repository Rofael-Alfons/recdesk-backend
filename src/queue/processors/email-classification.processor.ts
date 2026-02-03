import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { QUEUE_NAMES } from '../queue.constants';
import type { EmailClassificationJobData } from '../queue.service';

const AUTO_IMPORT_CONFIDENCE_THRESHOLD = 80;

@Processor(QUEUE_NAMES.EMAIL_CLASSIFICATION)
export class EmailClassificationProcessor {
  private readonly logger = new Logger(EmailClassificationProcessor.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  @Process('classify-email')
  async classifyEmail(job: Job<EmailClassificationJobData>) {
    const {
      emailConnectionId,
      messageId,
      subject,
      senderEmail,
      senderName,
      bodyText,
    } = job.data;

    this.logger.log(`Classifying email ${messageId}`);

    try {
      // Check if already processed
      const existingImport = await this.prisma.emailImport.findUnique({
        where: { messageId },
      });

      if (existingImport) {
        this.logger.log(`Email ${messageId} already processed, skipping`);
        return { skipped: true, messageId };
      }

      // Get email connection details
      const connection = await this.prisma.emailConnection.findUnique({
        where: { id: emailConnectionId },
        include: { company: true },
      });

      if (!connection) {
        throw new Error(`Email connection ${emailConnectionId} not found`);
      }

      // Classify the email using AI
      const classification = await this.aiService.classifyEmail(
        subject,
        bodyText,
        senderEmail,
        senderName || null,
      );

      // Create email import record
      const emailImport = await this.prisma.emailImport.create({
        data: {
          messageId,
          subject,
          senderEmail,
          senderName,
          receivedAt: new Date(),
          isJobApplication: classification.isJobApplication,
          confidence: classification.confidence,
          detectedPosition: classification.detectedPosition,
          bodyText,
          status: 'PENDING',
          emailConnectionId,
        },
      });

      // If high confidence job application and auto-import is enabled
      if (
        connection.autoImport &&
        classification.isJobApplication &&
        classification.confidence >= AUTO_IMPORT_CONFIDENCE_THRESHOLD
      ) {
        this.logger.log(
          `Email ${messageId} classified as job application (${classification.confidence}% confidence), auto-importing`,
        );

        // Update status to processing
        await this.prisma.emailImport.update({
          where: { id: emailImport.id },
          data: { status: 'PROCESSING' },
        });

        // TODO: Extract attachments and create candidate
        // This will be implemented when S3 integration is complete

        await this.prisma.emailImport.update({
          where: { id: emailImport.id },
          data: {
            status: 'IMPORTED',
            processedAt: new Date(),
          },
        });
      } else if (!classification.isJobApplication) {
        await this.prisma.emailImport.update({
          where: { id: emailImport.id },
          data: {
            status: 'SKIPPED',
            processedAt: new Date(),
          },
        });
      }

      return {
        success: true,
        messageId,
        isJobApplication: classification.isJobApplication,
        confidence: classification.confidence,
      };
    } catch (error) {
      this.logger.error(`Failed to classify email ${messageId}:`, error);
      throw error;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<EmailClassificationJobData>, error: Error) {
    this.logger.error(
      `Failed job ${job.id} for email ${job.data.messageId}: ${error.message}`,
    );
  }
}

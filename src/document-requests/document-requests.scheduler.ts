import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocumentRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentRequestsScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(DocumentRequestsScheduler.name);
  private isRunning = false;
  private isShuttingDown = false;

  constructor(private prisma: PrismaService) {}

  onModuleDestroy() {
    this.isShuttingDown = true;
  }

  /** Hourly: expire upload links whose expiresAt has passed. */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiry() {
    if (this.isShuttingDown || this.isRunning) return;
    this.isRunning = true;
    try {
      const result = await this.prisma.documentRequest.updateMany({
        where: {
          status: { in: [DocumentRequestStatus.PENDING, DocumentRequestStatus.PARTIAL] },
          expiresAt: { lt: new Date() },
        },
        data: { status: DocumentRequestStatus.EXPIRED },
      });
      if (result.count) {
        this.logger.log(`Expired ${result.count} stale document request(s)`);
      }
    } catch (error) {
      this.logger.error('Document request expiry job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }
}

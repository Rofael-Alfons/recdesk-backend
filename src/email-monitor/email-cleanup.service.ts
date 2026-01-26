import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailCleanupService {
  private readonly logger = new Logger(EmailCleanupService.name);
  private readonly retentionDays = 30;

  constructor(private prisma: PrismaService) {}

  /**
   * Clean up old SKIPPED email records daily at 3 AM
   * These records don't contain body content and are kept only for audit purposes
   * After 30 days, they're no longer needed
   */
  @Cron('0 3 * * *') // Daily at 3 AM
  async cleanupOldSkippedEmails() {
    this.logger.log('Starting cleanup of old skipped email records...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    try {
      const result = await this.prisma.emailImport.deleteMany({
        where: {
          status: 'SKIPPED',
          createdAt: { lt: cutoffDate },
        },
      });

      this.logger.log(
        `Cleaned up ${result.count} old skipped email records (older than ${this.retentionDays} days)`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup old skipped emails:', error);
    }
  }
}

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

  /**
   * Safety net: purge any lingering email body content from records older than 1 hour.
   * Catches edge cases where processing was interrupted before the normal purge ran.
   */
  @Cron('0 */6 * * *')
  async purgeLingeringEmailBodies() {
    this.logger.log('Starting safety-net purge of lingering email bodies...');

    const cutoff = new Date(Date.now() - 60 * 60 * 1000);

    try {
      const result = await this.prisma.emailImport.updateMany({
        where: {
          createdAt: { lt: cutoff },
          OR: [
            { bodyText: { not: null } },
            { bodyHtml: { not: null } },
          ],
        },
        data: { bodyText: null, bodyHtml: null },
      });

      if (result.count > 0) {
        this.logger.log(
          `Purged email body content from ${result.count} lingering records`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to purge lingering email bodies:', error);
    }
  }
}

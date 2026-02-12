import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailMonitorService } from './email-monitor.service';
import { GmailPubsubService } from './gmail-pubsub.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailMonitorScheduler {
  private readonly logger = new Logger(EmailMonitorScheduler.name);
  private isRunning = false;

  constructor(
    private emailMonitorService: EmailMonitorService,
    private gmailPubsubService: GmailPubsubService,
    private prisma: PrismaService,
  ) {}

  /**
   * Poll email connections every 5 minutes (FALLBACK ONLY).
   *
   * When Gmail Pub/Sub push notifications are active, connections with
   * a valid watchExpiration are skipped since they receive real-time pushes.
   * Only connections WITHOUT an active watch are polled.
   *
   * This serves as a safety net per Google's recommendation:
   * "Make sure to handle this possibility gracefully, so that the application
   * still syncs even if no push messages are received."
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleEmailPolling() {
    if (this.isRunning) {
      this.logger.warn('Previous polling job still running, skipping...');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting scheduled email polling (fallback)...');

    try {
      // Only poll companies that have had user activity in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const now = new Date();

      const connections = await this.prisma.emailConnection.findMany({
        where: {
          isActive: true,
          autoImport: true,
          company: {
            lastActivityAt: {
              gte: oneHourAgo,
            },
          },
          // Only poll connections that do NOT have an active Pub/Sub watch.
          // Connections with an active watch receive real-time push notifications.
          OR: [
            { watchExpiration: null },
            { watchExpiration: { lt: now } },
          ],
        },
        include: {
          company: true,
        },
      });

      this.logger.log(
        `Found ${connections.length} active email connections without push (from active companies) to poll`,
      );

      // Process each connection
      for (const connection of connections) {
        try {
          await this.emailMonitorService.pollEmailsForConnection(connection.id);
        } catch (error) {
          this.logger.error(
            `Failed to poll emails for connection ${connection.id} (${connection.email}):`,
            error,
          );
        }
      }

      this.logger.log('Completed scheduled email polling (fallback)');
    } catch (error) {
      this.logger.error('Failed during email polling job:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Renew Gmail Pub/Sub watches daily at 2 AM.
   * Watches expire every 7 days; renewing daily with a 2-day buffer ensures no gap.
   * Also sets up watches for connections that should have one but don't.
   */
  @Cron('0 2 * * *')
  async handleWatchRenewal() {
    if (!this.gmailPubsubService.isEnabled()) {
      return;
    }

    this.logger.log('Starting daily Gmail Pub/Sub watch renewal...');

    try {
      await this.gmailPubsubService.renewExpiringWatches();
      this.logger.log('Completed daily Gmail Pub/Sub watch renewal');
    } catch (error) {
      this.logger.error('Failed during watch renewal job:', error);
    }
  }

  /**
   * Check for connections that need token refresh (every 30 minutes)
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleTokenRefresh() {
    this.logger.log('Checking for tokens that need refresh...');

    try {
      // Find connections with tokens expiring in the next hour
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

      const expiringConnections = await this.prisma.emailConnection.findMany({
        where: {
          isActive: true,
          expiresAt: {
            lte: oneHourFromNow,
          },
          refreshToken: {
            not: null,
          },
        },
      });

      this.logger.log(
        `Found ${expiringConnections.length} connections needing token refresh`,
      );

      for (const connection of expiringConnections) {
        try {
          await this.emailMonitorService.refreshConnectionToken(connection.id);
          this.logger.log(`Refreshed token for connection ${connection.id}`);
        } catch (error) {
          this.logger.error(
            `Failed to refresh token for connection ${connection.id}:`,
            error,
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed during token refresh job:', error);
    }
  }
}

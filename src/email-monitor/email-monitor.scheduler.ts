import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailMonitorService } from './email-monitor.service';
import { GmailPubsubService } from './gmail-pubsub.service';
import { OutlookMonitorService } from './outlook-monitor.service';
import { OutlookGraphService } from './outlook-graph.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailMonitorScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(EmailMonitorScheduler.name);
  private isRunning = false;
  private isOutlookRunning = false;
  private isShuttingDown = false;

  constructor(
    private emailMonitorService: EmailMonitorService,
    private gmailPubsubService: GmailPubsubService,
    private prisma: PrismaService,
    @Optional() private outlookMonitorService?: OutlookMonitorService,
    @Optional() private outlookGraphService?: OutlookGraphService,
  ) {}

  onModuleDestroy() {
    this.logger.log('Shutting down email monitor scheduler...');
    this.isShuttingDown = true;
  }

  /**
   * Poll Gmail connections every 5 minutes (FALLBACK ONLY).
   *
   * When Gmail Pub/Sub push notifications are active, connections with
   * a valid watchExpiration are skipped since they receive real-time pushes.
   * Only connections WITHOUT an active watch are polled.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleEmailPolling() {
    if (this.isShuttingDown) {
      this.logger.log('Shutdown in progress, skipping email polling');
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Previous polling job still running, skipping...');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting scheduled Gmail polling (fallback)...');

    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const now = new Date();

      const connections = await this.prisma.emailConnection.findMany({
        where: {
          isActive: true,
          autoImport: true,
          provider: 'GMAIL',
          company: {
            lastActivityAt: {
              gte: oneHourAgo,
            },
          },
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
        `Found ${connections.length} active Gmail connections without push to poll`,
      );

      for (const connection of connections) {
        try {
          await this.emailMonitorService.pollEmailsForConnection(connection.id);
        } catch (error) {
          this.logger.error(
            `Failed to poll emails for Gmail connection ${connection.id} (${connection.email}):`,
            error,
          );
        }
      }

      this.logger.log('Completed scheduled Gmail polling (fallback)');
    } catch (error) {
      this.logger.error('Failed during Gmail polling job:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Poll Outlook connections every 5 minutes (FALLBACK ONLY).
   *
   * When Graph change notifications are active, connections with
   * a valid graphSubscriptionId + watchExpiration are skipped.
   * Only connections WITHOUT an active subscription are polled.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleOutlookPolling() {
    if (this.isShuttingDown || !this.outlookMonitorService) {
      return;
    }

    if (this.isOutlookRunning) {
      this.logger.warn(
        'Previous Outlook polling job still running, skipping...',
      );
      return;
    }

    this.isOutlookRunning = true;
    this.logger.log('Starting scheduled Outlook polling (fallback)...');

    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const now = new Date();

      const connections = await this.prisma.emailConnection.findMany({
        where: {
          isActive: true,
          autoImport: true,
          provider: 'OUTLOOK',
          company: {
            lastActivityAt: {
              gte: oneHourAgo,
            },
          },
          // Only poll connections without active Graph subscription
          OR: [
            { graphSubscriptionId: null },
            { watchExpiration: null },
            { watchExpiration: { lt: now } },
          ],
        },
        include: {
          company: true,
        },
      });

      this.logger.log(
        `Found ${connections.length} active Outlook connections without push to poll`,
      );

      for (const connection of connections) {
        try {
          await this.outlookMonitorService.pollEmailsForConnection(
            connection.id,
          );
        } catch (error) {
          this.logger.error(
            `Failed to poll emails for Outlook connection ${connection.id} (${connection.email}):`,
            error,
          );
        }
      }

      this.logger.log('Completed scheduled Outlook polling (fallback)');
    } catch (error) {
      this.logger.error('Failed during Outlook polling job:', error);
    } finally {
      this.isOutlookRunning = false;
    }
  }

  /**
   * Renew Gmail Pub/Sub watches daily at 2 AM.
   * Watches expire every 7 days; renewing daily with a 2-day buffer ensures no gap.
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
      this.logger.error('Failed during Gmail watch renewal job:', error);
    }
  }

  /**
   * Renew Graph change notification subscriptions every 12 hours.
   * Subscriptions expire in ~2.9 days; renewing every 12h gives ample buffer.
   */
  @Cron('0 */12 * * *')
  async handleOutlookSubscriptionRenewal() {
    if (!this.outlookGraphService?.isEnabled()) {
      return;
    }

    this.logger.log(
      'Starting Outlook Graph subscription renewal...',
    );

    try {
      await this.outlookGraphService.renewExpiringSubscriptions();
      this.logger.log('Completed Outlook Graph subscription renewal');
    } catch (error) {
      this.logger.error(
        'Failed during Outlook subscription renewal job:',
        error,
      );
    }
  }

  /**
   * Check for connections that need token refresh (every 30 minutes).
   * Dispatches to the correct refresh method based on provider.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleTokenRefresh() {
    this.logger.log('Checking for tokens that need refresh...');

    try {
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
          if (
            connection.provider === 'OUTLOOK' &&
            this.outlookMonitorService
          ) {
            await this.outlookMonitorService.refreshConnectionToken(
              connection.id,
            );
          } else {
            await this.emailMonitorService.refreshConnectionToken(
              connection.id,
            );
          }
          this.logger.log(
            `Refreshed token for ${connection.provider} connection ${connection.id}`,
          );
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

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailMonitorService } from './email-monitor.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailMonitorScheduler {
  private readonly logger = new Logger(EmailMonitorScheduler.name);
  private isRunning = false;

  constructor(
    private emailMonitorService: EmailMonitorService,
    private prisma: PrismaService,
  ) {}

  /**
   * Poll all active email connections every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleEmailPolling() {
    if (this.isRunning) {
      this.logger.warn('Previous polling job still running, skipping...');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting scheduled email polling...');

    try {
      // Get all active email connections with auto-import enabled
      const connections = await this.prisma.emailConnection.findMany({
        where: {
          isActive: true,
          autoImport: true,
        },
        include: {
          company: true,
        },
      });

      this.logger.log(`Found ${connections.length} active email connections to poll`);

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

      this.logger.log('Completed scheduled email polling');
    } catch (error) {
      this.logger.error('Failed during email polling job:', error);
    } finally {
      this.isRunning = false;
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

      this.logger.log(`Found ${expiringConnections.length} connections needing token refresh`);

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

import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { EmailMonitorService } from './email-monitor.service';

interface PubsubNotificationData {
  emailAddress: string;
  historyId: string;
}

@Injectable()
export class GmailPubsubService {
  private readonly logger = new Logger(GmailPubsubService.name);
  private oauth2Client;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private integrationsService: IntegrationsService,
    @Inject(forwardRef(() => EmailMonitorService))
    private emailMonitorService: EmailMonitorService,
  ) {
    const clientId = this.configService.get<string>('google.clientId');
    const clientSecret = this.configService.get<string>('google.clientSecret');
    const redirectUri = this.configService.get<string>('google.redirectUri');

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
  }

  /**
   * Check if Pub/Sub push notifications are configured
   */
  isEnabled(): boolean {
    const topic = this.configService.get<string>('google.pubsubTopic');
    return !!topic;
  }

  /**
   * Set up a Gmail watch (push notification) for a connection.
   * Calls gmail.users.watch() with the configured Pub/Sub topic.
   * Stores watchExpiration and watchHistoryId on the connection.
   */
  async watchMailbox(connectionId: string): Promise<void> {
    const topic = this.configService.get<string>('google.pubsubTopic');
    if (!topic) {
      this.logger.warn(
        'GOOGLE_PUBSUB_TOPIC not configured, skipping watch setup',
      );
      return;
    }

    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection || !connection.isActive) {
      this.logger.warn(
        `Connection ${connectionId} not found or inactive, skipping watch`,
      );
      return;
    }

    try {
      const accessToken =
        await this.integrationsService.getValidAccessToken(connectionId);
      this.oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      const response = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: topic,
          labelIds: ['INBOX'],
          labelFilterBehavior: 'include',
        },
      });

      const { historyId, expiration } = response.data;

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: {
          watchHistoryId: historyId?.toString() || null,
          watchExpiration: expiration
            ? new Date(parseInt(expiration.toString(), 10))
            : null,
        },
      });

      this.logger.log(
        `Gmail watch set up for connection ${connectionId} (${connection.email}), expires: ${expiration ? new Date(parseInt(expiration.toString(), 10)).toISOString() : 'unknown'}`,
      );
    } catch (error) {
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        'Unknown error';
      const errorCode =
        error?.response?.data?.error?.code || error?.code || 'N/A';
      this.logger.error(
        `Failed to set up Gmail watch for connection ${connectionId}: [${errorCode}] ${errorMessage}`,
      );
      // Non-fatal: polling fallback will continue to work
    }
  }

  /**
   * Stop watching a Gmail mailbox.
   * Calls gmail.users.stop() and clears watch fields.
   */
  async stopWatch(connectionId: string): Promise<void> {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return;
    }

    try {
      const accessToken =
        await this.integrationsService.getValidAccessToken(connectionId);
      this.oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      await gmail.users.stop({ userId: 'me' });

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: {
          watchExpiration: null,
          watchHistoryId: null,
        },
      });

      this.logger.log(
        `Gmail watch stopped for connection ${connectionId} (${connection.email})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to stop Gmail watch for connection ${connectionId}:`,
        error,
      );
      // Clear fields anyway since the connection may be getting deleted
      await this.prisma.emailConnection
        .update({
          where: { id: connectionId },
          data: {
            watchExpiration: null,
            watchHistoryId: null,
          },
        })
        .catch(() => {});
    }
  }

  /**
   * Renew watches that are expiring within the next 2 days.
   * Called daily via cron to ensure no watch lapses.
   */
  async renewExpiringWatches(): Promise<void> {
    const twoDaysFromNow = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    );

    const expiringConnections = await this.prisma.emailConnection.findMany({
      where: {
        isActive: true,
        provider: 'GMAIL',
        watchExpiration: {
          lte: twoDaysFromNow,
          not: null,
        },
      },
    });

    // Also find connections that should have a watch but don't
    const unwatchedConnections = await this.prisma.emailConnection.findMany({
      where: {
        isActive: true,
        autoImport: true,
        provider: 'GMAIL',
        watchExpiration: null,
      },
    });

    const connectionsToWatch = [
      ...expiringConnections,
      ...unwatchedConnections,
    ];

    if (connectionsToWatch.length === 0) {
      this.logger.log('No watches need renewal');
      return;
    }

    this.logger.log(
      `Renewing/setting up watches for ${connectionsToWatch.length} connections (${expiringConnections.length} expiring, ${unwatchedConnections.length} unwatched)`,
    );

    for (const connection of connectionsToWatch) {
      try {
        await this.watchMailbox(connection.id);
      } catch (error) {
        this.logger.error(
          `Failed to renew watch for connection ${connection.id} (${connection.email}):`,
          error,
        );
      }
    }
  }

  /**
   * Handle an incoming Pub/Sub push notification from Gmail.
   * Decodes the base64 payload, finds the matching connection, and triggers email polling.
   */
  async handlePushNotification(messageData: string): Promise<void> {
    let notificationData: PubsubNotificationData;

    try {
      const decoded = Buffer.from(messageData, 'base64').toString('utf-8');
      notificationData = JSON.parse(decoded);
    } catch (error) {
      this.logger.error('Failed to decode Pub/Sub notification data:', error);
      return;
    }

    const { emailAddress, historyId } = notificationData;

    if (!emailAddress) {
      this.logger.warn('Pub/Sub notification missing emailAddress, ignoring');
      return;
    }

    this.logger.log(
      `Received Gmail push notification for ${emailAddress} (historyId: ${historyId})`,
    );

    // Find all active connections matching this email address
    const connections = await this.prisma.emailConnection.findMany({
      where: {
        email: emailAddress,
        isActive: true,
        provider: 'GMAIL',
      },
    });

    if (connections.length === 0) {
      this.logger.warn(
        `No active Gmail connection found for email ${emailAddress}`,
      );
      return;
    }

    // Process each matching connection
    for (const connection of connections) {
      try {
        this.logger.log(
          `Processing push notification for connection ${connection.id} (company: ${connection.companyId})`,
        );
        await this.emailMonitorService.pollEmailsForConnection(connection.id);
      } catch (error) {
        this.logger.error(
          `Failed to process push notification for connection ${connection.id}:`,
          error,
        );
      }
    }
  }
}

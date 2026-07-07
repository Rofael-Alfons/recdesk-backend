import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { OutlookMonitorService } from './outlook-monitor.service';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Microsoft Graph API wrapper for Outlook email integration.
 * Handles change notification subscriptions and delta queries.
 */
@Injectable()
export class OutlookGraphService {
  private readonly logger = new Logger(OutlookGraphService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private integrationsService: IntegrationsService,
    @Inject(forwardRef(() => OutlookMonitorService))
    private outlookMonitorService: OutlookMonitorService,
  ) {}

  /**
   * Check if Outlook email integration is configured.
   */
  isEnabled(): boolean {
    const clientId = this.configService.get<string>('microsoftEmail.clientId');
    const webhookUrl = this.configService.get<string>('microsoftEmail.webhookUrl');
    return !!clientId && !!webhookUrl;
  }

  /**
   * Headers for Graph calls that read message-resource data. Requests
   * immutable IDs so `id` stays stable even if the item moves folders within
   * the mailbox (learn.microsoft.com/graph/outlook-immutable-id). Intentionally
   * NOT used for /subscriptions calls: that resource doesn't support immutable
   * IDs, and handleChangeNotification() never reads a message id out of the
   * notification payload anyway.
   */
  private messageReadHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'IdType="ImmutableId"',
    };
  }

  /**
   * Create a Graph change notification subscription for an Outlook connection.
   * Subscribes to new messages in the user's inbox.
   * Max subscription TTL is ~4230 minutes (~2.9 days) for mail resources.
   */
  async createSubscription(connectionId: string): Promise<void> {
    const webhookUrl = this.configService.get<string>('microsoftEmail.webhookUrl');
    const webhookSecret = this.configService.get<string>('microsoftEmail.webhookSecret');

    if (!webhookUrl) {
      this.logger.warn(
        'MICROSOFT_EMAIL_WEBHOOK_URL not configured, skipping subscription setup',
      );
      return;
    }

    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection || !connection.isActive) {
      this.logger.warn(
        `Connection ${connectionId} not found or inactive, skipping subscription`,
      );
      return;
    }

    try {
      const accessToken =
        await this.integrationsService.getValidAccessToken(connectionId);

      // Subscription expires in 4200 minutes (~2.9 days)
      const expirationDateTime = new Date(
        Date.now() + 4200 * 60 * 1000,
      ).toISOString();

      const response = await axios.post(
        `${GRAPH_BASE}/subscriptions`,
        {
          changeType: 'created',
          notificationUrl: webhookUrl,
          resource: "me/mailFolders('Inbox')/messages",
          expirationDateTime,
          clientState: webhookSecret || '',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const subscriptionId = response.data.id;
      const expiration = new Date(response.data.expirationDateTime);

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: {
          graphSubscriptionId: subscriptionId,
          watchExpiration: expiration,
        },
      });

      this.logger.log(
        `Graph subscription created for connection ${connectionId} (${connection.email}), id: ${subscriptionId}, expires: ${expiration.toISOString()}`,
      );
    } catch (error: any) {
      const errorData = error.response?.data || error.message;
      this.logger.error(
        `Failed to create Graph subscription for connection ${connectionId}:`,
        errorData,
      );
      // Non-fatal: polling fallback will continue to work
    }
  }

  /**
   * Delete a Graph subscription for an Outlook connection.
   */
  async deleteSubscription(connectionId: string): Promise<void> {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection?.graphSubscriptionId) {
      return;
    }

    try {
      const accessToken =
        await this.integrationsService.getValidAccessToken(connectionId);

      await axios.delete(
        `${GRAPH_BASE}/subscriptions/${connection.graphSubscriptionId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      this.logger.log(
        `Graph subscription deleted for connection ${connectionId} (${connection.email})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to delete Graph subscription for connection ${connectionId}:`,
        error.response?.data || error.message,
      );
    }

    // Clear subscription fields regardless
    await this.prisma.emailConnection
      .update({
        where: { id: connectionId },
        data: {
          graphSubscriptionId: null,
          watchExpiration: null,
        },
      })
      .catch(() => {});
  }

  /**
   * Renew a Graph subscription (extend expiry).
   */
  async renewSubscription(connectionId: string): Promise<void> {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection?.graphSubscriptionId) {
      // No subscription to renew, create a new one
      await this.createSubscription(connectionId);
      return;
    }

    try {
      const accessToken =
        await this.integrationsService.getValidAccessToken(connectionId);

      const expirationDateTime = new Date(
        Date.now() + 4200 * 60 * 1000,
      ).toISOString();

      const response = await axios.patch(
        `${GRAPH_BASE}/subscriptions/${connection.graphSubscriptionId}`,
        { expirationDateTime },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const expiration = new Date(response.data.expirationDateTime);

      await this.prisma.emailConnection.update({
        where: { id: connectionId },
        data: { watchExpiration: expiration },
      });

      this.logger.log(
        `Graph subscription renewed for connection ${connectionId} (${connection.email}), expires: ${expiration.toISOString()}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to renew Graph subscription for connection ${connectionId}:`,
        error.response?.data || error.message,
      );

      // If renewal fails (e.g. subscription expired), try creating a new one
      if (error.response?.status === 404) {
        this.logger.log(
          `Subscription not found, creating new one for connection ${connectionId}`,
        );
        await this.createSubscription(connectionId);
      }
    }
  }

  /**
   * Renew all Outlook subscriptions expiring within the next 24 hours.
   * Also creates subscriptions for connections that should have one but don't.
   */
  async renewExpiringSubscriptions(): Promise<void> {
    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const expiringConnections = await this.prisma.emailConnection.findMany({
      where: {
        isActive: true,
        provider: 'OUTLOOK',
        graphSubscriptionId: { not: null },
        watchExpiration: {
          lte: oneDayFromNow,
          not: null,
        },
      },
    });

    // Also find OUTLOOK connections that should have a subscription but don't
    const unsubscribedConnections = await this.prisma.emailConnection.findMany({
      where: {
        isActive: true,
        autoImport: true,
        provider: 'OUTLOOK',
        graphSubscriptionId: null,
      },
    });

    const connectionsToProcess = [
      ...expiringConnections,
      ...unsubscribedConnections,
    ];

    if (connectionsToProcess.length === 0) {
      this.logger.log('No Outlook subscriptions need renewal');
      return;
    }

    this.logger.log(
      `Renewing/creating subscriptions for ${connectionsToProcess.length} Outlook connections (${expiringConnections.length} expiring, ${unsubscribedConnections.length} unsubscribed)`,
    );

    for (const connection of connectionsToProcess) {
      try {
        if (connection.graphSubscriptionId) {
          await this.renewSubscription(connection.id);
        } else {
          await this.createSubscription(connection.id);
        }
      } catch (error) {
        this.logger.error(
          `Failed to renew/create subscription for connection ${connection.id} (${connection.email}):`,
          error,
        );
      }
    }
  }

  /**
   * Handle an incoming Graph change notification.
   * Verifies clientState and triggers email polling for the matching connection.
   */
  async handleChangeNotification(
    notifications: Array<{
      subscriptionId: string;
      clientState?: string;
      resource: string;
      changeType: string;
    }>,
  ): Promise<void> {
    const webhookSecret = this.configService.get<string>(
      'microsoftEmail.webhookSecret',
    );

    for (const notification of notifications) {
      // Verify clientState
      if (webhookSecret && notification.clientState !== webhookSecret) {
        this.logger.warn(
          `Invalid clientState in notification for subscription ${notification.subscriptionId}, ignoring`,
        );
        continue;
      }

      this.logger.log(
        `Received Graph change notification for subscription ${notification.subscriptionId} (${notification.changeType}: ${notification.resource})`,
      );

      // Find matching connection
      const connection = await this.prisma.emailConnection.findFirst({
        where: {
          graphSubscriptionId: notification.subscriptionId,
          isActive: true,
          provider: 'OUTLOOK',
        },
      });

      if (!connection) {
        this.logger.warn(
          `No active Outlook connection found for subscription ${notification.subscriptionId}`,
        );
        continue;
      }

      // Trigger polling asynchronously
      this.outlookMonitorService
        .pollEmailsForConnection(connection.id)
        .catch((error) => {
          this.logger.error(
            `Failed to process change notification for connection ${connection.id}:`,
            error,
          );
        });
    }
  }

  /**
   * Build a delta-query URL that establishes a forward-only sync baseline
   * anchored at `sinceDate`. This intentionally returns NO historical
   * messages — only a fresh @odata.deltaLink representing the baseline —
   * because Microsoft Graph's `$deltatoken=latest` "sync from now" shortcut
   * is documented as supported only for Entra ID / OneDrive-SharePoint
   * resources, NOT for mail messages (learn.microsoft.com/graph/delta-query-overview).
   * For messages, the supported mechanism is `$filter=receivedDateTime ge
   * {value}` combined with $select/$top.
   *
   * INTENTIONAL, NOT A BUG: do not remove this filter to "simplify" the
   * query — doing so re-introduces full-mailbox enumeration on first
   * connect (every historical email gets AI-classified/CV-parsed/S3-
   * uploaded, with no queue or rate-limit handling). If a deliberate
   * historical-backfill feature is ever built, it should be a separate,
   * explicitly opt-in code path — not a change to this method.
   */
  private buildForwardOnlySyncUrl(sinceDate: Date): string {
    const filter = encodeURIComponent(
      `receivedDateTime ge ${sinceDate.toISOString()}`,
    );
    return `${GRAPH_BASE}/me/mailFolders('Inbox')/messages/delta?$select=id,subject,from,receivedDateTime,body,hasAttachments,internetMessageHeaders,internetMessageId&$filter=${filter}&$top=50`;
  }

  /**
   * Fetch new messages using delta query (incremental sync).
   * Returns messages and the new delta link for next sync.
   *
   * Forward-only contract: on a connection's first sync (no stored delta
   * link yet) or after a delta link expires (410), this does NOT enumerate
   * the mailbox's historical contents — it only establishes a baseline
   * anchored at connection time (or last successful sync), per PRD
   * "Only monitor emails arriving after connection".
   */
  async fetchNewMessages(
    connectionId: string,
  ): Promise<{ messages: any[]; deltaLink: string | null }> {
    const connection = await this.prisma.emailConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    const accessToken =
      await this.integrationsService.getValidAccessToken(connectionId);

    const messages: any[] = [];
    let nextLink: string | null = null;
    let deltaLink: string | null = null;

    // Use delta link if available, otherwise start fresh
    let url: string;
    if (connection.lastHistoryId) {
      // lastHistoryId stores the delta link for Outlook
      url = connection.lastHistoryId;
    } else {
      // Initial sync: forward-only baseline anchored at connection creation
      // time, per PRD "Only monitor emails arriving after connection".
      url = this.buildForwardOnlySyncUrl(connection.createdAt);
    }

    try {
      // Paginate through all results
      do {
        const response = await axios.get(url, {
          headers: this.messageReadHeaders(accessToken),
        });

        const data = response.data;

        if (data.value) {
          messages.push(...data.value);
        }

        nextLink = data['@odata.nextLink'] || null;
        deltaLink = data['@odata.deltaLink'] || null;

        url = nextLink || '';
      } while (nextLink);

      return { messages, deltaLink };
    } catch (error: any) {
      // If delta link is invalid/expired, start fresh
      if (error.response?.status === 410) {
        this.logger.warn(
          `Delta link expired for connection ${connectionId}, re-establishing forward-only baseline (not re-enumerating mailbox)`,
        );

        const anchor = connection.lastSyncAt ?? connection.createdAt;
        const freshUrl = this.buildForwardOnlySyncUrl(anchor);

        const response = await axios.get(freshUrl, {
          headers: this.messageReadHeaders(accessToken),
        });

        const data = response.data;
        if (data.value) {
          messages.push(...data.value);
        }

        return {
          messages,
          deltaLink: data['@odata.deltaLink'] || null,
        };
      }

      throw error;
    }
  }

  /**
   * Fetch attachments for a specific message.
   * Graph includes contentBytes inline for attachments <3MB.
   * For larger files, downloads separately.
   */
  async fetchMessageAttachments(
    connectionId: string,
    messageId: string,
  ): Promise<
    Array<{ filename: string; mimeType: string; size: number; data: Buffer }>
  > {
    const accessToken =
      await this.integrationsService.getValidAccessToken(connectionId);

    const response = await axios.get(
      `${GRAPH_BASE}/me/messages/${messageId}/attachments`,
      {
        headers: this.messageReadHeaders(accessToken),
      },
    );

    const attachments: Array<{
      filename: string;
      mimeType: string;
      size: number;
      data: Buffer;
    }> = [];

    for (const att of response.data.value || []) {
      // Only process file attachments (not item attachments or reference attachments)
      if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') {
        continue;
      }

      if (att.contentBytes) {
        attachments.push({
          filename: att.name || 'attachment',
          mimeType: att.contentType || 'application/octet-stream',
          size: att.size || 0,
          data: Buffer.from(att.contentBytes, 'base64'),
        });
      }
    }

    return attachments;
  }
}

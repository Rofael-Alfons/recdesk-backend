import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import {
  NotificationEvent,
  CreateNotificationData,
  NotificationQueryOptions,
  PaginatedNotifications,
} from './types/notification.types';

interface SSEEvent {
  companyId: string;
  notification: NotificationEvent;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly notificationSubject = new Subject<SSEEvent>();

  constructor(private prisma: PrismaService) {}

  /**
   * Create a new notification and emit it via SSE
   */
  async createNotification(data: CreateNotificationData): Promise<NotificationEvent> {
    const notification = await this.prisma.notification.create({
      data: {
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata || undefined,
        companyId: data.companyId,
        userId: data.userId,
      },
    });

    const notificationEvent: NotificationEvent = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata as Record<string, unknown> | undefined,
      createdAt: notification.createdAt,
    };

    // Emit the notification via SSE
    this.notificationSubject.next({
      companyId: data.companyId,
      notification: notificationEvent,
    });

    this.logger.log(
      `Created notification: ${notification.type} for company ${data.companyId}`,
    );

    return notificationEvent;
  }

  /**
   * Subscribe to notifications for a specific company via SSE
   */
  subscribeToCompany(companyId: string): Observable<NotificationEvent> {
    return this.notificationSubject.pipe(
      filter((event) => event.companyId === companyId),
      map((event) => event.notification),
    );
  }

  /**
   * Get paginated notifications for a company
   */
  async getNotifications(
    companyId: string,
    options: NotificationQueryOptions = {},
  ): Promise<PaginatedNotifications> {
    const { page = 1, limit = 20, unreadOnly = false } = options;
    const skip = (page - 1) * limit;

    const where = {
      companyId,
      ...(unreadOnly && { isRead: false }),
    };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        metadata: n.metadata as Record<string, unknown> | undefined,
        createdAt: n.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, companyId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        companyId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all notifications as read for a company
   */
  async markAllAsRead(companyId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        companyId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Get unread notification count for a company
   */
  async getUnreadCount(companyId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        companyId,
        isRead: false,
      },
    });
  }

  /**
   * Check usage limits and create notifications if thresholds are crossed
   */
  async checkAndNotifyUsageLimits(companyId: string): Promise<void> {
    // Get subscription and current usage
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });

    if (!subscription) {
      return;
    }

    const periodStart = subscription.currentPeriodStart;
    const periodEnd = subscription.currentPeriodEnd;
    const cvLimit = subscription.plan.cvLimit;

    // Unlimited plan
    if (cvLimit === -1) {
      return;
    }

    // Get CV usage for current period
    const usageRecords = await this.prisma.usageRecord.findMany({
      where: {
        companyId,
        type: 'CV_PROCESSED',
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
    });

    const cvProcessed = usageRecords.reduce((sum, r) => sum + r.count, 0);
    const usagePercentage = Math.round((cvProcessed / cvLimit) * 100);

    // Get or create usage alert tracker
    let tracker = await this.prisma.usageAlertTracker.findUnique({
      where: {
        companyId_periodStart: {
          companyId,
          periodStart,
        },
      },
    });

    if (!tracker) {
      tracker = await this.prisma.usageAlertTracker.create({
        data: {
          companyId,
          periodStart,
          periodEnd,
        },
      });
    }

    // Check thresholds and send notifications
    if (usagePercentage >= 100 && !tracker.threshold100Sent) {
      await this.createNotification({
        type: NotificationType.USAGE_LIMIT_REACHED,
        companyId,
        title: 'Usage Limit Reached',
        message: `You have reached your CV processing limit of ${cvLimit} CVs this month. Upgrade your plan to continue processing CVs.`,
        metadata: { cvProcessed, cvLimit, usagePercentage },
      });

      await this.prisma.usageAlertTracker.update({
        where: { id: tracker.id },
        data: { threshold100Sent: true },
      });
    } else if (usagePercentage >= 90 && !tracker.threshold90Sent) {
      await this.createNotification({
        type: NotificationType.USAGE_WARNING_90,
        companyId,
        title: 'Usage at 90%',
        message: `You have used ${cvProcessed} of ${cvLimit} CVs (${usagePercentage}%) this month. Consider upgrading your plan.`,
        metadata: { cvProcessed, cvLimit, usagePercentage },
      });

      await this.prisma.usageAlertTracker.update({
        where: { id: tracker.id },
        data: { threshold90Sent: true },
      });
    } else if (usagePercentage >= 80 && !tracker.threshold80Sent) {
      await this.createNotification({
        type: NotificationType.USAGE_WARNING_80,
        companyId,
        title: 'Usage at 80%',
        message: `You have used ${cvProcessed} of ${cvLimit} CVs (${usagePercentage}%) this month.`,
        metadata: { cvProcessed, cvLimit, usagePercentage },
      });

      await this.prisma.usageAlertTracker.update({
        where: { id: tracker.id },
        data: { threshold80Sent: true },
      });
    }
  }
}

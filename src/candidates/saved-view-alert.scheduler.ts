import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailSendingService } from '../email-sending/email-sending.service';
import { CandidateSelectionService } from './selection/candidate-selection.service';
import { parseCandidateQuery } from './candidate-query.util';
import { buildSavedViewDigestEmail, DigestLine } from './saved-view-digest.email';

const DAY_MS = 24 * 60 * 60 * 1000;

const alertInclude = {
  view: {
    select: {
      id: true,
      name: true,
      query: true,
      isShared: true,
      userId: true,
      companyId: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      isActive: true,
      companyId: true,
    },
  },
} satisfies Prisma.SavedViewAlertInclude;

type AlertWithView = Prisma.SavedViewAlertGetPayload<{
  include: typeof alertInclude;
}>;

/**
 * Link to the view narrowed to recently added candidates. Date-only, like the
 * list's date picker, so it can include a few earlier same-day matches.
 */
export function savedViewMatchHref(query: string, since: Date): string {
  const params = new URLSearchParams(query);
  const sinceDay = since.toISOString().slice(0, 10);
  const existing = params.get('createdFrom');
  if (!existing || existing < sinceDay) params.set('createdFrom', sinceDay);
  return `/candidates?${params.toString()}`;
}

@Injectable()
export class SavedViewAlertScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(SavedViewAlertScheduler.name);
  private readonly frontendUrl: string;
  private isChecking = false;
  private isSendingDigests = false;
  private isShuttingDown = false;

  constructor(
    private prisma: PrismaService,
    private candidateSelection: CandidateSelectionService,
    private notifications: NotificationsService,
    private emailSending: EmailSendingService,
    configService: ConfigService,
  ) {
    this.frontendUrl =
      configService.get<string>('frontend.url') || 'http://localhost:3001';
  }

  onModuleDestroy() {
    this.isShuttingDown = true;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyCheck() {
    if (this.isShuttingDown || this.isChecking) return;
    this.isChecking = true;
    try {
      await this.checkAlerts(new Date());
    } catch (error) {
      this.logger.error('Saved view alert check failed:', error);
    } finally {
      this.isChecking = false;
    }
  }

  @Cron('0 8 * * *', { timeZone: 'Africa/Cairo' })
  async handleDailyDigest() {
    if (this.isShuttingDown || this.isSendingDigests) return;
    this.isSendingDigests = true;
    try {
      await this.sendDigests(new Date());
    } catch (error) {
      this.logger.error('Saved view digest failed:', error);
    } finally {
      this.isSendingDigests = false;
    }
  }

  /** In-app notification per followed view with candidates added since the last check. */
  async checkAlerts(now: Date) {
    const alerts = await this.prisma.savedViewAlert.findMany({
      include: alertInclude,
      orderBy: { createdAt: 'asc' },
    });

    let notified = 0;
    for (const alert of alerts) {
      if (this.isShuttingDown) break;
      if (!(await this.keepIfVisible(alert))) continue;
      try {
        const since = alert.lastCheckedAt;
        const count = await this.countNew(alert, since, now);
        if (count > 0) {
          await this.notifications.createNotification({
            type: NotificationType.SAVED_VIEW_MATCH,
            companyId: alert.view.companyId,
            userId: alert.userId,
            title: `${count} new ${count === 1 ? 'candidate matches' : 'candidates match'} "${alert.view.name}"`,
            message: `New candidates were added that match your saved view "${alert.view.name}".`,
            metadata: {
              viewId: alert.view.id,
              count,
              href: savedViewMatchHref(alert.view.query, since),
            },
          });
          notified++;
        }
        await this.prisma.savedViewAlert.update({
          where: { id: alert.id },
          data: { lastCheckedAt: now },
        });
      } catch (error) {
        this.logger.warn(`Skipping saved view alert ${alert.id}: ${error}`);
      }
    }

    if (notified) this.logger.log(`Saved view alerts: ${notified} notifications`);
  }

  /** One email per user listing their digest-enabled views with new matches. */
  async sendDigests(now: Date) {
    const alerts = await this.prisma.savedViewAlert.findMany({
      where: { emailDigest: true },
      include: alertInclude,
      orderBy: { createdAt: 'asc' },
    });

    const byUser = new Map<string, AlertWithView[]>();
    for (const alert of alerts) {
      byUser.set(alert.userId, [...(byUser.get(alert.userId) ?? []), alert]);
    }

    let sent = 0;
    for (const userAlerts of byUser.values()) {
      if (this.isShuttingDown) break;
      const user = userAlerts[0].user;
      const lines: DigestLine[] = [];
      const covered: string[] = [];

      for (const alert of userAlerts) {
        if (!(await this.keepIfVisible(alert))) continue;
        const since =
          alert.lastDigestAt ??
          new Date(Math.max(alert.createdAt.getTime(), now.getTime() - DAY_MS));
        try {
          const count = await this.countNew(alert, since, now);
          if (count > 0) {
            lines.push({
              viewName: alert.view.name,
              count,
              href: `${this.frontendUrl}${savedViewMatchHref(alert.view.query, since)}`,
            });
          }
          covered.push(alert.id);
        } catch (error) {
          this.logger.warn(`Skipping saved view alert ${alert.id} in digest: ${error}`);
        }
      }

      if (lines.length) {
        const email = buildSavedViewDigestEmail(user.firstName, lines);
        const result = await this.emailSending.sendCustom(
          user.email,
          email.subject,
          email.html,
          email.text,
        );
        // Leave lastDigestAt alone so tomorrow's digest still covers today.
        if (!result.success) {
          this.logger.warn(`Digest to user ${user.id} failed: ${result.error}`);
          continue;
        }
        sent++;
      }

      if (covered.length) {
        await this.prisma.savedViewAlert.updateMany({
          where: { id: { in: covered } },
          data: { lastDigestAt: now },
        });
      }
    }

    if (sent) this.logger.log(`Saved view digests: ${sent} sent`);
  }

  /**
   * Views can be unshared, or users deactivated or moved, after an alert was
   * set; such alerts are deleted rather than leaking matches.
   */
  private async keepIfVisible(alert: AlertWithView): Promise<boolean> {
    const { view, user } = alert;
    const visible =
      user.isActive &&
      user.companyId === view.companyId &&
      (view.userId === user.id || view.isShared);
    if (!visible) {
      await this.prisma.savedViewAlert.delete({ where: { id: alert.id } });
    }
    return visible;
  }

  private async countNew(alert: AlertWithView, since: Date, until: Date) {
    const { dto } = await parseCandidateQuery(alert.view.query);
    return this.candidateSelection.countMatching(alert.view.companyId, dto, {
      createdAt: { gt: since, lte: until },
    });
  }
}

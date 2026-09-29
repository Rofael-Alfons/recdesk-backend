import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CandidateStatus, ScheduledEmailStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailSendingService } from './email-sending.service';
import { SCHEDULED_EMAIL_PURPOSE } from './scheduled-emails.service';

const BATCH_SIZE = 50;
// Leave headroom before the next minute's run.
const TIME_BUDGET_MS = 45_000;
// A row left in SENDING this long was interrupted mid-send (crash/deploy).
const STALE_SENDING_MS = 10 * 60_000;

@Injectable()
export class ScheduledEmailScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(ScheduledEmailScheduler.name);
  private isRunning = false;
  private isShuttingDown = false;

  constructor(
    private prisma: PrismaService,
    private emailSendingService: EmailSendingService,
  ) {}

  onModuleDestroy() {
    this.isShuttingDown = true;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDueEmails() {
    if (this.isShuttingDown || this.isRunning) return;
    this.isRunning = true;
    try {
      await this.failStaleSends();

      const startedAt = Date.now();
      const tally: Partial<Record<ScheduledEmailStatus, number>> = {};
      while (!this.isShuttingDown && Date.now() - startedAt < TIME_BUDGET_MS) {
        const due = await this.prisma.scheduledEmail.findMany({
          where: {
            status: ScheduledEmailStatus.PENDING,
            sendAt: { lte: new Date() },
          },
          orderBy: { sendAt: 'asc' },
          take: BATCH_SIZE,
          select: { id: true },
        });
        if (!due.length) break;

        for (const { id } of due) {
          if (this.isShuttingDown) break;
          const outcome = await this.processOne(id);
          if (outcome) tally[outcome] = (tally[outcome] ?? 0) + 1;
        }
      }

      if (Object.keys(tally).length) {
        this.logger.log(`Scheduled email sweep: ${JSON.stringify(tally)}`);
      }
    } catch (error) {
      this.logger.error('Scheduled email sweep failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Claims, re-checks and sends one due email. The PENDING -> SENDING claim
   * is a conditional update, so with several app instances only one of them
   * ever sends a given row. Returns the final status, or null if another
   * instance claimed it first.
   */
  async processOne(id: string): Promise<ScheduledEmailStatus | null> {
    const claim = await this.prisma.scheduledEmail.updateMany({
      where: { id, status: ScheduledEmailStatus.PENDING },
      data: { status: ScheduledEmailStatus.SENDING },
    });
    if (claim.count !== 1) return null;

    const email = await this.prisma.scheduledEmail.findUnique({
      where: { id },
      include: { candidate: { select: { status: true, email: true } } },
    });
    if (!email) return null;

    if (
      email.purpose === SCHEDULED_EMAIL_PURPOSE.REJECTION &&
      email.candidate.status !== CandidateStatus.REJECTED
    ) {
      return this.finish(id, ScheduledEmailStatus.CANCELLED, {
        cancelledAt: new Date(),
        error: 'Candidate is no longer rejected',
      });
    }
    if (!email.templateId) {
      return this.finish(id, ScheduledEmailStatus.FAILED, {
        error: 'Email template was deleted',
      });
    }
    if (!email.candidate.email) {
      return this.finish(id, ScheduledEmailStatus.FAILED, {
        error: 'Candidate has no email address',
      });
    }

    try {
      const result = await this.emailSendingService.sendTemplateToCandidate({
        candidateId: email.candidateId,
        companyId: email.companyId,
        templateId: email.templateId,
        subjectOverride: email.subjectOverride,
        senderUserId: email.createdById,
        actionDetails: { scheduledEmailId: email.id, purpose: email.purpose },
      });
      return result.success
        ? this.finish(id, ScheduledEmailStatus.SENT, { sentAt: new Date() })
        : this.finish(id, ScheduledEmailStatus.FAILED, {
            error: result.error ?? 'Send failed',
          });
    } catch (error) {
      return this.finish(id, ScheduledEmailStatus.FAILED, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Not retried: the provider may already have accepted the message, and a
   * duplicate rejection email is worse than a missing one.
   */
  private async failStaleSends() {
    const { count } = await this.prisma.scheduledEmail.updateMany({
      where: {
        status: ScheduledEmailStatus.SENDING,
        updatedAt: { lt: new Date(Date.now() - STALE_SENDING_MS) },
      },
      data: {
        status: ScheduledEmailStatus.FAILED,
        error: 'Interrupted while sending',
      },
    });
    if (count) this.logger.warn(`Marked ${count} interrupted scheduled emails as failed`);
  }

  private async finish(
    id: string,
    status: ScheduledEmailStatus,
    data: { sentAt?: Date; cancelledAt?: Date; error?: string },
  ): Promise<ScheduledEmailStatus> {
    await this.prisma.scheduledEmail.update({
      where: { id },
      data: { status, ...data },
    });
    return status;
  }
}

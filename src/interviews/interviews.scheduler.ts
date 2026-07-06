import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InterviewStatus, NotificationType, OfferMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InterviewEmailService } from './interview-email.service';

const MANAGER_NUDGE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h
const CANDIDATE_NUDGE_AFTER_MS = 48 * 60 * 60 * 1000; // 48h
const MANAGER_EXPIRE_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

@Injectable()
export class InterviewsScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(InterviewsScheduler.name);
  private readonly frontendUrl: string;
  private isRunning = false;
  private isShuttingDown = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private configService: ConfigService,
    private interviewEmail: InterviewEmailService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('frontend.url') || 'http://localhost:3001';
  }

  onModuleDestroy() {
    this.isShuttingDown = true;
  }

  /**
   * Hourly: nudge stale pending interviews and expire past-due ones so the
   * chasing moves off the recruiter's plate.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleInterviewMaintenance() {
    if (this.isShuttingDown || this.isRunning) return;
    this.isRunning = true;
    try {
      await this.nudgeManagers();
      await this.nudgeRecruitersForCandidates();
      await this.expireStale();
    } catch (error) {
      this.logger.error('Interview maintenance job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /** Re-notify hiring managers who haven't submitted availability. */
  private async nudgeManagers() {
    const now = Date.now();
    const createdBefore = new Date(now - MANAGER_NUDGE_AFTER_MS);
    const nudgedBefore = new Date(now - MANAGER_NUDGE_AFTER_MS);

    const interviews = await this.prisma.interview.findMany({
      where: {
        status: InterviewStatus.AWAITING_MANAGER,
        interviewerUserId: { not: null },
        createdAt: { lt: createdBefore },
        OR: [{ lastNudgedAt: null }, { lastNudgedAt: { lt: nudgedBefore } }],
      },
      include: {
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
        company: { select: { name: true } },
        interviewer: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
      take: 100,
    });

    for (const interview of interviews) {
      await this.notifications.createNotification({
        type: NotificationType.INTERVIEW_AVAILABILITY_REQUEST,
        companyId: interview.companyId,
        userId: interview.interviewerUserId!,
        title: 'Reminder: availability needed',
        message: `Still waiting on your availability to interview ${interview.candidate.fullName} for ${interview.job?.title ?? 'a role'}.`,
        metadata: { interviewId: interview.id, reminder: true },
      });

      // Re-email the manager too (covers the "not live on RecDesk" case).
      if (interview.interviewer?.email) {
        try {
          await this.interviewEmail.sendAvailabilityRequest(
            {
              interviewId: interview.id,
              candidateName: interview.candidate.fullName,
              candidateEmail: '',
              jobTitle: interview.job?.title ?? 'the role',
              companyName: interview.company.name,
              interviewerName: `${interview.interviewer.firstName} ${interview.interviewer.lastName}`,
              interviewerEmail: interview.interviewer.email,
              additionalAttendees: [],
              timezone: interview.timezone,
              durationMinutes: interview.durationMinutes,
              locationType: interview.locationType,
              locationDetails: interview.locationDetails,
              message: interview.message,
            },
            `${this.frontendUrl}/interviews/availability/${interview.id}`,
          );
        } catch (error: any) {
          this.logger.error(
            `Failed to re-email availability request for interview ${interview.id}: ${error.message}`,
          );
        }
      }

      await this.prisma.interview.update({
        where: { id: interview.id },
        data: { lastNudgedAt: new Date() },
      });
    }

    if (interviews.length) {
      this.logger.log(`Nudged ${interviews.length} manager(s) for availability`);
    }
  }

  /** Remind recruiters to follow up when a candidate hasn't booked. */
  private async nudgeRecruitersForCandidates() {
    const now = Date.now();
    const updatedBefore = new Date(now - CANDIDATE_NUDGE_AFTER_MS);
    const nudgedBefore = new Date(now - CANDIDATE_NUDGE_AFTER_MS);

    const interviews = await this.prisma.interview.findMany({
      where: {
        status: InterviewStatus.AWAITING_CANDIDATE,
        updatedAt: { lt: updatedBefore },
        OR: [{ lastNudgedAt: null }, { lastNudgedAt: { lt: nudgedBefore } }],
      },
      include: { candidate: { select: { fullName: true } } },
      take: 100,
    });

    for (const interview of interviews) {
      await this.notifications.createNotification({
        type: NotificationType.INTERVIEW_AVAILABILITY_REQUEST,
        companyId: interview.companyId,
        userId: interview.createdById,
        title: 'Candidate hasn’t booked yet',
        message: `${interview.candidate.fullName} hasn’t picked an interview time yet. Consider following up.`,
        metadata: { interviewId: interview.id, reminder: true },
      });
      await this.prisma.interview.update({
        where: { id: interview.id },
        data: { lastNudgedAt: new Date() },
      });
    }

    if (interviews.length) {
      this.logger.log(
        `Nudged ${interviews.length} recruiter(s) about unbooked candidates`,
      );
    }
  }

  /** Expire interviews whose slots have all passed or that went unanswered. */
  private async expireStale() {
    const now = new Date();

    // AWAITING_CANDIDATE with no remaining future slot. Scoped to FIXED
    // offers only — LIVE interviews never have pre-materialized slots by
    // design, so this rule would otherwise expire them immediately.
    const awaitingCandidate = await this.prisma.interview.findMany({
      where: { status: InterviewStatus.AWAITING_CANDIDATE, offerMode: OfferMode.FIXED },
      include: { slots: { where: { startsAt: { gt: now } }, take: 1 } },
      take: 500,
    });
    const expiredCandidateIds = awaitingCandidate
      .filter((i) => i.slots.length === 0)
      .map((i) => i.id);

    // AWAITING_MANAGER left unanswered for too long.
    const managerExpireBefore = new Date(
      now.getTime() - MANAGER_EXPIRE_AFTER_MS,
    );
    const staleManager = await this.prisma.interview.findMany({
      where: {
        status: InterviewStatus.AWAITING_MANAGER,
        createdAt: { lt: managerExpireBefore },
      },
      select: { id: true },
      take: 500,
    });

    const toExpire = [
      ...expiredCandidateIds,
      ...staleManager.map((i) => i.id),
    ];

    if (toExpire.length) {
      await this.prisma.interview.updateMany({
        where: { id: { in: toExpire } },
        data: { status: InterviewStatus.EXPIRED },
      });
      this.logger.log(`Expired ${toExpire.length} stale interview(s)`);
    }
  }
}

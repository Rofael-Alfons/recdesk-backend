import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  InterviewLocationType,
  InterviewStatus,
  NotificationType,
  OfferMode,
  SlotSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { AvailabilityService } from '../availability/availability.service';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { CreateInterviewDto, InterviewMode, BookSlotDto, PublicSlotGridQueryDto } from './dto';
import {
  InterviewEmailContext,
  InterviewEmailService,
} from './interview-email.service';
import { zonedWallTimeToUtc } from './utils/timezone.util';
import { findConflicts, TimeRange } from './utils/slot-conflicts.util';

const DEFAULT_TIMEZONE = 'Africa/Cairo';
const DEFAULT_DURATION = 45;

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);
  private readonly frontendUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notifications: NotificationsService,
    private billing: BillingService,
    private interviewEmail: InterviewEmailService,
    private availability: AvailabilityService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('frontend.url') || 'http://localhost:3001';
  }

  // ---------------------------------------------------------------------------
  // Recruiter actions
  // ---------------------------------------------------------------------------

  async create(dto: CreateInterviewDto, user: CurrentUserData) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, companyId: user.companyId },
      include: { job: { select: { id: true, title: true } } },
    });
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    if (!candidate.job) {
      throw new BadRequestException(
        'Assign this candidate to a job before scheduling an interview.',
      );
    }

    const timezone = dto.timezone || DEFAULT_TIMEZONE;
    const durationMinutes = dto.durationMinutes ?? DEFAULT_DURATION;
    const locationType = dto.locationType ?? InterviewLocationType.ONLINE;
    const mode =
      dto.mode ??
      (dto.slots?.length
        ? InterviewMode.MANUAL_SLOTS
        : InterviewMode.REQUEST_MANAGER);

    // Validate the interviewer is an active team member in the same company.
    let interviewerUserId: string | null = null;
    if (dto.interviewerUserId) {
      const interviewer = await this.prisma.user.findFirst({
        where: {
          id: dto.interviewerUserId,
          companyId: user.companyId,
          isActive: true,
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!interviewer) {
        throw new BadRequestException(
          'Interviewer must be an active team member',
        );
      }
      interviewerUserId = interviewer.id;
    }

    const bookingToken = this.generateToken();

    if (mode === InterviewMode.MANUAL_SLOTS) {
      if (!dto.slots?.length) {
        throw new BadRequestException('Provide at least one time slot');
      }
      const slots = this.buildSlots(dto.slots, timezone, durationMinutes);
      await this.assertNoConflicts(interviewerUserId, slots);
      const interview = await this.prisma.interview.create({
        data: {
          companyId: user.companyId,
          candidateId: candidate.id,
          jobId: candidate.job?.id ?? null,
          createdById: user.id,
          interviewerUserId,
          durationMinutes,
          timezone,
          locationType,
          locationDetails: dto.locationDetails,
          message: dto.message,
          additionalAttendees: dto.additionalAttendees ?? [],
          slotSource: SlotSource.RECRUITER,
          status: InterviewStatus.AWAITING_CANDIDATE,
          bookingToken,
          slots: { createMany: { data: slots } },
        },
        include: this.detailInclude(),
      });
      this.logger.log(
        `Interview ${interview.id} created (manual slots) for candidate ${candidate.id}`,
      );
      return this.toDetail(interview);
    }

    // request_manager
    if (!interviewerUserId) {
      throw new BadRequestException(
        'Select a hiring manager to request availability from',
      );
    }

    const interview = await this.prisma.interview.create({
      data: {
        companyId: user.companyId,
        candidateId: candidate.id,
        jobId: candidate.job?.id ?? null,
        createdById: user.id,
        interviewerUserId,
        durationMinutes,
        timezone,
        locationType,
        locationDetails: dto.locationDetails,
        message: dto.message,
        additionalAttendees: dto.additionalAttendees ?? [],
        slotSource: SlotSource.MANAGER,
        status: InterviewStatus.AWAITING_MANAGER,
        bookingToken,
      },
      include: this.detailInclude(),
    });

    await this.notifyManager(interview, {
      candidateName: candidate.fullName,
      jobTitle: candidate.job?.title ?? 'a role',
    });

    this.logger.log(
      `Interview ${interview.id} created (awaiting manager ${interviewerUserId})`,
    );
    return this.toDetail(interview);
  }

  async listForCandidate(candidateId: string, companyId: string) {
    const interviews = await this.prisma.interview.findMany({
      where: { candidateId, companyId },
      include: this.detailInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return interviews.map((i) => this.toDetail(i));
  }

  async findOneForCompany(id: string, companyId: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId },
      include: this.detailInclude(),
    });
    if (!interview) throw new NotFoundException('Interview not found');
    return this.toDetail(interview);
  }

  async sendToCandidate(id: string, user: CurrentUserData) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId: user.companyId },
      include: this.detailInclude(),
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.status !== InterviewStatus.AWAITING_CANDIDATE) {
      throw new BadRequestException(
        'This interview does not have proposed times ready to send',
      );
    }
    if (interview.offerMode === OfferMode.FIXED && !interview.slots.length) {
      throw new BadRequestException('There are no time slots to offer yet');
    }
    if (!interview.candidate.email) {
      throw new BadRequestException('Candidate does not have an email address');
    }

    const result = await this.interviewEmail.sendBookingInvite(
      this.emailContext(interview),
      this.bookingLink(interview.bookingToken),
    );
    if (!result.success) {
      throw new BadRequestException(
        result.error || 'Failed to send booking email',
      );
    }

    await this.billing.trackUsage(user.companyId, 'EMAIL_SENT');
    await this.prisma.candidateAction.create({
      data: {
        candidateId: interview.candidateId,
        userId: user.id,
        action: 'interview_invite_sent',
        details: { interviewId: interview.id },
      },
    });

    return { success: true, bookingLink: this.bookingLink(interview.bookingToken) };
  }

  async resend(id: string, user: CurrentUserData) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId: user.companyId },
      include: this.detailInclude(),
    });
    if (!interview) throw new NotFoundException('Interview not found');

    if (interview.status === InterviewStatus.AWAITING_MANAGER) {
      if (!interview.interviewerUserId) {
        throw new BadRequestException('No hiring manager assigned');
      }
      await this.notifyManager(interview, {
        candidateName: interview.candidate.fullName,
        jobTitle: interview.job?.title ?? 'a role',
      });
      await this.prisma.interview.update({
        where: { id: interview.id },
        data: { lastNudgedAt: new Date() },
      });
      return { success: true };
    }

    if (interview.status === InterviewStatus.AWAITING_CANDIDATE) {
      return this.sendToCandidate(id, user);
    }

    throw new BadRequestException('Nothing to resend for this interview');
  }

  async cancel(id: string, user: CurrentUserData) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (
      interview.status === InterviewStatus.CANCELLED ||
      interview.status === InterviewStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        `Interview is already ${interview.status.toLowerCase()}`,
      );
    }
    await this.prisma.interview.update({
      where: { id },
      data: { status: InterviewStatus.CANCELLED },
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Hiring manager (internal, authenticated) actions
  // ---------------------------------------------------------------------------

  async getAssigned(user: CurrentUserData) {
    const interviews = await this.prisma.interview.findMany({
      where: {
        interviewerUserId: user.id,
        status: InterviewStatus.AWAITING_MANAGER,
      },
      include: this.detailInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return interviews.map((i) => this.toDetail(i));
  }

  async getUpcoming(user: CurrentUserData) {
    const interviews = await this.prisma.interview.findMany({
      where: {
        companyId: user.companyId,
        status: InterviewStatus.SCHEDULED,
        scheduledAt: { gte: new Date() },
        OR: [{ createdById: user.id }, { interviewerUserId: user.id }],
      },
      include: this.detailInclude(),
      orderBy: { scheduledAt: 'asc' },
    });
    return interviews.map((i) => this.toDetail(i));
  }

  async submitAvailability(
    id: string,
    slots: string[],
    user: CurrentUserData,
  ) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId: user.companyId },
      include: this.detailInclude(),
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.interviewerUserId !== user.id) {
      throw new ForbiddenException(
        'Only the assigned interviewer can submit availability',
      );
    }
    if (interview.status !== InterviewStatus.AWAITING_MANAGER) {
      throw new BadRequestException(
        'This interview is no longer awaiting availability',
      );
    }
    if (!slots.length) {
      throw new BadRequestException('Provide at least one time slot');
    }

    const built = this.buildSlots(
      slots,
      interview.timezone,
      interview.durationMinutes,
    );
    await this.assertNoConflicts(interview.interviewerUserId, built, id);

    await this.prisma.$transaction([
      this.prisma.interviewSlot.deleteMany({ where: { interviewId: id } }),
      this.prisma.interviewSlot.createMany({
        data: built.map((s) => ({ ...s, interviewId: id })),
      }),
      this.prisma.interview.update({
        where: { id },
        data: {
          status: InterviewStatus.AWAITING_CANDIDATE,
          offerMode: OfferMode.FIXED,
          managerRespondedAt: new Date(),
          slotSource: SlotSource.MANAGER,
        },
      }),
    ]);

    await this.notifyRecruiterAvailabilitySubmitted(interview, user);

    return this.findOneForCompany(id, user.companyId);
  }

  /**
   * The assigned interviewer shares their live weekly calendar directly —
   * no slots are pre-picked or materialized. The candidate later books
   * straight off the interviewer's AvailabilitySchedule, computed on demand.
   */
  async shareLiveAvailability(id: string, user: CurrentUserData) {
    const interview = await this.prisma.interview.findFirst({
      where: { id, companyId: user.companyId },
      include: this.detailInclude(),
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.interviewerUserId !== user.id) {
      throw new ForbiddenException(
        'Only the assigned interviewer can share availability',
      );
    }
    if (interview.status !== InterviewStatus.AWAITING_MANAGER) {
      throw new BadRequestException(
        'This interview is no longer awaiting availability',
      );
    }

    const schedule = await this.availability.getMine(user.id);
    if (!schedule.rules.length) {
      throw new BadRequestException(
        'Set up your weekly availability before sharing it — add your hours in Availability settings first.',
      );
    }

    await this.prisma.interview.update({
      where: { id },
      data: {
        status: InterviewStatus.AWAITING_CANDIDATE,
        offerMode: OfferMode.LIVE,
        managerRespondedAt: new Date(),
        slotSource: SlotSource.MANAGER,
      },
    });

    await this.notifyRecruiterAvailabilitySubmitted(interview, user);

    return this.findOneForCompany(id, user.companyId);
  }

  // ---------------------------------------------------------------------------
  // Public candidate booking
  // ---------------------------------------------------------------------------

  async getPublicByToken(token: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { bookingToken: token },
      include: {
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
        company: { select: { name: true } },
        slots: { orderBy: { startsAt: 'asc' } },
      },
    });
    if (!interview) {
      throw new NotFoundException('Booking link not found');
    }

    const now = new Date();
    const bookable = interview.status === InterviewStatus.AWAITING_CANDIDATE;
    const scheduledSlot = interview.slots.find(
      (s) => s.id === interview.scheduledSlotId,
    );

    return {
      status: interview.status,
      offerMode: interview.offerMode,
      candidateFirstName:
        interview.candidate.fullName.trim().split(/\s+/)[0] || 'there',
      jobTitle: interview.job?.title ?? 'the role',
      companyName: interview.company.name,
      durationMinutes: interview.durationMinutes,
      locationType: interview.locationType,
      timezone: interview.timezone,
      message: interview.message,
      scheduledAt: interview.scheduledAt,
      slots: bookable
        ? interview.slots
            .filter((s) => s.startsAt > now)
            .map((s) => ({
              id: s.id,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
            }))
        : scheduledSlot
          ? [
              {
                id: scheduledSlot.id,
                startsAt: scheduledSlot.startsAt,
                endsAt: scheduledSlot.endsAt,
              },
            ]
          : [],
    };
  }

  /**
   * Live, conflict-aware slot grid for a LIVE-offer interview, resolved
   * server-side from the booking token — the interviewer's identity never
   * appears in the response.
   */
  async getPublicSlotGrid(token: string, query: PublicSlotGridQueryDto) {
    const interview = await this.prisma.interview.findUnique({
      where: { bookingToken: token },
      select: {
        status: true,
        offerMode: true,
        interviewerUserId: true,
        durationMinutes: true,
        timezone: true,
      },
    });
    if (!interview) throw new NotFoundException('Booking link not found');
    if (interview.offerMode !== OfferMode.LIVE) {
      throw new BadRequestException('This interview does not use live availability');
    }
    if (interview.status !== InterviewStatus.AWAITING_CANDIDATE) {
      throw new BadRequestException('This interview can no longer be booked');
    }
    if (!interview.interviewerUserId) {
      throw new BadRequestException('No interviewer is assigned to this interview');
    }

    return this.availability.getSlotGrid(interview.interviewerUserId, {
      interviewTimezone: interview.timezone,
      durationMinutes: interview.durationMinutes,
      withinDays: query.withinDays,
      stepMinutes: query.stepMinutes,
    });
  }

  async book(token: string, dto: BookSlotDto) {
    const interview = await this.prisma.interview.findUnique({
      where: { bookingToken: token },
      include: this.detailInclude(),
    });
    if (!interview) {
      throw new NotFoundException('Booking link not found');
    }
    if (interview.status !== InterviewStatus.AWAITING_CANDIDATE) {
      throw new BadRequestException(
        'This interview can no longer be booked',
      );
    }

    let fixedSlot: { id: string; startsAt: Date; endsAt: Date } | undefined;
    let liveSlot: { startsAt: Date; endsAt: Date } | undefined;

    if (interview.offerMode === OfferMode.FIXED) {
      if (!dto.slotId) throw new BadRequestException('A time slot is required');
      const found = interview.slots.find((s) => s.id === dto.slotId);
      if (!found) throw new BadRequestException('That time slot is not available');
      if (found.startsAt <= new Date()) {
        throw new BadRequestException('That time has already passed');
      }
      fixedSlot = found;
    } else {
      if (!dto.start) throw new BadRequestException('A time selection is required');
      if (!interview.interviewerUserId) {
        throw new BadRequestException('No interviewer is assigned to this interview');
      }
      liveSlot = await this.resolveLiveSlot(interview, dto.start);
    }

    const { startsAt, endsAt } = await this.prisma.$transaction(async (tx) => {
      let resolvedStartsAt: Date;
      let resolvedEndsAt: Date;

      if (fixedSlot) {
        // 1. Atomic conditional flip — closes the race where two concurrent
        // requests both pass the status check above before either commits.
        const result = await tx.interview.updateMany({
          where: { id: interview.id, status: InterviewStatus.AWAITING_CANDIDATE },
          data: {
            status: InterviewStatus.SCHEDULED,
            scheduledSlotId: fixedSlot.id,
            scheduledAt: fixedSlot.startsAt,
          },
        });
        if (result.count !== 1) {
          throw new ConflictException(
            'This interview can no longer be booked. Please refresh.',
          );
        }
        resolvedStartsAt = fixedSlot.startsAt;
        resolvedEndsAt = fixedSlot.endsAt;
      } else {
        // LIVE path: claim the interview with the same atomic guard, then
        // materialize exactly one InterviewSlot row for the confirmed time.
        const claim = await tx.interview.updateMany({
          where: { id: interview.id, status: InterviewStatus.AWAITING_CANDIDATE },
          data: { status: InterviewStatus.SCHEDULED },
        });
        if (claim.count !== 1) {
          throw new ConflictException(
            'This interview can no longer be booked. Please refresh.',
          );
        }
        const created = await tx.interviewSlot.create({
          data: {
            interviewId: interview.id,
            startsAt: liveSlot!.startsAt,
            endsAt: liveSlot!.endsAt,
          },
        });
        await tx.interview.update({
          where: { id: interview.id },
          data: { scheduledSlotId: created.id, scheduledAt: liveSlot!.startsAt },
        });
        resolvedStartsAt = liveSlot!.startsAt;
        resolvedEndsAt = liveSlot!.endsAt;
      }

      // 2. Defense-in-depth: reject if another interview for the same
      // interviewer was just confirmed for an overlapping time.
      if (interview.interviewerUserId) {
        const others = await tx.interview.findMany({
          where: {
            interviewerUserId: interview.interviewerUserId,
            status: InterviewStatus.SCHEDULED,
            id: { not: interview.id },
            scheduledAt: { not: null },
          },
          select: { scheduledAt: true, durationMinutes: true },
        });
        const bookedRanges: TimeRange[] = others.map((o) => ({
          startsAt: o.scheduledAt!,
          endsAt: new Date(o.scheduledAt!.getTime() + o.durationMinutes * 60_000),
        }));
        if (
          findConflicts(
            [{ startsAt: resolvedStartsAt, endsAt: resolvedEndsAt }],
            bookedRanges,
          ).length
        ) {
          throw new ConflictException(
            'This interviewer was just booked for an overlapping interview. Please refresh and pick another time.',
          );
        }
      }

      await tx.candidate.update({
        where: { id: interview.candidateId },
        data: { status: 'INTERVIEWING' },
      });
      await tx.candidateAction.create({
        data: {
          candidateId: interview.candidateId,
          userId: interview.createdById,
          action: 'interview_scheduled',
          details: {
            interviewId: interview.id,
            scheduledAt: resolvedStartsAt.toISOString(),
          },
        },
      });

      // 3. Cross-interview invalidation: prune overlapping open slots on
      // sibling FIXED interviews for the SAME interviewer, regardless of
      // their own durationMinutes. A no-op for LIVE siblings — they have no
      // pre-materialized slots to prune since their availability is always
      // computed live and already reflects this booking automatically.
      if (interview.interviewerUserId) {
        const siblingSlots = await tx.interviewSlot.findMany({
          where: {
            interview: {
              interviewerUserId: interview.interviewerUserId,
              status: InterviewStatus.AWAITING_CANDIDATE,
              id: { not: interview.id },
            },
            startsAt: { lt: resolvedEndsAt },
            endsAt: { gt: resolvedStartsAt },
          },
          select: { id: true, interviewId: true },
        });
        if (siblingSlots.length) {
          await tx.interviewSlot.deleteMany({
            where: { id: { in: siblingSlots.map((s) => s.id) } },
          });

          const affectedIds = [...new Set(siblingSlots.map((s) => s.interviewId))];
          const stillOpen = await tx.interviewSlot.findMany({
            where: { interviewId: { in: affectedIds }, startsAt: { gt: new Date() } },
            select: { interviewId: true },
            distinct: ['interviewId'],
          });
          const stillOpenIds = new Set(stillOpen.map((s) => s.interviewId));
          const toExpire = affectedIds.filter((id) => !stillOpenIds.has(id));
          if (toExpire.length) {
            await tx.interview.updateMany({
              where: { id: { in: toExpire } },
              data: { status: InterviewStatus.EXPIRED },
            });
          }
        }
      }

      return { startsAt: resolvedStartsAt, endsAt: resolvedEndsAt };
    });

    // Notify recruiter and (if internal) the hiring manager.
    const scheduledLabel = startsAt.toISOString();
    const recipients = new Set<string>([interview.createdById]);
    if (interview.interviewerUserId) {
      recipients.add(interview.interviewerUserId);
    }
    for (const userId of recipients) {
      await this.notifications.createNotification({
        type: NotificationType.INTERVIEW_SCHEDULED,
        companyId: interview.companyId,
        userId,
        title: 'Interview scheduled',
        message: `${interview.candidate.fullName} booked an interview for ${interview.job?.title ?? 'a role'}.`,
        metadata: {
          interviewId: interview.id,
          candidateId: interview.candidateId,
          scheduledAt: scheduledLabel,
        },
      });
    }

    // Send confirmations + .ics to all attendees.
    try {
      await this.interviewEmail.sendConfirmations(
        this.emailContext(interview),
        startsAt,
        endsAt,
      );
    } catch (error: any) {
      this.logger.error(
        `Interview ${interview.id} booked but confirmation emails failed: ${error.message}`,
      );
    }

    return { success: true, scheduledAt: startsAt };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private generateToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private bookingLink(token: string): string {
    return `${this.frontendUrl}/book/${token}`;
  }

  private buildSlots(
    wallTimes: string[],
    timezone: string,
    durationMinutes: number,
  ): { startsAt: Date; endsAt: Date }[] {
    const unique = [...new Set(wallTimes)];
    return unique.map((wall) => {
      const startsAt = zonedWallTimeToUtc(wall, timezone);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      return { startsAt, endsAt };
    });
  }

  /**
   * Reject offering a slot that overlaps an already-CONFIRMED interview for
   * the same interviewer, before it's ever written to InterviewSlot. Purely
   * a fast-fail at offer time — the booking-time transaction in book() is
   * the actual source of truth for correctness under concurrency.
   */
  private async assertNoConflicts(
    interviewerUserId: string | null,
    candidates: TimeRange[],
    excludeInterviewId?: string,
  ) {
    if (!interviewerUserId || !candidates.length) return;

    const booked = await this.prisma.interview.findMany({
      where: {
        interviewerUserId,
        status: InterviewStatus.SCHEDULED,
        id: excludeInterviewId ? { not: excludeInterviewId } : undefined,
        scheduledAt: { not: null },
      },
      select: { scheduledAt: true, durationMinutes: true },
    });
    const bookedRanges: TimeRange[] = booked.map((b) => ({
      startsAt: b.scheduledAt!,
      endsAt: new Date(b.scheduledAt!.getTime() + b.durationMinutes * 60_000),
    }));

    const conflicts = findConflicts(candidates, bookedRanges);
    if (conflicts.length) {
      throw new BadRequestException(
        `These times conflict with an existing booking for this interviewer: ${conflicts
          .map((c) => c.startsAt.toISOString())
          .join(', ')}`,
      );
    }
  }

  /**
   * Re-derives the actual UTC instant for a candidate-chosen LIVE slot from a
   * freshly computed grid — the client-supplied wall-time string is only a
   * lookup key, never trusted for the resulting Date. Always revalidates at
   * the widest window/finest granularity, independent of whatever the
   * candidate's calendar UI happened to request when it fetched its grid, so
   * this can only be more permissive than what was displayed, never reject a
   * legitimately-shown time.
   */
  private async resolveLiveSlot(
    interview: InterviewWithDetail,
    start: string,
  ): Promise<{ startsAt: Date; endsAt: Date }> {
    const grid = await this.availability.getSlotGrid(interview.interviewerUserId!, {
      interviewTimezone: interview.timezone,
      durationMinutes: interview.durationMinutes,
      withinDays: 60,
      stepMinutes: 5,
    });
    for (const day of grid) {
      const match = day.slots.find((s) => s.start === start);
      if (match) {
        return { startsAt: new Date(match.startUtc), endsAt: new Date(match.endUtc) };
      }
    }
    throw new ConflictException('That time is no longer available. Please pick another.');
  }

  private async notifyRecruiterAvailabilitySubmitted(
    interview: InterviewWithDetail,
    user: CurrentUserData,
  ) {
    await this.notifications.createNotification({
      type: NotificationType.INTERVIEW_AVAILABILITY_REQUEST,
      companyId: user.companyId,
      userId: interview.createdById,
      title: 'Interview availability received',
      message: `${user.firstName} ${user.lastName} shared times for ${interview.candidate.fullName}. Send the booking link to the candidate.`,
      metadata: {
        interviewId: interview.id,
        candidateId: interview.candidateId,
      },
    });

    if (interview.createdBy?.email) {
      try {
        await this.interviewEmail.sendAvailabilitySubmitted(
          this.emailContext(interview),
          `${this.frontendUrl}/candidates/${interview.candidateId}`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to email recruiter for interview ${interview.id}: ${error.message}`,
        );
      }
    }
  }

  private async notifyManager(
    interview: InterviewWithDetail,
    ctx: { candidateName: string; jobTitle: string },
  ) {
    await this.notifications.createNotification({
      type: NotificationType.INTERVIEW_AVAILABILITY_REQUEST,
      companyId: interview.companyId,
      userId: interview.interviewerUserId!,
      title: 'Availability requested',
      message: `Please share your availability to interview ${ctx.candidateName} for ${ctx.jobTitle}.`,
      metadata: { interviewId: interview.id },
    });

    // Also email the manager so they can act without logging in.
    if (interview.interviewer?.email) {
      try {
        await this.interviewEmail.sendAvailabilityRequest(
          this.emailContext(interview),
          this.availabilityLink(interview.id),
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to email availability request for interview ${interview.id}: ${error.message}`,
        );
      }
    }
  }

  private availabilityLink(interviewId: string): string {
    return `${this.frontendUrl}/interviews/availability/${interviewId}`;
  }

  private detailInclude() {
    return {
      candidate: { select: { id: true, fullName: true, email: true } },
      job: { select: { id: true, title: true } },
      interviewer: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      company: { select: { name: true } },
      slots: { orderBy: { startsAt: 'asc' as const } },
    };
  }

  private emailContext(
    interview: InterviewWithDetail,
  ): InterviewEmailContext {
    return {
      interviewId: interview.id,
      candidateName: interview.candidate.fullName,
      candidateEmail: interview.candidate.email ?? '',
      jobTitle: interview.job?.title ?? 'the role',
      companyName: interview.company.name,
      interviewerName: interview.interviewer
        ? `${interview.interviewer.firstName} ${interview.interviewer.lastName}`
        : undefined,
      interviewerEmail: interview.interviewer?.email,
      recruiterName: interview.createdBy
        ? `${interview.createdBy.firstName} ${interview.createdBy.lastName}`
        : undefined,
      recruiterEmail: interview.createdBy?.email,
      additionalAttendees: interview.additionalAttendees ?? [],
      timezone: interview.timezone,
      durationMinutes: interview.durationMinutes,
      locationType: interview.locationType,
      locationDetails: interview.locationDetails,
      message: interview.message,
    };
  }

  private toDetail(interview: InterviewWithDetail) {
    return {
      id: interview.id,
      status: interview.status,
      slotSource: interview.slotSource,
      offerMode: interview.offerMode,
      durationMinutes: interview.durationMinutes,
      timezone: interview.timezone,
      locationType: interview.locationType,
      locationDetails: interview.locationDetails,
      message: interview.message,
      additionalAttendees: interview.additionalAttendees,
      scheduledAt: interview.scheduledAt,
      managerRespondedAt: interview.managerRespondedAt,
      createdAt: interview.createdAt,
      candidate: interview.candidate,
      job: interview.job,
      interviewer: interview.interviewer,
      bookingLink: this.bookingLink(interview.bookingToken),
      slots: interview.slots.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      })),
    };
  }
}

// Shape returned by detailInclude(); kept loose to avoid Prisma type gymnastics.
type InterviewWithDetail = {
  id: string;
  status: InterviewStatus;
  slotSource: SlotSource;
  offerMode: OfferMode;
  durationMinutes: number;
  timezone: string;
  locationType: InterviewLocationType;
  locationDetails: string | null;
  message: string | null;
  additionalAttendees: string[];
  scheduledAt: Date | null;
  managerRespondedAt: Date | null;
  createdAt: Date;
  bookingToken: string;
  candidateId: string;
  companyId: string;
  createdById: string;
  interviewerUserId: string | null;
  candidate: { id: string; fullName: string; email: string | null };
  job: { id: string; title: string } | null;
  interviewer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  company: { name: string };
  slots: { id: string; startsAt: Date; endsAt: Date }[];
};

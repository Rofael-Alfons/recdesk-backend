import { Injectable } from '@nestjs/common';
import { ScheduledEmailStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const SCHEDULED_EMAIL_PURPOSE = {
  REJECTION: 'rejection',
  BULK: 'bulk',
} as const;

export type ScheduledEmailPurpose =
  (typeof SCHEDULED_EMAIL_PURPOSE)[keyof typeof SCHEDULED_EMAIL_PURPOSE];

export interface ScheduleEmailInput {
  companyId: string;
  candidateId: string;
  templateId: string;
  subjectOverride?: string | null;
  purpose: ScheduledEmailPurpose;
  sendAt: Date;
  createdById: string | null;
}

@Injectable()
export class ScheduledEmailsService {
  constructor(private prisma: PrismaService) {}

  async schedule(rows: ScheduleEmailInput[]): Promise<number> {
    if (!rows.length) return 0;
    const { count } = await this.prisma.scheduledEmail.createMany({
      data: rows.map((row) => ({
        companyId: row.companyId,
        candidateId: row.candidateId,
        templateId: row.templateId,
        subjectOverride: row.subjectOverride ?? null,
        purpose: row.purpose,
        sendAt: row.sendAt,
        createdById: row.createdById,
      })),
    });
    return count;
  }

  /** Pending emails first, then the most recent history. */
  async list(companyId: string, candidateId?: string) {
    return this.prisma.scheduledEmail.findMany({
      where: { companyId, ...(candidateId && { candidateId }) },
      orderBy: [{ status: 'asc' }, { sendAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        purpose: true,
        status: true,
        sendAt: true,
        sentAt: true,
        cancelledAt: true,
        error: true,
        createdAt: true,
        candidateId: true,
        template: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /** Only still-pending emails can be cancelled; returns how many were. */
  async cancel(
    companyId: string,
    ids: string[],
    userId: string | null,
  ): Promise<number> {
    const { count } = await this.prisma.scheduledEmail.updateMany({
      where: { id: { in: ids }, companyId, status: ScheduledEmailStatus.PENDING },
      data: {
        status: ScheduledEmailStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
      },
    });
    return count;
  }

  /** Used when candidates are moved out of the state an email was for. */
  async cancelPendingForCandidates(
    companyId: string,
    candidateIds: string[],
    purpose: ScheduledEmailPurpose,
    userId: string | null,
  ): Promise<number> {
    if (!candidateIds.length) return 0;
    const { count } = await this.prisma.scheduledEmail.updateMany({
      where: {
        companyId,
        candidateId: { in: candidateIds },
        purpose,
        status: ScheduledEmailStatus.PENDING,
      },
      data: {
        status: ScheduledEmailStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
      },
    });
    return count;
  }
}

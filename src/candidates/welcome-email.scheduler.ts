import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CandidateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailSendingService } from '../email-sending/email-sending.service';

@Injectable()
export class WelcomeEmailScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(WelcomeEmailScheduler.name);
  private isRunning = false;
  private isShuttingDown = false;

  constructor(
    private prisma: PrismaService,
    private emailSendingService: EmailSendingService,
  ) {}

  onModuleDestroy() {
    this.isShuttingDown = true;
  }

  /**
   * Daily at 7am Africa/Cairo: send the onboarding welcome email to every
   * HIRED candidate whose start date has arrived. Matches `startDate <=
   * today` (not `== today`) so a candidate hired with a past/same-day start
   * date, or one missed by a prior failed run, still gets the email on the
   * next run — welcomeEmailSentAt guards against ever sending it twice.
   */
  @Cron('0 7 * * *', { timeZone: 'Africa/Cairo' })
  async handleWelcomeEmails() {
    if (this.isShuttingDown || this.isRunning) return;
    this.isRunning = true;
    try {
      const todayCairo = new Date(
        `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())}T00:00:00.000Z`,
      );

      const candidates = await this.prisma.candidate.findMany({
        where: {
          status: CandidateStatus.HIRED,
          startDate: { lte: todayCairo },
          welcomeEmailSentAt: null,
        },
        select: { id: true, companyId: true },
      });

      let sent = 0;
      for (const candidate of candidates) {
        try {
          const result = await this.emailSendingService.sendWelcomeEmail(
            candidate.id,
            candidate.companyId,
          );
          if (result?.success) sent++;
        } catch (error) {
          this.logger.error(
            `Welcome email failed for candidate ${candidate.id}:`,
            error,
          );
        }
      }

      if (candidates.length) {
        this.logger.log(
          `Welcome email sweep: ${sent}/${candidates.length} sent`,
        );
      }
    } catch (error) {
      this.logger.error('Welcome email job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }
}

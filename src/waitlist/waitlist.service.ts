import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionalEmailService } from '../email-sending/transactional-email.service';
import { SubscribeWaitlistDto } from './dto';
import { randomBytes } from 'crypto';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);
  private readonly welcomeEmailEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private transactionalEmail: TransactionalEmailService,
  ) {
    this.welcomeEmailEnabled =
      this.configService.get<boolean>('waitlist.welcomeEmailEnabled') ?? true;
  }

  async subscribe(
    dto: SubscribeWaitlistDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ alreadySubscribed: boolean; position?: number }> {
    const emailLower = dto.email.toLowerCase().trim();

    const existing = await this.prisma.waitlistSubscriber.findUnique({
      where: { email: emailLower },
    });

    if (existing) {
      this.logger.log(`Duplicate waitlist signup attempt: ${emailLower}`);
      return { alreadySubscribed: true };
    }

    const referralCode = randomBytes(6).toString('base64url');

    await this.prisma.waitlistSubscriber.create({
      data: {
        email: emailLower,
        name: dto.name?.trim() || null,
        source: 'website',
        referralCode,
        ipAddress: meta.ip || null,
        userAgent: meta.userAgent?.substring(0, 500) || null,
      },
    });

    const position = await this.prisma.waitlistSubscriber.count();

    this.logger.log(`New waitlist subscriber #${position}: ${emailLower}`);

    if (this.welcomeEmailEnabled) {
      const displayName = dto.name?.trim() || 'there';
      this.logger.log(`Sending waitlist welcome email to: ${emailLower}`);
      this.transactionalEmail
        .sendWaitlistWelcomeEmail(emailLower, displayName, position)
        .then((result) => {
          if (result.success) {
            this.logger.log(
              `Waitlist welcome email sent successfully to: ${emailLower}`,
            );
          } else {
            this.logger.error(
              `Waitlist welcome email failed for ${emailLower}: ${result.error}`,
            );
          }
        })
        .catch((err) => {
          this.logger.error(
            `Waitlist welcome email unexpected error for ${emailLower}: ${err.message}`,
          );
          if (err.response?.body) {
            this.logger.error(
              `SendGrid error details: ${JSON.stringify(err.response.body)}`,
            );
          }
        });
    } else {
      this.logger.warn(
        `Waitlist welcome email is disabled, skipping for: ${emailLower}`,
      );
    }

    return { alreadySubscribed: false, position };
  }

  async getCount(): Promise<number> {
    return this.prisma.waitlistSubscriber.count();
  }
}

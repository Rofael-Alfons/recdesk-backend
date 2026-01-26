import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from './billing.service';

@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);

  constructor(private billingService: BillingService) {}

  /**
   * Check for expired subscriptions daily at 1:00 AM
   * This handles both regular subscription expiration and trial expiration
   */
  @Cron('0 1 * * *') // Daily at 1:00 AM
  async checkExpiredSubscriptions() {
    this.logger.log('Starting daily subscription expiration check...');
    
    try {
      const result = await this.billingService.checkAndExpireSubscriptions();
      this.logger.log(
        `Subscription expiration check completed: ${result.expired} expired, ${result.notified} notified`
      );
    } catch (error) {
      this.logger.error('Error during subscription expiration check:', error);
    }
  }

  /**
   * Send trial expiration warnings daily at 9:00 AM
   * Notifies users 3 days and 1 day before trial ends
   */
  @Cron('0 9 * * *') // Daily at 9:00 AM
  async sendTrialExpirationWarnings() {
    this.logger.log('Starting trial expiration warning check...');
    
    try {
      const result = await this.billingService.sendTrialWarnings();
      this.logger.log(`Trial warning check completed: ${result.notified} notifications sent`);
    } catch (error) {
      this.logger.error('Error during trial warning check:', error);
    }
  }

  /**
   * Check grace periods daily at 2:00 AM
   * Handles subscriptions that have exceeded their grace period after payment failure
   */
  @Cron('0 2 * * *') // Daily at 2:00 AM
  async checkGracePeriods() {
    this.logger.log('Starting grace period check...');
    
    try {
      const result = await this.billingService.checkGracePeriods();
      this.logger.log(`Grace period check completed: ${result.expired} grace periods expired`);
    } catch (error) {
      this.logger.error('Error during grace period check:', error);
    }
  }

  /**
   * Seed subscription plans on startup and weekly
   * Ensures plans are always up to date
   */
  @Cron(CronExpression.EVERY_WEEK) // Weekly
  async seedSubscriptionPlans() {
    this.logger.log('Seeding subscription plans...');
    
    try {
      await this.billingService.seedPlans();
      this.logger.log('Subscription plans seeded successfully');
    } catch (error) {
      this.logger.error('Error seeding subscription plans:', error);
    }
  }
}

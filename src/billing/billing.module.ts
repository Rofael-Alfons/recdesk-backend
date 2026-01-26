import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { WebhooksController } from './webhooks.controller';
import { BillingScheduler } from './billing.scheduler';
import { SubscriptionGuard } from './guards/subscription.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [BillingController, WebhooksController],
  providers: [BillingService, BillingScheduler, SubscriptionGuard],
  exports: [BillingService, SubscriptionGuard],
})
export class BillingModule {}

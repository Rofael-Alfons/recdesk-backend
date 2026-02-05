import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';

// Check if Redis is available - only when explicitly configured via URL or host
const isRedisConfigured = (): boolean => {
  return !!process.env.REDIS_URL || !!process.env.REDIS_HOST;
};

@Module({
  imports: [
    AiModule,
    BillingModule,
    // Only import QueueModule if Redis is configured
    ...(isRedisConfigured()
      ? [require('../queue/queue.module').QueueModule]
      : []),
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule { }

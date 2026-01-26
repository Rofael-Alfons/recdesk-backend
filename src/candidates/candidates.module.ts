import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';

// Check if Redis is available (same logic as app.module.ts)
const isRedisConfigured = (): boolean => {
  return !!process.env.REDIS_HOST || process.env.NODE_ENV === 'production';
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

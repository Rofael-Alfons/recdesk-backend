import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    AiModule,
    BillingModule,
    // QueueModule is now globally available via AppModule with graceful degradation
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule { }

import { Module } from '@nestjs/common';
import { CandidateSelectionService } from './candidate-selection.service';

@Module({
  providers: [CandidateSelectionService],
  exports: [CandidateSelectionService],
})
export class CandidateSelectionModule {}

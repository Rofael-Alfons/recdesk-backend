import { Module } from '@nestjs/common';
import { AllowlistService } from './allowlist.service';

@Module({
  providers: [AllowlistService],
  exports: [AllowlistService],
})
export class AllowlistModule {}

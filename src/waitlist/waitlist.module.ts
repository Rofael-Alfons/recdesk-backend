import { Module } from '@nestjs/common';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { EmailSendingModule } from '../email-sending/email-sending.module';

@Module({
  imports: [EmailSendingModule],
  controllers: [WaitlistController],
  providers: [WaitlistService],
})
export class WaitlistModule {}

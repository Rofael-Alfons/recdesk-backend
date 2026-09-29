import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ReferralsController } from './referrals.controller';
import { PublicReferralsController } from './public-referrals.controller';
import { ReferralsService } from './referrals.service';
import { UploadModule } from '../upload/upload.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    UploadModule,
    BillingModule,
  ],
  controllers: [ReferralsController, PublicReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}

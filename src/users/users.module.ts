import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { EmailSendingModule } from '../email-sending/email-sending.module';
import { AllowlistModule } from '../allowlist/allowlist.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [EmailSendingModule, AllowlistModule, PermissionsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

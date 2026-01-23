import { IsEnum, IsString, IsOptional, IsUUID, IsObject } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsUUID()
  companyId: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

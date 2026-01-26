import { NotificationType } from '@prisma/client';
export declare class CreateNotificationDto {
    type: NotificationType;
    companyId: string;
    userId?: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
}

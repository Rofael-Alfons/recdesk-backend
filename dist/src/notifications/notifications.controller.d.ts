import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    subscribeToNotifications(req: any): Observable<MessageEvent>;
    getNotifications(req: any, query: NotificationQueryDto): Promise<import("./types/notification.types").PaginatedNotifications>;
    getUnreadCount(req: any): Promise<{
        count: number;
    }>;
    markAsRead(req: any, id: string): Promise<{
        success: boolean;
    }>;
    markAllAsRead(req: any): Promise<{
        success: boolean;
    }>;
}

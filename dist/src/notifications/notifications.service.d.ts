import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEvent, CreateNotificationData, NotificationQueryOptions, PaginatedNotifications } from './types/notification.types';
export declare class NotificationsService {
    private prisma;
    private readonly logger;
    private readonly notificationSubject;
    constructor(prisma: PrismaService);
    createNotification(data: CreateNotificationData): Promise<NotificationEvent>;
    subscribeToCompany(companyId: string): Observable<NotificationEvent>;
    getNotifications(companyId: string, options?: NotificationQueryOptions): Promise<PaginatedNotifications>;
    markAsRead(notificationId: string, companyId: string): Promise<void>;
    markAllAsRead(companyId: string): Promise<void>;
    getUnreadCount(companyId: string): Promise<number>;
    checkAndNotifyUsageLimits(companyId: string): Promise<void>;
    notifyTrialExpiring(companyId: string, daysLeft: number): Promise<void>;
    notifyTrialExpired(companyId: string): Promise<void>;
    notifySubscriptionExpired(companyId: string): Promise<void>;
    notifyPaymentFailed(companyId: string, gracePeriodDays: number): Promise<void>;
}

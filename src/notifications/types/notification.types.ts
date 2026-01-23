import { NotificationType } from '@prisma/client';

export interface NotificationEvent {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateNotificationData {
  type: NotificationType;
  companyId: string;
  userId?: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationQueryOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface PaginatedNotifications {
  data: NotificationEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Sse,
  Req,
  MessageEvent,
} from '@nestjs/common';
import { Observable, map, interval, startWith, switchMap } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * SSE endpoint for real-time notifications
   * The client should connect to this endpoint with Bearer token in Authorization header
   */
  @Get('stream')
  @Sse()
  @ApiOperation({ summary: 'Subscribe to real-time notifications via SSE' })
  subscribeToNotifications(@Req() req: any): Observable<MessageEvent> {
    const companyId = req.user?.companyId;

    if (!companyId) {
      // Return an observable that immediately completes if no company
      return new Observable((subscriber) => {
        subscriber.error(new Error('Unauthorized'));
      });
    }

    // Emit a heartbeat every 30 seconds to keep the connection alive
    // and merge with actual notifications
    const heartbeat$ = interval(30000).pipe(
      startWith(0),
      map(() => ({
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      })),
    );

    const notifications$ = this.notificationsService
      .subscribeToCompany(companyId)
      .pipe(
        map((notification) => ({ type: 'notification', data: notification })),
      );

    // Merge heartbeat and notifications
    return new Observable<MessageEvent>((subscriber) => {
      // Subscribe to heartbeat
      const heartbeatSub = heartbeat$.subscribe({
        next: (event) => {
          subscriber.next({
            data: JSON.stringify(event),
          } as MessageEvent);
        },
      });

      // Subscribe to notifications
      const notificationSub = notifications$.subscribe({
        next: (event) => {
          subscriber.next({
            data: JSON.stringify(event),
          } as MessageEvent);
        },
      });

      // Cleanup on unsubscribe
      return () => {
        heartbeatSub.unsubscribe();
        notificationSub.unsubscribe();
      };
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get notification history (paginated)' })
  async getNotifications(
    @Req() req: any,
    @Query() query: NotificationQueryDto,
  ) {
    const companyId = req.user?.companyId;
    return this.notificationsService.getNotifications(companyId, {
      page: query.page,
      limit: query.limit,
      unreadOnly: query.unreadOnly,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Req() req: any) {
    const companyId = req.user?.companyId;
    const count = await this.notificationsService.getUnreadCount(companyId);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const companyId = req.user?.companyId;
    await this.notificationsService.markAsRead(id, companyId);
    return { success: true };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Req() req: any) {
    const companyId = req.user?.companyId;
    await this.notificationsService.markAllAsRead(companyId);
    return { success: true };
  }
}

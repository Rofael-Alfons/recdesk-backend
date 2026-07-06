import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, take, toArray } from 'rxjs';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('getNotifications', () => {
    it('returns only the current user and company-wide notifications', async () => {
      await service.getNotifications('company-1', 'user-1', {});

      const arg = prisma.notification.findMany.mock.calls[0][0];
      expect(arg.where.companyId).toBe('company-1');
      expect(arg.where.OR).toEqual([{ userId: 'user-1' }, { userId: null }]);
    });
  });

  describe('getUnreadCount', () => {
    it('scopes unread count to the user and company-wide notifications', async () => {
      await service.getUnreadCount('company-1', 'user-1');

      const arg = prisma.notification.count.mock.calls[0][0];
      expect(arg.where.companyId).toBe('company-1');
      expect(arg.where.isRead).toBe(false);
      expect(arg.where.OR).toEqual([{ userId: 'user-1' }, { userId: null }]);
    });
  });

  describe('markAsRead', () => {
    it('only marks notifications the user is allowed to see', async () => {
      await service.markAsRead('notif-1', 'company-1', 'user-1');

      const arg = prisma.notification.updateMany.mock.calls[0][0];
      expect(arg.where.id).toBe('notif-1');
      expect(arg.where.companyId).toBe('company-1');
      expect(arg.where.OR).toEqual([{ userId: 'user-1' }, { userId: null }]);
    });
  });

  describe('SSE scoping', () => {
    const baseNotification = {
      id: 'n1',
      type: NotificationType.INTERVIEW_AVAILABILITY_REQUEST,
      title: 't',
      message: 'm',
      createdAt: new Date(),
    };

    beforeEach(() => {
      prisma.notification.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...baseNotification, ...data }),
      );
    });

    it('delivers a user-targeted notification only to that user', async () => {
      const received = firstValueFrom(
        service.subscribeForUser('company-1', 'manager').pipe(take(1)),
      );
      const notReceived = firstValueFrom(
        service
          .subscribeForUser('company-1', 'recruiter')
          .pipe(take(1), toArray()),
      );

      await service.createNotification({
        type: NotificationType.INTERVIEW_AVAILABILITY_REQUEST,
        companyId: 'company-1',
        userId: 'manager',
        title: 'Availability requested',
        message: 'please share times',
      });

      await expect(received).resolves.toMatchObject({ id: 'n1' });

      // The recruiter stream should not have emitted; force-complete and check.
      const drained = await Promise.race([
        notReceived,
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 50)),
      ]);
      expect(drained).toBe('timeout');
    });

    it('delivers company-wide notifications (no userId) to everyone', async () => {
      const managerStream = firstValueFrom(
        service.subscribeForUser('company-1', 'manager').pipe(take(1)),
      );
      const recruiterStream = firstValueFrom(
        service.subscribeForUser('company-1', 'recruiter').pipe(take(1)),
      );

      await service.createNotification({
        type: NotificationType.USAGE_WARNING_80,
        companyId: 'company-1',
        title: 'Usage at 80%',
        message: 'heads up',
      });

      await expect(managerStream).resolves.toMatchObject({ id: 'n1' });
      await expect(recruiterStream).resolves.toMatchObject({ id: 'n1' });
    });
  });
});

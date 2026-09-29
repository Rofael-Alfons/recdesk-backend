import {
  SavedViewAlertScheduler,
  savedViewMatchHref,
} from './saved-view-alert.scheduler';
import { buildSavedViewDigestEmail } from './saved-view-digest.email';

describe('SavedViewAlertScheduler', () => {
  let prisma: any;
  let selection: { countMatching: jest.Mock };
  let notifications: { createNotification: jest.Mock };
  let emailSending: { sendCustom: jest.Mock };
  let scheduler: SavedViewAlertScheduler;

  const now = new Date('2026-09-30T05:00:00.000Z');
  const lastChecked = new Date('2026-09-30T04:00:00.000Z');

  const alert = (overrides: Record<string, any> = {}) => ({
    id: 'alert-1',
    userId: 'user-2',
    viewId: 'view-1',
    emailDigest: true,
    lastCheckedAt: lastChecked,
    lastDigestAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    view: {
      id: 'view-1',
      name: 'Cairo backend',
      query: 'country=Egypt&status=NEW',
      isShared: true,
      userId: 'user-1',
      companyId: 'comp-1',
      ...overrides.view,
    },
    user: {
      id: 'user-2',
      email: 'mona@acme.io',
      firstName: 'Mona',
      isActive: true,
      companyId: 'comp-1',
      ...overrides.user,
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== 'view' && key !== 'user'),
    ),
  });

  beforeEach(() => {
    prisma = {
      savedViewAlert: {
        findMany: jest.fn().mockResolvedValue([alert()]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    selection = { countMatching: jest.fn().mockResolvedValue(3) };
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    emailSending = { sendCustom: jest.fn().mockResolvedValue({ success: true }) };
    scheduler = new SavedViewAlertScheduler(
      prisma,
      selection as any,
      notifications as any,
      emailSending as any,
      { get: () => 'https://app.recdesk.io' } as any,
    );
  });

  describe('checkAlerts', () => {
    it('counts candidates added since the last check within the view and notifies the follower', async () => {
      await scheduler.checkAlerts(now);

      const [companyId, dto, extra] = selection.countMatching.mock.calls[0];
      expect(companyId).toBe('comp-1');
      expect(dto.country).toEqual(['Egypt']);
      expect(dto.status).toEqual(['NEW']);
      expect(extra).toEqual({ createdAt: { gt: lastChecked, lte: now } });

      expect(notifications.createNotification).toHaveBeenCalledWith({
        type: 'SAVED_VIEW_MATCH',
        companyId: 'comp-1',
        userId: 'user-2',
        title: '3 new candidates match "Cairo backend"',
        message: expect.any(String),
        metadata: {
          viewId: 'view-1',
          count: 3,
          href: '/candidates?country=Egypt&status=NEW&createdFrom=2026-09-30',
        },
      });
      expect(prisma.savedViewAlert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: { lastCheckedAt: now },
      });
    });

    it('advances the window without notifying when nothing is new', async () => {
      selection.countMatching.mockResolvedValue(0);
      await scheduler.checkAlerts(now);
      expect(notifications.createNotification).not.toHaveBeenCalled();
      expect(prisma.savedViewAlert.update).toHaveBeenCalled();
    });

    it('deletes alerts on views the user can no longer see', async () => {
      prisma.savedViewAlert.findMany.mockResolvedValue([
        alert({ view: { isShared: false } }),
        alert({ id: 'alert-2', user: { isActive: false } }),
        alert({ id: 'alert-3', user: { companyId: 'comp-other' } }),
      ]);

      await scheduler.checkAlerts(now);

      expect(prisma.savedViewAlert.delete).toHaveBeenCalledTimes(3);
      expect(selection.countMatching).not.toHaveBeenCalled();
      expect(notifications.createNotification).not.toHaveBeenCalled();
    });

    it("keeps an owner's alert on their own private view", async () => {
      prisma.savedViewAlert.findMany.mockResolvedValue([
        alert({ userId: 'user-1', user: { id: 'user-1' }, view: { isShared: false } }),
      ]);
      await scheduler.checkAlerts(now);
      expect(prisma.savedViewAlert.delete).not.toHaveBeenCalled();
      expect(notifications.createNotification).toHaveBeenCalled();
    });

    it('skips a view whose stored query no longer validates, without stopping the sweep', async () => {
      prisma.savedViewAlert.findMany.mockResolvedValue([
        alert({ view: { query: 'retired=1' } }),
        alert({ id: 'alert-2' }),
      ]);

      await scheduler.checkAlerts(now);

      expect(notifications.createNotification).toHaveBeenCalledTimes(1);
      expect(prisma.savedViewAlert.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendDigests', () => {
    it('sends one email per user covering all their digest views, then moves lastDigestAt', async () => {
      prisma.savedViewAlert.findMany.mockResolvedValue([
        alert(),
        alert({ id: 'alert-2', view: { id: 'view-2', name: 'Grads' } }),
      ]);
      selection.countMatching.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

      await scheduler.sendDigests(now);

      expect(prisma.savedViewAlert.findMany.mock.calls[0][0].where).toEqual({
        emailDigest: true,
      });
      // First digest: the last 24h, not everything since the alert was set.
      expect(selection.countMatching.mock.calls[0][2].createdAt.gt).toEqual(
        new Date(now.getTime() - 24 * 60 * 60 * 1000),
      );
      expect(emailSending.sendCustom).toHaveBeenCalledTimes(1);
      const [to, subject, html] = emailSending.sendCustom.mock.calls[0];
      expect(to).toBe('mona@acme.io');
      expect(subject).toBe('2 new candidates in your saved views');
      expect(html).toContain('https://app.recdesk.io/candidates?country=Egypt');
      expect(html).not.toContain('Grads');
      expect(prisma.savedViewAlert.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['alert-1', 'alert-2'] } },
        data: { lastDigestAt: now },
      });
    });

    it('sends nothing but still moves the window when no view has new matches', async () => {
      selection.countMatching.mockResolvedValue(0);
      await scheduler.sendDigests(now);
      expect(emailSending.sendCustom).not.toHaveBeenCalled();
      expect(prisma.savedViewAlert.updateMany).toHaveBeenCalled();
    });

    it('keeps the window when the email fails so tomorrow still covers today', async () => {
      emailSending.sendCustom.mockResolvedValue({ success: false, error: 'SES down' });
      await scheduler.sendDigests(now);
      expect(prisma.savedViewAlert.updateMany).not.toHaveBeenCalled();
    });

    it('counts from lastDigestAt once a digest has gone out', async () => {
      const lastDigest = new Date('2026-09-29T05:00:00.000Z');
      prisma.savedViewAlert.findMany.mockResolvedValue([alert({ lastDigestAt: lastDigest })]);
      await scheduler.sendDigests(now);
      expect(selection.countMatching.mock.calls[0][2].createdAt.gt).toBe(lastDigest);
    });
  });
});

describe('savedViewMatchHref', () => {
  const since = new Date('2026-09-30T04:00:00.000Z');

  it("adds the day of `since`, keeping a later createdFrom of the view's own", () => {
    expect(savedViewMatchHref('status=NEW', since)).toBe(
      '/candidates?status=NEW&createdFrom=2026-09-30',
    );
    expect(savedViewMatchHref('createdFrom=2026-01-01', since)).toBe(
      '/candidates?createdFrom=2026-09-30',
    );
    expect(savedViewMatchHref('createdFrom=2026-12-01', since)).toBe(
      '/candidates?createdFrom=2026-12-01',
    );
  });
});

describe('buildSavedViewDigestEmail', () => {
  it('escapes view names and pluralises the subject', () => {
    const one = buildSavedViewDigestEmail('Mona', [
      { viewName: '<b>Grads</b>', count: 1, href: 'https://x/candidates?a=1&b=2' },
    ]);
    expect(one.subject).toBe('1 new candidate in your saved views');
    expect(one.html).toContain('&lt;b&gt;Grads&lt;/b&gt;');
    expect(one.html).toContain('href="https://x/candidates?a=1&amp;b=2"');
    expect(one.text).toContain('- <b>Grads</b>: 1 new (https://x/candidates?a=1&b=2)');
  });
});

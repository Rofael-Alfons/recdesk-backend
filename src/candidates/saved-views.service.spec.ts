import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SavedViewsService } from './saved-views.service';

describe('SavedViewsService', () => {
  let service: SavedViewsService;
  let prisma: {
    savedCandidateView: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    savedViewAlert: { upsert: jest.Mock; deleteMany: jest.Mock };
  };

  const owner = { id: 'user-1', companyId: 'comp-1', role: 'RECRUITER' };
  const teammate = { id: 'user-2', companyId: 'comp-1', role: 'RECRUITER' };
  const admin = { id: 'user-3', companyId: 'comp-1', role: 'ADMIN' };

  const view = (overrides: Record<string, unknown> = {}) => ({
    id: 'view-1',
    name: 'Cairo backend',
    query: 'country=Egypt',
    isShared: false,
    userId: owner.id,
    companyId: 'comp-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: owner.id, firstName: 'Mona', lastName: 'Adel' },
    ...overrides,
  });

  const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

  beforeEach(() => {
    prisma = {
      savedCandidateView: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      savedViewAlert: {
        upsert: jest.fn().mockResolvedValue({ emailDigest: true }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new SavedViewsService(prisma as any);
  });

  describe('list', () => {
    it("returns the caller's own views plus the company's shared views", async () => {
      await service.list(teammate);

      expect(prisma.savedCandidateView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 'comp-1',
            OR: [{ userId: teammate.id }, { isShared: true }],
          },
        }),
      );
    });

    it('flags ownership and edit rights per caller', async () => {
      prisma.savedCandidateView.findMany.mockResolvedValue([view({ isShared: true })]);

      const [asTeammate] = await service.list(teammate);
      expect(asTeammate).toMatchObject({ isOwner: false, canEdit: false });

      const [asAdmin] = await service.list(admin);
      expect(asAdmin).toMatchObject({ isOwner: false, canEdit: true });

      const [asOwner] = await service.list(owner);
      expect(asOwner).toMatchObject({ isOwner: true, canEdit: true });
    });
  });

  describe('create', () => {
    it('saves a normalized query for the caller, private by default', async () => {
      prisma.savedCandidateView.create.mockResolvedValue(view());

      await service.create(owner, {
        name: 'Cairo backend',
        query: '?country=Egypt&skills=React,Node.js&page=3&limit=50',
      });

      expect(prisma.savedCandidateView.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Cairo backend',
            query: 'country=Egypt&skills=React%2CNode.js',
            isShared: false,
            userId: owner.id,
            companyId: 'comp-1',
          },
        }),
      );
    });

    it('rejects a query the candidate list endpoint would reject', async () => {
      await expect(
        service.create(owner, { name: 'Bad', query: 'status=NOPE' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(owner, { name: 'Bad', query: 'dropTable=1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.savedCandidateView.create).not.toHaveBeenCalled();
    });

    it('turns a duplicate name into a 409', async () => {
      prisma.savedCandidateView.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.create(owner, { name: 'Cairo backend', query: 'country=Egypt' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('lets the owner rename and share their view', async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValue(view());
      prisma.savedCandidateView.update.mockResolvedValue(view({ name: 'New', isShared: true }));

      await service.update(owner, 'view-1', { name: 'New', isShared: true });

      expect(prisma.savedCandidateView.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'view-1' },
          data: { name: 'New', isShared: true },
        }),
      );
    });

    it("forbids a teammate from editing someone else's shared view", async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValue(view({ isShared: true }));

      await expect(
        service.update(teammate, 'view-1', { name: 'Mine now' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.savedCandidateView.update).not.toHaveBeenCalled();
    });

    it("lets an ADMIN edit a teammate's shared view", async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValue(view({ isShared: true }));
      prisma.savedCandidateView.update.mockResolvedValue(view({ isShared: false }));

      await service.update(admin, 'view-1', { isShared: false });

      expect(prisma.savedCandidateView.update).toHaveBeenCalled();
      // Only the owner can still see it, so everyone else's alerts go.
      expect(prisma.savedViewAlert.deleteMany).toHaveBeenCalledWith({
        where: { viewId: 'view-1', userId: { not: owner.id } },
      });
    });

    it('returns 404 for views the caller cannot see (other companies, private views)', async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValue(null);

      await expect(service.update(admin, 'view-x', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.savedCandidateView.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'view-x',
          companyId: 'comp-1',
          OR: [{ userId: admin.id }, { isShared: true }],
        },
      });
    });

    it('validates a changed query and maps rename collisions to 409', async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValue(view());

      await expect(
        service.update(owner, 'view-1', { query: 'minScore=500' }),
      ).rejects.toThrow(BadRequestException);

      prisma.savedCandidateView.update.mockRejectedValue(uniqueViolation());
      await expect(service.update(owner, 'view-1', { name: 'Taken' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('lets the owner delete', async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValue(view());

      await service.remove(owner, 'view-1');

      expect(prisma.savedCandidateView.delete).toHaveBeenCalledWith({ where: { id: 'view-1' } });
    });

    it('forbids a non-owner non-admin from deleting', async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValue(view({ isShared: true }));

      await expect(service.remove(teammate, 'view-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.savedCandidateView.delete).not.toHaveBeenCalled();
    });
  });

  describe('alerts', () => {
    it("reports the caller's own alert on each view", async () => {
      prisma.savedCandidateView.findMany.mockResolvedValue([
        view({ alerts: [{ emailDigest: false }] }),
        view({ id: 'view-2', alerts: [] }),
      ]);

      const [followed, notFollowed] = await service.list(owner);

      expect(followed.alert).toEqual({ emailDigest: false });
      expect(notFollowed.alert).toBeNull();
      expect(prisma.savedCandidateView.findMany.mock.calls[0][0].include.alerts).toEqual({
        where: { userId: owner.id },
        select: { emailDigest: true },
      });
    });

    it("lets a teammate follow someone else's shared view, digest on by default", async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValue(view({ isShared: true }));

      const result = await service.setAlert(teammate, 'view-1', {});

      expect(prisma.savedViewAlert.upsert).toHaveBeenCalledWith({
        where: { userId_viewId: { userId: teammate.id, viewId: 'view-1' } },
        create: { userId: teammate.id, viewId: 'view-1', emailDigest: true },
        update: {},
      });
      expect(result).toEqual({ emailDigest: true });
    });

    it('updates only the digest flag on an existing alert', async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValue(view());

      await service.setAlert(owner, 'view-1', { emailDigest: false });

      expect(prisma.savedViewAlert.upsert.mock.calls[0][0].update).toEqual({
        emailDigest: false,
      });
    });

    it('404s for a view the caller cannot see, and removes only their own alert', async () => {
      prisma.savedCandidateView.findFirst.mockResolvedValueOnce(null);
      await expect(service.setAlert(teammate, 'view-x', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.savedViewAlert.upsert).not.toHaveBeenCalled();

      prisma.savedCandidateView.findFirst.mockResolvedValueOnce(view({ isShared: true }));
      await service.removeAlert(teammate, 'view-1');
      expect(prisma.savedViewAlert.deleteMany).toHaveBeenCalledWith({
        where: { userId: teammate.id, viewId: 'view-1' },
      });
    });
  });
});

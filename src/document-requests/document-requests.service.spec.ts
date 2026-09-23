import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentRequestStatus } from '@prisma/client';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { DocumentRequestsService } from './document-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsEmailService } from './documents-email.service';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';

describe('DocumentRequestsService', () => {
  let service: DocumentRequestsService;
  let prisma: any;
  let storage: { uploadFile: jest.Mock; getSignedUrl: jest.Mock; deleteFile: jest.Mock };
  let notifications: { createNotification: jest.Mock };
  let documentsEmail: {
    sendUploadLink: jest.Mock;
    sendRecruiterNotification: jest.Mock;
  };

  const user: CurrentUserData = {
    id: 'user-1',
    email: 'rec@acme.com',
    firstName: 'Rec',
    lastName: 'Ruiter',
    role: 'RECRUITER',
    companyId: 'comp-1',
    company: { id: 'comp-1', name: 'Acme', mode: 'FULL_ATS', plan: 'STARTER' },
    permissions: ['manageCandidates', 'reviewCandidates'],
  };

  const company = { name: 'Acme' };
  const candidate = {
    id: 'cand-1',
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    jobId: 'job-1',
  };
  const createdBy = {
    id: 'user-1',
    firstName: 'Rec',
    lastName: 'Ruiter',
    email: 'rec@acme.com',
  };

  function makeRequest(overrides: Record<string, any> = {}) {
    return {
      id: 'req-1',
      status: DocumentRequestStatus.PENDING,
      token: 'tok-1',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      retentionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      message: null,
      completedAt: null,
      createdAt: new Date(),
      companyId: 'comp-1',
      candidateId: candidate.id,
      createdById: user.id,
      candidate: { id: candidate.id, fullName: candidate.fullName, email: candidate.email },
      job: { id: 'job-1', title: 'Backend Engineer' },
      createdBy,
      company,
      items: [
        {
          id: 'item-a',
          name: 'National ID',
          description: null,
          required: true,
          uploads: [],
        },
        {
          id: 'item-b',
          name: 'Degree Certificate',
          description: null,
          required: true,
          uploads: [],
        },
      ],
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      candidate: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      documentRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      documentUpload: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      candidateAction: { create: jest.fn().mockResolvedValue({}) },
    };

    storage = {
      uploadFile: jest.fn().mockResolvedValue({
        key: 'comp-1/documents/req-1/file-uuid.pdf',
        url: 's3://bucket/comp-1/documents/req-1/file-uuid.pdf',
        isLocal: false,
      }),
      getSignedUrl: jest.fn().mockResolvedValue('https://signed-url'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    notifications = { createNotification: jest.fn().mockResolvedValue({}) };

    documentsEmail = {
      sendUploadLink: jest.fn().mockResolvedValue({ success: true }),
      sendRecruiterNotification: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentRequestsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const values: Record<string, any> = {
                'frontend.url': 'http://localhost:3001',
                'documents.retentionDays': 365,
                'documents.linkExpiryDays': 14,
              };
              return values[key];
            },
          },
        },
        { provide: StorageService, useValue: storage },
        { provide: NotificationsService, useValue: notifications },
        { provide: DocumentsEmailService, useValue: documentsEmail },
      ],
    }).compile();

    service = module.get(DocumentRequestsService);
  });

  describe('create', () => {
    it('generates a token, computes expiry, and orders checklist items', async () => {
      prisma.candidate.findFirst.mockResolvedValue(candidate);
      prisma.documentRequest.create.mockResolvedValue(makeRequest());

      await service.create(
        {
          candidateId: candidate.id,
          items: [
            { name: 'National ID', required: true },
            { name: 'Degree Certificate', required: false },
          ],
        },
        user,
      );

      const createArgs = prisma.documentRequest.create.mock.calls[0][0];
      expect(createArgs.data.token).toEqual(expect.any(String));
      expect(createArgs.data.token.length).toBeGreaterThan(20);
      expect(createArgs.data.items.createMany.data).toEqual([
        expect.objectContaining({ name: 'National ID', required: true, orderIndex: 0 }),
        expect.objectContaining({ name: 'Degree Certificate', required: false, orderIndex: 1 }),
      ]);

      const now = Date.now();
      const expiresAt = createArgs.data.expiresAt as Date;
      const daysUntilExpiry = (expiresAt.getTime() - now) / (24 * 60 * 60 * 1000);
      expect(daysUntilExpiry).toBeCloseTo(14, 0);

      expect(documentsEmail.sendUploadLink).toHaveBeenCalledWith(
        expect.objectContaining({ candidateEmail: candidate.email }),
        expect.stringContaining('/documents/'),
      );
      expect(prisma.candidateAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            candidateId: candidate.id,
            action: 'document_request_created',
          }),
        }),
      );
    });

    it('throws when the candidate has no email', async () => {
      prisma.candidate.findFirst.mockResolvedValue({ ...candidate, email: null });

      await expect(
        service.create({ candidateId: candidate.id, items: [{ name: 'ID' }] }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the candidate is not found', async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ candidateId: 'missing', items: [{ name: 'ID' }] }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a request with more than one isPersonalPhoto item', async () => {
      prisma.candidate.findFirst.mockResolvedValue(candidate);

      await expect(
        service.create(
          {
            candidateId: candidate.id,
            items: [
              { name: 'Headshot', isPersonalPhoto: true },
              { name: 'Another photo', isPersonalPhoto: true },
            ],
          },
          user,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.documentRequest.create).not.toHaveBeenCalled();
    });

    it('copies isPersonalPhoto onto the created checklist items', async () => {
      prisma.candidate.findFirst.mockResolvedValue(candidate);
      prisma.documentRequest.create.mockResolvedValue(makeRequest());

      await service.create(
        {
          candidateId: candidate.id,
          items: [{ name: 'Headshot', isPersonalPhoto: true }],
        },
        user,
      );

      const createArgs = prisma.documentRequest.create.mock.calls[0][0];
      expect(createArgs.data.items.createMany.data).toEqual([
        expect.objectContaining({ name: 'Headshot', isPersonalPhoto: true }),
      ]);
    });
  });

  describe('resend', () => {
    it('does not regenerate the token for a still-active request', async () => {
      const request = makeRequest({ status: DocumentRequestStatus.PARTIAL });
      prisma.documentRequest.findFirst.mockResolvedValue(request);

      await service.resend(request.id, user);

      expect(prisma.documentRequest.update).toHaveBeenCalledTimes(1);
      expect(prisma.documentRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastNudgedAt: expect.any(Date) }),
        }),
      );
      expect(documentsEmail.sendUploadLink).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining(request.token),
      );
    });

    it('regenerates the token and resets status for an expired request', async () => {
      const request = makeRequest({ status: DocumentRequestStatus.EXPIRED });
      prisma.documentRequest.findFirst.mockResolvedValue(request);
      prisma.documentRequest.update.mockResolvedValueOnce(
        makeRequest({ status: DocumentRequestStatus.PENDING, token: 'new-token' }),
      );

      await service.resend(request.id, user);

      const regenerateCall = prisma.documentRequest.update.mock.calls[0][0];
      expect(regenerateCall.data.token).not.toBe(request.token);
      expect(regenerateCall.data.status).toBe(DocumentRequestStatus.PENDING);
    });
  });

  describe('listForCompany', () => {
    it('computes skip/take from page/limit and returns pagination metadata', async () => {
      prisma.documentRequest.findMany.mockResolvedValue([makeRequest(), makeRequest()]);
      prisma.documentRequest.count.mockResolvedValue(45);

      const result = await service.listForCompany({ page: 2, limit: 20 }, user.companyId);

      expect(prisma.documentRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.pagination).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
      });
      expect(result.data).toHaveLength(2);
    });

    it('filters by status', async () => {
      prisma.documentRequest.findMany.mockResolvedValue([]);
      prisma.documentRequest.count.mockResolvedValue(0);

      await service.listForCompany(
        { status: DocumentRequestStatus.COMPLETE },
        user.companyId,
      );

      const call = prisma.documentRequest.findMany.mock.calls[0][0];
      expect(call.where).toEqual(
        expect.objectContaining({
          companyId: user.companyId,
          status: DocumentRequestStatus.COMPLETE,
        }),
      );
    });

    it('searches by candidate name or email', async () => {
      prisma.documentRequest.findMany.mockResolvedValue([]);
      prisma.documentRequest.count.mockResolvedValue(0);

      await service.listForCompany({ search: 'jane' }, user.companyId);

      const call = prisma.documentRequest.findMany.mock.calls[0][0];
      expect(call.where.candidate.OR).toEqual([
        { fullName: { contains: 'jane', mode: 'insensitive' } },
        { email: { contains: 'jane', mode: 'insensitive' } },
      ]);
    });

    it('always scopes the query to the given company', async () => {
      prisma.documentRequest.findMany.mockResolvedValue([]);
      prisma.documentRequest.count.mockResolvedValue(0);

      await service.listForCompany({}, 'comp-other');

      expect(prisma.documentRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'comp-other' }),
        }),
      );
      expect(prisma.documentRequest.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'comp-other' }),
        }),
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('returns a short-lived signed URL and logs the download', async () => {
      prisma.documentUpload.findFirst.mockResolvedValue({
        id: 'up-1',
        fileKey: 'comp-1/documents/req-1/file.pdf',
        fileName: 'id.pdf',
        checklistItem: { request: { candidateId: candidate.id } },
      });

      const result = await service.getDownloadUrl('up-1', user);

      expect(result.url).toBe('https://signed-url');
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        'comp-1/documents/req-1/file.pdf',
        300,
      );
      expect(prisma.candidateAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'document_downloaded' }),
        }),
      );
    });

    it('throws when the document does not belong to the company', async () => {
      prisma.documentUpload.findFirst.mockResolvedValue(null);

      await expect(service.getDownloadUrl('missing', user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deleteDocument', () => {
    it('deletes from storage, removes the row, and recomputes status', async () => {
      prisma.documentUpload.findFirst.mockResolvedValue({
        id: 'up-1',
        fileKey: 'comp-1/documents/req-1/file.pdf',
        fileName: 'id.pdf',
        checklistItem: { request: { id: 'req-1', candidateId: candidate.id } },
      });
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue(makeRequest());

      await service.deleteDocument('up-1', user);

      expect(storage.deleteFile).toHaveBeenCalledWith('comp-1/documents/req-1/file.pdf');
      expect(prisma.documentUpload.delete).toHaveBeenCalledWith({ where: { id: 'up-1' } });
      expect(prisma.candidateAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'document_deleted' }),
        }),
      );
      expect(notifications.createNotification).toHaveBeenCalled();
    });
  });

  describe('uploadPublicDocument / status recomputation', () => {
    it('moves PENDING -> PARTIAL when one of two required items is fulfilled, and emails the recruiter', async () => {
      const request = makeRequest({ status: DocumentRequestStatus.PENDING });
      prisma.documentRequest.findUnique.mockResolvedValue(request);
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue(
        makeRequest({
          status: DocumentRequestStatus.PENDING,
          items: [
            { ...request.items[0], uploads: [{ id: 'u1' }] },
            request.items[1],
          ],
        }),
      );

      const file = {
        buffer: Buffer.from('id-scan'),
        originalname: 'national-id.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      } as Express.Multer.File;

      await service.uploadPublicDocument('tok-1', 'item-a', file);

      expect(prisma.documentUpload.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ checklistItemId: 'item-a' }),
        }),
      );
      expect(prisma.documentRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DocumentRequestStatus.PARTIAL }),
        }),
      );
      expect(notifications.createNotification).toHaveBeenCalled();
      expect(documentsEmail.sendRecruiterNotification).toHaveBeenCalled();
    });

    it('does not re-email the recruiter when status does not change', async () => {
      const request = makeRequest({
        status: DocumentRequestStatus.PARTIAL,
        items: [
          { id: 'item-a', name: 'National ID', description: null, required: true, uploads: [{ id: 'u1' }] },
          { id: 'item-b', name: 'Degree Certificate', description: null, required: true, uploads: [] },
          { id: 'item-c', name: 'Optional note', description: null, required: false, uploads: [] },
        ],
      });
      prisma.documentRequest.findUnique.mockResolvedValue(request);
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue({
        ...request,
        items: [
          request.items[0],
          request.items[1],
          { ...request.items[2], uploads: [{ id: 'u2' }] },
        ],
      });

      const file = {
        buffer: Buffer.from('note'),
        originalname: 'note.pdf',
        mimetype: 'application/pdf',
        size: 512,
      } as Express.Multer.File;

      await service.uploadPublicDocument('tok-1', 'item-c', file);

      expect(prisma.documentRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DocumentRequestStatus.PARTIAL }),
        }),
      );
      expect(documentsEmail.sendRecruiterNotification).not.toHaveBeenCalled();
    });

    it('rejects uploads once the link has expired', async () => {
      prisma.documentRequest.findUnique.mockResolvedValue(
        makeRequest({ expiresAt: new Date(Date.now() - 1000) }),
      );

      const file = {
        buffer: Buffer.from('x'),
        originalname: 'x.pdf',
        mimetype: 'application/pdf',
        size: 10,
      } as Express.Multer.File;

      await expect(
        service.uploadPublicDocument('tok-1', 'item-a', file),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects disallowed file types', async () => {
      prisma.documentRequest.findUnique.mockResolvedValue(makeRequest());

      const file = {
        buffer: Buffer.from('x'),
        originalname: 'malware.exe',
        mimetype: 'application/octet-stream',
        size: 10,
      } as Express.Multer.File;

      await expect(
        service.uploadPublicDocument('tok-1', 'item-a', file),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('uploadPublicDocument — personal photo', () => {
    function makePhotoRequest() {
      return makeRequest({
        items: [
          {
            id: 'item-photo',
            name: 'Headshot',
            description: null,
            required: true,
            isPersonalPhoto: true,
            uploads: [],
          },
        ],
      });
    }

    it('rejects a PDF upload to an isPersonalPhoto item', async () => {
      prisma.documentRequest.findUnique.mockResolvedValue(makePhotoRequest());

      const file = {
        buffer: Buffer.from('x'),
        originalname: 'id.pdf',
        mimetype: 'application/pdf',
        size: 10,
      } as Express.Multer.File;

      await expect(
        service.uploadPublicDocument('tok-1', 'item-photo', file),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.documentUpload.create).not.toHaveBeenCalled();
    });

    it('accepts a JPG upload to an isPersonalPhoto item and sets candidate.photoUrl', async () => {
      prisma.documentRequest.findUnique.mockResolvedValue(makePhotoRequest());
      prisma.documentUpload.create.mockResolvedValue({
        id: 'up-1',
        fileKey: 's3://bucket/comp-1/documents/req-1/photo.jpg',
        fileName: 'me.jpg',
      });
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue(makePhotoRequest());

      const file = {
        buffer: Buffer.from('x'),
        originalname: 'me.jpg',
        mimetype: 'image/jpeg',
        size: 10,
      } as Express.Multer.File;

      await service.uploadPublicDocument('tok-1', 'item-photo', file);

      expect(prisma.candidate.update).toHaveBeenCalledWith({
        where: { id: candidate.id },
        data: {
          photoUrl: 's3://bucket/comp-1/documents/req-1/photo.jpg',
          photoFileName: 'me.jpg',
        },
      });
    });

    it('does not touch candidate.photoUrl for a non-personal-photo item upload', async () => {
      prisma.documentRequest.findUnique.mockResolvedValue(makeRequest());
      prisma.documentUpload.create.mockResolvedValue({
        id: 'up-1',
        fileKey: 's3://bucket/id.pdf',
        fileName: 'id.pdf',
      });
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue(makeRequest());

      const file = {
        buffer: Buffer.from('x'),
        originalname: 'id.pdf',
        mimetype: 'application/pdf',
        size: 10,
      } as Express.Multer.File;

      await service.uploadPublicDocument('tok-1', 'item-a', file);

      expect(prisma.candidate.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteDocument / deletePublicUpload — personal photo cleanup', () => {
    function makePhotoUpload(overrides: Record<string, any> = {}) {
      return {
        id: 'up-1',
        fileKey: 'comp-1/documents/req-1/photo.jpg',
        fileName: 'me.jpg',
        checklistItemId: 'item-photo',
        checklistItem: {
          isPersonalPhoto: true,
          request: { id: 'req-1', candidateId: candidate.id },
        },
        ...overrides,
      };
    }

    it('deleteDocument falls back to the next remaining upload under the same item', async () => {
      prisma.documentUpload.findFirst.mockImplementation((args: any) => {
        if (args.where?.id === 'up-1') return Promise.resolve(makePhotoUpload());
        // syncCandidatePhotoAfterDelete's fallback lookup
        return Promise.resolve({
          fileKey: 'comp-1/documents/req-1/photo-2.jpg',
          fileName: 'me-2.jpg',
        });
      });
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue(makeRequest());

      await service.deleteDocument('up-1', user);

      expect(prisma.candidate.update).toHaveBeenCalledWith({
        where: { id: candidate.id },
        data: {
          photoUrl: 'comp-1/documents/req-1/photo-2.jpg',
          photoFileName: 'me-2.jpg',
        },
      });
    });

    it('deleteDocument clears candidate.photoUrl when no upload remains under the item', async () => {
      prisma.documentUpload.findFirst.mockImplementation((args: any) => {
        if (args.where?.id === 'up-1') return Promise.resolve(makePhotoUpload());
        return Promise.resolve(null);
      });
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue(makeRequest());

      await service.deleteDocument('up-1', user);

      expect(prisma.candidate.update).toHaveBeenCalledWith({
        where: { id: candidate.id },
        data: { photoUrl: null, photoFileName: null },
      });
    });

    it('deleteDocument does not touch candidate.photoUrl for a non-personal-photo item', async () => {
      prisma.documentUpload.findFirst.mockResolvedValue({
        id: 'up-1',
        fileKey: 'comp-1/documents/req-1/file.pdf',
        fileName: 'id.pdf',
        checklistItemId: 'item-a',
        checklistItem: {
          isPersonalPhoto: false,
          request: { id: 'req-1', candidateId: candidate.id },
        },
      });
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue(makeRequest());

      await service.deleteDocument('up-1', user);

      expect(prisma.candidate.update).not.toHaveBeenCalled();
    });

    it('deletePublicUpload falls back to the next remaining upload under the same item', async () => {
      prisma.documentRequest.findUnique.mockResolvedValue(
        makeRequest({ status: DocumentRequestStatus.PARTIAL }),
      );
      prisma.documentUpload.findFirst.mockImplementation((args: any) => {
        if (args.where?.id === 'up-1') {
          return Promise.resolve({
            id: 'up-1',
            fileKey: 'comp-1/documents/req-1/photo.jpg',
            checklistItem: { isPersonalPhoto: true },
          });
        }
        return Promise.resolve({
          fileKey: 'comp-1/documents/req-1/photo-2.jpg',
          fileName: 'me-2.jpg',
        });
      });
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue(makeRequest());

      await service.deletePublicUpload('tok-1', 'item-photo', 'up-1');

      expect(prisma.candidate.update).toHaveBeenCalledWith({
        where: { id: candidate.id },
        data: {
          photoUrl: 'comp-1/documents/req-1/photo-2.jpg',
          photoFileName: 'me-2.jpg',
        },
      });
    });

    it('deletePublicUpload does not touch candidate.photoUrl for a non-personal-photo item', async () => {
      prisma.documentRequest.findUnique.mockResolvedValue(
        makeRequest({ status: DocumentRequestStatus.PARTIAL }),
      );
      prisma.documentUpload.findFirst.mockResolvedValue({
        id: 'up-1',
        fileKey: 'comp-1/documents/req-1/file.pdf',
        checklistItem: { isPersonalPhoto: false },
      });
      prisma.documentRequest.findUniqueOrThrow.mockResolvedValue(makeRequest());

      await service.deletePublicUpload('tok-1', 'item-a', 'up-1');

      expect(prisma.candidate.update).not.toHaveBeenCalled();
    });
  });
});

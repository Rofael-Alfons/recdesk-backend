import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as path from 'path';
import { DocumentRequestStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { CreateDocumentRequestDto, QueryDocumentRequestsDto } from './dto';
import {
  DocumentsEmailContext,
  DocumentsEmailService,
} from './documents-email.service';
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_PHOTO_EXTENSIONS,
  ALLOWED_PHOTO_MIME_TYPES,
  DOCUMENT_SIGNED_URL_TTL_SECONDS,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
} from './document-requests.constants';

const STATUS_LABEL: Record<DocumentRequestStatus, string> = {
  PENDING: 'pending',
  PARTIAL: 'partially submitted',
  COMPLETE: 'complete',
  EXPIRED: 'expired',
};

@Injectable()
export class DocumentRequestsService {
  private readonly logger = new Logger(DocumentRequestsService.name);
  private readonly frontendUrl: string;
  private readonly retentionDays: number;
  private readonly linkExpiryDays: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private documentsEmail: DocumentsEmailService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('frontend.url') || 'http://localhost:3001';
    this.retentionDays =
      this.configService.get<number>('documents.retentionDays') ?? 365;
    this.linkExpiryDays =
      this.configService.get<number>('documents.linkExpiryDays') ?? 14;
  }

  // ---------------------------------------------------------------------------
  // Staff actions
  // ---------------------------------------------------------------------------

  async create(dto: CreateDocumentRequestDto, user: CurrentUserData) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, companyId: user.companyId },
      select: { id: true, fullName: true, email: true, jobId: true },
    });
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    if (!candidate.email) {
      throw new BadRequestException('Candidate does not have an email address');
    }
    if (dto.items.filter((i) => i.isPersonalPhoto).length > 1) {
      throw new BadRequestException(
        'Only one checklist item can be marked as the personal photo',
      );
    }

    const now = new Date();
    const expiresInDays = dto.expiresInDays ?? this.linkExpiryDays;
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
    const retentionExpiresAt = new Date(
      now.getTime() + this.retentionDays * 24 * 60 * 60 * 1000,
    );
    const token = this.generateToken();

    const request = await this.prisma.documentRequest.create({
      data: {
        companyId: user.companyId,
        candidateId: candidate.id,
        jobId: dto.jobId ?? candidate.jobId ?? null,
        createdById: user.id,
        token,
        expiresAt,
        retentionExpiresAt,
        message: dto.message,
        items: {
          createMany: {
            data: dto.items.map((item, index) => ({
              name: item.name,
              description: item.description,
              required: item.required ?? true,
              isPersonalPhoto: item.isPersonalPhoto ?? false,
              orderIndex: index,
            })),
          },
        },
      },
      include: this.detailInclude(),
    });

    const result = await this.documentsEmail.sendUploadLink(
      await this.emailContext(request),
      this.uploadLink(request.token),
    );
    if (!result.success) {
      throw new BadRequestException(
        result.error || 'Failed to send document request email',
      );
    }

    await this.prisma.candidateAction.create({
      data: {
        candidateId: candidate.id,
        userId: user.id,
        action: 'document_request_created',
        details: { documentRequestId: request.id },
      },
    });

    this.logger.log(
      `Document request ${request.id} created for candidate ${candidate.id}`,
    );
    return this.toDetail(request);
  }

  async listForCandidate(candidateId: string, companyId: string) {
    const requests = await this.prisma.documentRequest.findMany({
      where: { candidateId, companyId },
      include: this.detailInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => this.toDetail(r));
  }

  async listForCompany(query: QueryDocumentRequestsDto, companyId: string) {
    const { status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentRequestWhereInput = {
      companyId,
      ...(status && { status }),
      ...(search && {
        candidate: {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [requests, total] = await Promise.all([
      this.prisma.documentRequest.findMany({
        where,
        include: this.detailInclude(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.documentRequest.count({ where }),
    ]);

    return {
      data: requests.map((r) => this.toDetail(r)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOneForCompany(id: string, companyId: string) {
    const request = await this.prisma.documentRequest.findFirst({
      where: { id, companyId },
      include: this.detailInclude(),
    });
    if (!request) throw new NotFoundException('Document request not found');
    return this.toDetail(request);
  }

  async resend(id: string, user: CurrentUserData) {
    let request = await this.prisma.documentRequest.findFirst({
      where: { id, companyId: user.companyId },
      include: this.detailInclude(),
    });
    if (!request) throw new NotFoundException('Document request not found');

    // A link that already expired needs a fresh token + expiry, not a resend
    // of the dead one.
    if (request.status === DocumentRequestStatus.EXPIRED) {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + this.linkExpiryDays * 24 * 60 * 60 * 1000,
      );
      request = await this.prisma.documentRequest.update({
        where: { id: request.id },
        data: {
          token: this.generateToken(),
          expiresAt,
          status: DocumentRequestStatus.PENDING,
        },
        include: this.detailInclude(),
      });
    }

    const result = await this.documentsEmail.sendUploadLink(
      await this.emailContext(request),
      this.uploadLink(request.token),
    );
    if (!result.success) {
      throw new BadRequestException(
        result.error || 'Failed to send document request email',
      );
    }

    await this.prisma.documentRequest.update({
      where: { id: request.id },
      data: { lastNudgedAt: new Date() },
    });

    return { success: true };
  }

  async getDownloadUrl(uploadId: string, user: CurrentUserData) {
    const upload = await this.prisma.documentUpload.findFirst({
      where: {
        id: uploadId,
        checklistItem: { request: { companyId: user.companyId } },
      },
      include: {
        checklistItem: {
          include: { request: { select: { candidateId: true } } },
        },
      },
    });
    if (!upload) throw new NotFoundException('Document not found');

    const url = await this.storage.getSignedUrl(
      upload.fileKey,
      DOCUMENT_SIGNED_URL_TTL_SECONDS,
    );
    await this.prisma.candidateAction.create({
      data: {
        candidateId: upload.checklistItem.request.candidateId,
        userId: user.id,
        action: 'document_downloaded',
        details: { uploadId, fileName: upload.fileName },
      },
    });
    return { url };
  }

  async deleteDocument(uploadId: string, user: CurrentUserData) {
    const upload = await this.prisma.documentUpload.findFirst({
      where: {
        id: uploadId,
        checklistItem: { request: { companyId: user.companyId } },
      },
      include: {
        checklistItem: {
          include: { request: { select: { id: true, candidateId: true } } },
        },
      },
    });
    if (!upload) throw new NotFoundException('Document not found');

    await this.storage.deleteFile(upload.fileKey);
    await this.prisma.documentUpload.delete({ where: { id: upload.id } });
    await this.prisma.candidateAction.create({
      data: {
        candidateId: upload.checklistItem.request.candidateId,
        userId: user.id,
        action: 'document_deleted',
        details: { uploadId, fileName: upload.fileName },
      },
    });

    if (upload.checklistItem.isPersonalPhoto) {
      await this.syncCandidatePhotoAfterDelete(
        upload.checklistItem.request.candidateId,
        upload.checklistItemId,
      );
    }

    await this.recomputeStatus(upload.checklistItem.request.id);
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Public candidate upload
  // ---------------------------------------------------------------------------

  async getPublicByToken(token: string) {
    const request = await this.prisma.documentRequest.findUnique({
      where: { token },
      include: {
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
        company: { select: { name: true } },
        items: {
          orderBy: { orderIndex: 'asc' },
          include: { uploads: { orderBy: { uploadedAt: 'asc' } } },
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Upload link not found');
    }

    const expired =
      request.status === DocumentRequestStatus.EXPIRED ||
      request.expiresAt < new Date();

    return {
      status: request.status,
      expired,
      expiresAt: request.expiresAt,
      message: request.message,
      candidateFirstName:
        request.candidate.fullName.trim().split(/\s+/)[0] || 'there',
      jobTitle: request.job?.title ?? 'the role',
      companyName: request.company.name,
      items: request.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        required: item.required,
        isPersonalPhoto: item.isPersonalPhoto,
        uploads: item.uploads.map((u) => ({
          id: u.id,
          fileName: u.fileName,
          fileSize: u.fileSize,
          uploadedAt: u.uploadedAt,
        })),
      })),
    };
  }

  async uploadPublicDocument(
    token: string,
    itemId: string,
    file: Express.Multer.File,
  ) {
    const request = await this.prisma.documentRequest.findUnique({
      where: { token },
      include: this.detailInclude(),
    });
    if (!request) throw new NotFoundException('Upload link not found');
    if (
      request.status === DocumentRequestStatus.EXPIRED ||
      request.expiresAt < new Date()
    ) {
      throw new BadRequestException('This upload link has expired');
    }
    const item = request.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Checklist item not found');

    this.validateFile(file, item.isPersonalPhoto);

    const uploadResult = await this.storage.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      request.companyId,
      `documents/${request.id}`,
    );

    const upload = await this.prisma.documentUpload.create({
      data: {
        checklistItemId: item.id,
        fileKey: uploadResult.url,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });

    if (item.isPersonalPhoto) {
      await this.prisma.candidate.update({
        where: { id: request.candidateId },
        data: { photoUrl: upload.fileKey, photoFileName: upload.fileName },
      });
    }

    await this.recomputeStatus(request.id);
    return this.getPublicByToken(token);
  }

  async deletePublicUpload(token: string, itemId: string, uploadId: string) {
    const request = await this.prisma.documentRequest.findUnique({
      where: { token },
      select: { id: true, candidateId: true, status: true, expiresAt: true },
    });
    if (!request) throw new NotFoundException('Upload link not found');
    if (
      request.status === DocumentRequestStatus.EXPIRED ||
      request.expiresAt < new Date()
    ) {
      throw new BadRequestException('This upload link has expired');
    }

    const upload = await this.prisma.documentUpload.findFirst({
      where: {
        id: uploadId,
        checklistItemId: itemId,
        checklistItem: { requestId: request.id },
      },
      include: { checklistItem: { select: { isPersonalPhoto: true } } },
    });
    if (!upload) throw new NotFoundException('Document not found');

    await this.storage.deleteFile(upload.fileKey);
    await this.prisma.documentUpload.delete({ where: { id: upload.id } });

    if (upload.checklistItem.isPersonalPhoto) {
      await this.syncCandidatePhotoAfterDelete(request.candidateId, itemId);
    }

    await this.recomputeStatus(request.id);
    return this.getPublicByToken(token);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private generateToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private uploadLink(token: string): string {
    return `${this.frontendUrl}/documents/${token}`;
  }

  private validateFile(file: Express.Multer.File, isPersonalPhoto: boolean) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 10MB limit');
    }
    const allowedExtensions = isPersonalPhoto
      ? ALLOWED_PHOTO_EXTENSIONS
      : ALLOWED_DOCUMENT_EXTENSIONS;
    const allowedMimeTypes = isPersonalPhoto
      ? ALLOWED_PHOTO_MIME_TYPES
      : ALLOWED_DOCUMENT_MIME_TYPES;
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      !allowedExtensions.includes(ext) ||
      !allowedMimeTypes.includes(file.mimetype)
    ) {
      throw new BadRequestException(
        isPersonalPhoto
          ? `Personal photo must be an image. Allowed: ${allowedExtensions.join(', ')}`
          : `Unsupported file type. Allowed: ${allowedExtensions.join(', ')}`,
      );
    }
  }

  /**
   * Called after deleting an upload that belonged to the request's
   * personal-photo item. Falls back to the next most recent remaining
   * upload under that same item if one exists, otherwise clears the photo.
   */
  private async syncCandidatePhotoAfterDelete(
    candidateId: string,
    checklistItemId: string,
  ) {
    const next = await this.prisma.documentUpload.findFirst({
      where: { checklistItemId },
      orderBy: { uploadedAt: 'desc' },
    });
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: next
        ? { photoUrl: next.fileKey, photoFileName: next.fileName }
        : { photoUrl: null, photoFileName: null },
    });
  }

  /**
   * Recomputes the overall status from the items' fulfillment (>=1 upload
   * each). Only fires the recruiter email when status actually transitions,
   * so a candidate uploading several files in one sitting sends one email,
   * not one per file. In-app notification fires on every upload.
   */
  private async recomputeStatus(requestId: string) {
    const request = await this.prisma.documentRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: this.detailInclude(),
    });

    const requiredItems = request.items.filter((i) => i.required);
    const fulfilledRequired = requiredItems.filter((i) => i.uploads.length > 0);
    const anyUploaded = request.items.some((i) => i.uploads.length > 0);

    let nextStatus: DocumentRequestStatus;
    if (!requiredItems.length) {
      nextStatus = anyUploaded
        ? DocumentRequestStatus.COMPLETE
        : DocumentRequestStatus.PENDING;
    } else if (fulfilledRequired.length === 0) {
      nextStatus = anyUploaded
        ? DocumentRequestStatus.PARTIAL
        : DocumentRequestStatus.PENDING;
    } else if (fulfilledRequired.length === requiredItems.length) {
      nextStatus = DocumentRequestStatus.COMPLETE;
    } else {
      nextStatus = DocumentRequestStatus.PARTIAL;
    }

    const statusChanged = nextStatus !== request.status;
    const now = new Date();

    await this.prisma.documentRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        completedAt:
          nextStatus === DocumentRequestStatus.COMPLETE
            ? (request.completedAt ?? now)
            : null,
        // Retention clock restarts from "candidate finished submitting".
        retentionExpiresAt:
          nextStatus === DocumentRequestStatus.COMPLETE && !request.completedAt
            ? new Date(now.getTime() + this.retentionDays * 24 * 60 * 60 * 1000)
            : undefined,
      },
    });

    await this.notifications.createNotification({
      type: NotificationType.DOCUMENT_UPLOADED,
      companyId: request.companyId,
      userId: request.createdById,
      title: 'Document uploaded',
      message: `${request.candidate.fullName} uploaded a document for the ${request.job?.title ?? 'offered'} role.`,
      metadata: { documentRequestId: request.id, status: nextStatus },
    });

    if (statusChanged && request.createdBy?.email) {
      try {
        await this.documentsEmail.sendRecruiterNotification(
          await this.emailContext(request),
          STATUS_LABEL[nextStatus],
          `${this.frontendUrl}/candidates/${request.candidateId}`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to email recruiter for document request ${request.id}: ${error.message}`,
        );
      }
    }
  }

  private detailInclude() {
    return {
      candidate: { select: { id: true, fullName: true, email: true } },
      job: { select: { id: true, title: true } },
      createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      company: { select: { name: true } },
      items: {
        orderBy: { orderIndex: 'asc' as const },
        include: { uploads: { orderBy: { uploadedAt: 'asc' as const } } },
      },
    };
  }

  private async emailContext(
    request: DocumentRequestWithDetail,
  ): Promise<DocumentsEmailContext> {
    return {
      candidateName: request.candidate.fullName,
      candidateEmail: request.candidate.email ?? '',
      jobTitle: request.job?.title ?? 'the role',
      companyName: request.company.name,
      recruiterName: request.createdBy
        ? `${request.createdBy.firstName} ${request.createdBy.lastName}`
        : undefined,
      recruiterEmail: request.createdBy?.email,
      message: request.message,
    };
  }

  private toDetail(request: DocumentRequestWithDetail) {
    return {
      id: request.id,
      status: request.status,
      expiresAt: request.expiresAt,
      retentionExpiresAt: request.retentionExpiresAt,
      message: request.message,
      completedAt: request.completedAt,
      createdAt: request.createdAt,
      candidate: request.candidate,
      job: request.job,
      uploadLink: this.uploadLink(request.token),
      items: request.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        required: item.required,
        isPersonalPhoto: item.isPersonalPhoto,
        uploads: item.uploads.map((u) => ({
          id: u.id,
          fileName: u.fileName,
          fileSize: u.fileSize,
          mimeType: u.mimeType,
          uploadedAt: u.uploadedAt,
        })),
      })),
    };
  }
}

// Shape returned by detailInclude(); kept loose to avoid Prisma type gymnastics.
type DocumentRequestWithDetail = {
  id: string;
  status: DocumentRequestStatus;
  token: string;
  expiresAt: Date;
  retentionExpiresAt: Date;
  message: string | null;
  completedAt: Date | null;
  createdAt: Date;
  companyId: string;
  candidateId: string;
  createdById: string;
  candidate: { id: string; fullName: string; email: string | null };
  job: { id: string; title: string } | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  company: { name: string };
  items: {
    id: string;
    name: string;
    description: string | null;
    required: boolean;
    isPersonalPhoto: boolean;
    uploads: {
      id: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      uploadedAt: Date;
      fileKey: string;
    }[];
  }[];
};

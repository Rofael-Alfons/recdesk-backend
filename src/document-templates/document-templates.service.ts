import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDocumentTemplateItemDto,
  UpdateDocumentTemplateItemDto,
} from './dto';

// Matches today's hardcoded PRESETS/DEFAULT_ITEMS in
// request-documents-dialog.tsx — seeded so behavior doesn't change until a
// recruiter edits the list themselves.
export const DEFAULT_TEMPLATE_ITEMS = [
  { name: 'National ID (front + back)', required: true, includeByDefault: true },
  { name: 'Educational Certificate', required: true, includeByDefault: false },
  { name: 'Proof of Address', required: true, includeByDefault: false },
];

@Injectable()
export class DocumentTemplatesService {
  private readonly logger = new Logger(DocumentTemplatesService.name);

  constructor(private prisma: PrismaService) {}

  async list(companyId: string) {
    return this.prisma.documentTemplateItem.findMany({
      where: { companyId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async create(dto: CreateDocumentTemplateItemDto, companyId: string) {
    const last = await this.prisma.documentTemplateItem.findFirst({
      where: { companyId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    // Only one preset can be the personal photo — unset any other before
    // writing this one, mirroring EmailTemplate.isDefault's exclusivity.
    if (dto.isPersonalPhoto) {
      await this.prisma.documentTemplateItem.updateMany({
        where: { companyId, isPersonalPhoto: true },
        data: { isPersonalPhoto: false },
      });
    }

    return this.prisma.documentTemplateItem.create({
      data: {
        name: dto.name,
        description: dto.description,
        required: dto.required ?? true,
        includeByDefault: dto.includeByDefault ?? true,
        isPersonalPhoto: dto.isPersonalPhoto ?? false,
        orderIndex: (last?.orderIndex ?? -1) + 1,
        companyId,
      },
    });
  }

  async update(id: string, dto: UpdateDocumentTemplateItemDto, companyId: string) {
    const existing = await this.prisma.documentTemplateItem.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException('Document template item not found');
    }

    if (dto.isPersonalPhoto) {
      await this.prisma.documentTemplateItem.updateMany({
        where: { companyId, isPersonalPhoto: true, id: { not: id } },
        data: { isPersonalPhoto: false },
      });
    }

    return this.prisma.documentTemplateItem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.required !== undefined && { required: dto.required }),
        ...(dto.includeByDefault !== undefined && {
          includeByDefault: dto.includeByDefault,
        }),
        ...(dto.isPersonalPhoto !== undefined && {
          isPersonalPhoto: dto.isPersonalPhoto,
        }),
        ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
      },
    });
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.documentTemplateItem.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException('Document template item not found');
    }

    await this.prisma.documentTemplateItem.delete({ where: { id } });
    return { message: 'Document template item deleted successfully' };
  }

  /**
   * Seeds a company with the current default checklist presets. Called at
   * company-creation time; idempotent (no-op if the company already has any
   * template items) so it's also safe to run as a one-off backfill.
   */
  async createDefaultDocumentTemplates(companyId: string) {
    const existingCount = await this.prisma.documentTemplateItem.count({
      where: { companyId },
    });
    if (existingCount > 0) {
      return { created: 0, skipped: DEFAULT_TEMPLATE_ITEMS.length };
    }

    await this.prisma.documentTemplateItem.createMany({
      data: DEFAULT_TEMPLATE_ITEMS.map((item, index) => ({
        ...item,
        orderIndex: index,
        companyId,
      })),
    });

    this.logger.log(`Seeded default document checklist items for company ${companyId}`);
    return { created: DEFAULT_TEMPLATE_ITEMS.length, skipped: 0 };
  }
}

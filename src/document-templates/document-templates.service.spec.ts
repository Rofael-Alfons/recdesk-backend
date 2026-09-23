import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DocumentTemplatesService } from './document-templates.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DocumentTemplatesService', () => {
  let service: DocumentTemplatesService;
  let prisma: any;

  const companyId = 'comp-1';

  beforeEach(async () => {
    prisma = {
      documentTemplateItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentTemplatesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DocumentTemplatesService);
  });

  describe('list', () => {
    it('orders by orderIndex ascending, scoped to the company', async () => {
      prisma.documentTemplateItem.findMany.mockResolvedValue([]);

      await service.list(companyId);

      expect(prisma.documentTemplateItem.findMany).toHaveBeenCalledWith({
        where: { companyId },
        orderBy: { orderIndex: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('assigns the next orderIndex after the current max', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue({ orderIndex: 4 });
      prisma.documentTemplateItem.create.mockResolvedValue({ id: 'item-1' });

      await service.create({ name: 'Passport' }, companyId);

      expect(prisma.documentTemplateItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ orderIndex: 5, companyId }),
      });
    });

    it('starts at orderIndex 0 when the company has no items yet', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue(null);
      prisma.documentTemplateItem.create.mockResolvedValue({ id: 'item-1' });

      await service.create({ name: 'Passport' }, companyId);

      expect(prisma.documentTemplateItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ orderIndex: 0 }),
      });
    });

    it('defaults required and includeByDefault to true', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue(null);
      prisma.documentTemplateItem.create.mockResolvedValue({ id: 'item-1' });

      await service.create({ name: 'Passport' }, companyId);

      expect(prisma.documentTemplateItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ required: true, includeByDefault: true }),
      });
    });

    it('defaults isPersonalPhoto to false', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue(null);
      prisma.documentTemplateItem.create.mockResolvedValue({ id: 'item-1' });

      await service.create({ name: 'Passport' }, companyId);

      expect(prisma.documentTemplateItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isPersonalPhoto: false }),
      });
    });

    it('unsets isPersonalPhoto on other company items when creating a new personal-photo item', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue(null);
      prisma.documentTemplateItem.create.mockResolvedValue({ id: 'item-1' });

      await service.create({ name: 'Headshot', isPersonalPhoto: true }, companyId);

      expect(prisma.documentTemplateItem.updateMany).toHaveBeenCalledWith({
        where: { companyId, isPersonalPhoto: true },
        data: { isPersonalPhoto: false },
      });
      expect(prisma.documentTemplateItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isPersonalPhoto: true }),
      });
    });

    it('does not touch other items when isPersonalPhoto is not set', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue(null);
      prisma.documentTemplateItem.create.mockResolvedValue({ id: 'item-1' });

      await service.create({ name: 'Passport' }, companyId);

      expect(prisma.documentTemplateItem.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws when the item does not belong to the company', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue(null);

      await expect(
        service.update('item-1', { name: 'New name' }, companyId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.documentTemplateItem.update).not.toHaveBeenCalled();
    });

    it('supports swapping orderIndex for reordering', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue({ id: 'item-1', companyId });
      prisma.documentTemplateItem.update.mockResolvedValue({});

      await service.update('item-1', { orderIndex: 2 }, companyId);

      expect(prisma.documentTemplateItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { orderIndex: 2 },
      });
    });

    it('unsets isPersonalPhoto on other items (excluding self) when updating to true', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue({ id: 'item-1', companyId });
      prisma.documentTemplateItem.update.mockResolvedValue({});

      await service.update('item-1', { isPersonalPhoto: true }, companyId);

      expect(prisma.documentTemplateItem.updateMany).toHaveBeenCalledWith({
        where: { companyId, isPersonalPhoto: true, id: { not: 'item-1' } },
        data: { isPersonalPhoto: false },
      });
      expect(prisma.documentTemplateItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { isPersonalPhoto: true },
      });
    });

    it('does not touch other items when isPersonalPhoto is not set in the update', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue({ id: 'item-1', companyId });
      prisma.documentTemplateItem.update.mockResolvedValue({});

      await service.update('item-1', { name: 'New name' }, companyId);

      expect(prisma.documentTemplateItem.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws when the item does not belong to the company', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue(null);

      await expect(service.remove('item-1', companyId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.documentTemplateItem.delete).not.toHaveBeenCalled();
    });

    it('deletes the item scoped to the company', async () => {
      prisma.documentTemplateItem.findFirst.mockResolvedValue({ id: 'item-1', companyId });

      const result = await service.remove('item-1', companyId);

      expect(prisma.documentTemplateItem.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
      expect(result.message).toContain('deleted');
    });
  });

  describe('createDefaultDocumentTemplates', () => {
    it('seeds the 3 default items when the company has none', async () => {
      prisma.documentTemplateItem.count.mockResolvedValue(0);

      const result = await service.createDefaultDocumentTemplates(companyId);

      expect(prisma.documentTemplateItem.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'National ID (front + back)', companyId }),
        ]),
      });
      expect(result.created).toBe(3);
    });

    it('is a no-op when the company already has template items', async () => {
      prisma.documentTemplateItem.count.mockResolvedValue(2);

      const result = await service.createDefaultDocumentTemplates(companyId);

      expect(prisma.documentTemplateItem.createMany).not.toHaveBeenCalled();
      expect(result.created).toBe(0);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EmailTemplateType } from './dto';
import { EmailTemplatesService } from './email-templates.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EmailTemplatesService', () => {
  let service: EmailTemplatesService;
  let prisma: any;

  const companyId = 'comp-1';

  beforeEach(async () => {
    prisma = {
      emailTemplate: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(EmailTemplatesService);
  });

  describe('create', () => {
    it('unsets existing default when creating a new default template', async () => {
      prisma.emailTemplate.create.mockResolvedValue({ id: 'tpl-1' });

      await service.create(
        {
          name: 'Rejection',
          subject: 'Update',
          body: 'Body',
          type: EmailTemplateType.REJECTION,
          isDefault: true,
        },
        companyId,
      );

      expect(prisma.emailTemplate.updateMany).toHaveBeenCalledWith({
        where: {
          type: EmailTemplateType.REJECTION,
          isDefault: true,
          companyId,
        },
        data: { isDefault: false },
      });
    });
  });

  describe('findOne', () => {
    it('throws when template is missing', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing', companyId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes template scoped to company', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' });

      const result = await service.remove('tpl-1', companyId);

      expect(result.message).toContain('deleted');
      expect(prisma.emailTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
      });
    });
  });

  describe('seedDefaults', () => {
    it('creates templates that do not already exist', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(null);
      prisma.emailTemplate.create.mockResolvedValue({ id: 'new' });

      const result = await service.seedDefaults(companyId);

      expect(result.created).toBeGreaterThan(0);
      expect(result.skipped).toBe(0);
    });

    it('skips templates that already exist', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.seedDefaults(companyId);

      expect(result.created).toBe(0);
      expect(result.skipped).toBeGreaterThan(0);
    });
  });

  describe('getAvailableTokens', () => {
    it('returns personalization token catalog', () => {
      const tokens = service.getAvailableTokens();

      expect(tokens.some((t) => t.token === '{{candidate_name}}')).toBe(true);
      expect(tokens.some((t) => t.token === '{{job_title}}')).toBe(true);
    });
  });
});

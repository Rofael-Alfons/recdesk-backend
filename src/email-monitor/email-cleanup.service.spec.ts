import { Test, TestingModule } from '@nestjs/testing';
import { EmailCleanupService } from './email-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EmailCleanupService', () => {
  let service: EmailCleanupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      emailImport: {
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailCleanupService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(EmailCleanupService);
  });

  describe('cleanupOldSkippedEmails', () => {
    it('deletes SKIPPED records older than retention window', async () => {
      await service.cleanupOldSkippedEmails();

      expect(prisma.emailImport.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'SKIPPED',
          createdAt: { lt: expect.any(Date) },
        },
      });
    });
  });

  describe('purgeLingeringEmailBodies', () => {
    it('nulls body fields on old records with lingering content', async () => {
      await service.purgeLingeringEmailBodies();

      expect(prisma.emailImport.updateMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: expect.any(Date) },
          OR: [{ bodyText: { not: null } }, { bodyHtml: { not: null } }],
        },
        data: { bodyText: null, bodyHtml: null },
      });
    });
  });
});

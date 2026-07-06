import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  EDITABLE_PERMISSIONS,
} from '../common/permissions';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      rolePermission: {
        findMany: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PermissionsService);
  });

  describe('getUserPermissions', () => {
    it('returns all permissions for ADMIN', async () => {
      const result = await service.getUserPermissions('comp-1', UserRole.ADMIN);
      expect(result).toEqual([...ALL_PERMISSIONS]);
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('returns defaults when company has no configured permissions', async () => {
      prisma.rolePermission.findMany.mockResolvedValue([]);
      prisma.rolePermission.count.mockResolvedValue(0);

      const result = await service.getUserPermissions(
        'comp-1',
        UserRole.RECRUITER,
      );

      expect(result).toEqual([...DEFAULT_ROLE_PERMISSIONS.RECRUITER]);
    });

    it('returns stored permissions when company is configured', async () => {
      prisma.rolePermission.findMany.mockResolvedValue([
        { permission: 'manageJobs' },
        { permission: 'uploadCVs' },
      ]);
      prisma.rolePermission.count.mockResolvedValue(3);

      const result = await service.getUserPermissions(
        'comp-1',
        UserRole.RECRUITER,
      );

      expect(result).toEqual(['manageJobs', 'uploadCVs']);
    });
  });

  describe('getMatrix', () => {
    it('returns default matrix when company has not customized', async () => {
      prisma.rolePermission.count.mockResolvedValue(0);

      const matrix = await service.getMatrix('comp-1');

      expect(matrix.RECRUITER).toEqual([
        ...DEFAULT_ROLE_PERMISSIONS.RECRUITER,
      ]);
      expect(matrix.HIRING_MANAGER).toEqual([
        ...DEFAULT_ROLE_PERMISSIONS.HIRING_MANAGER,
      ]);
      expect(matrix.VIEWER).toEqual([...DEFAULT_ROLE_PERMISSIONS.VIEWER]);
    });

    it('returns configured matrix filtered to editable permissions', async () => {
      prisma.rolePermission.count.mockResolvedValue(2);
      prisma.rolePermission.findMany.mockResolvedValue([
        { role: UserRole.RECRUITER, permission: 'manageJobs' },
        { role: UserRole.RECRUITER, permission: 'manageTeam' },
        { role: UserRole.VIEWER, permission: 'reviewCandidates' },
      ]);

      const matrix = await service.getMatrix('comp-1');

      expect(matrix.RECRUITER).toEqual(['manageJobs']);
      expect(matrix.VIEWER).toEqual(['reviewCandidates']);
      expect(matrix.HIRING_MANAGER).toEqual([]);
    });
  });

  describe('setMatrix', () => {
    it('replaces configurable roles and ignores locked permissions', async () => {
      prisma.rolePermission.count.mockResolvedValue(1);
      prisma.rolePermission.findMany.mockResolvedValue([
        { role: UserRole.RECRUITER, permission: 'uploadCVs' },
      ]);

      const result = await service.setMatrix('comp-1', {
        RECRUITER: ['manageJobs', 'manageTeam', 'uploadCVs'],
        HIRING_MANAGER: ['reviewCandidates'],
        VIEWER: [],
      });

      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: {
          companyId: 'comp-1',
          role: { in: ['RECRUITER', 'HIRING_MANAGER', 'VIEWER'] },
        },
      });
      expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          { companyId: 'comp-1', role: UserRole.RECRUITER, permission: 'manageJobs' },
          { companyId: 'comp-1', role: UserRole.RECRUITER, permission: 'uploadCVs' },
          {
            companyId: 'comp-1',
            role: UserRole.HIRING_MANAGER,
            permission: 'reviewCandidates',
          },
        ]),
      });
      expect(result.RECRUITER).toEqual(['uploadCVs']);
      expect(EDITABLE_PERMISSIONS).not.toContain('manageTeam');
    });
  });
});

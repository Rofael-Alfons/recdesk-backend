import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  EDITABLE_PERMISSIONS,
  PermissionKey,
  PermissionMatrix,
} from '../common/permissions';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolves the effective permission keys for a single user. Admins always
   * hold every permission. Non-admins get their company's configured set, or
   * the code defaults if the company has not customized anything yet.
   */
  async getUserPermissions(
    companyId: string,
    role: UserRole,
  ): Promise<PermissionKey[]> {
    if (role === UserRole.ADMIN) {
      return [...ALL_PERMISSIONS];
    }

    const rows = await this.prisma.rolePermission.findMany({
      where: { companyId, role },
    });

    // No rows for this company at all -> fall back to defaults. Once a company
    // saves its matrix, every non-admin role gets explicit rows.
    const companyConfigured = await this.prisma.rolePermission.count({
      where: { companyId },
    });

    if (companyConfigured === 0) {
      return [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])];
    }

    return rows
      .map((r) => r.permission as PermissionKey)
      .filter((p) => ALL_PERMISSIONS.includes(p));
  }

  /**
   * Returns the effective matrix for all non-admin roles (defaults when the
   * company hasn't customized anything).
   */
  async getMatrix(companyId: string): Promise<PermissionMatrix> {
    const configured = await this.prisma.rolePermission.count({
      where: { companyId },
    });

    const matrix: PermissionMatrix = {};

    if (configured === 0) {
      for (const role of CONFIGURABLE_ROLES) {
        matrix[role] = [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])];
      }
      return matrix;
    }

    const rows = await this.prisma.rolePermission.findMany({
      where: { companyId },
    });

    for (const role of CONFIGURABLE_ROLES) {
      matrix[role] = rows
        .filter((r) => r.role === role)
        .map((r) => r.permission as PermissionKey)
        .filter((p) => EDITABLE_PERMISSIONS.includes(p));
    }

    return matrix;
  }

  /**
   * Replaces the stored matrix for a company. Only editable permissions and
   * configurable (non-admin) roles are persisted; anything else is ignored so
   * locked/admin permissions can never be granted or revoked here.
   */
  async setMatrix(
    companyId: string,
    matrix: PermissionMatrix,
  ): Promise<PermissionMatrix> {
    const creates: { companyId: string; role: UserRole; permission: string }[] =
      [];

    for (const role of CONFIGURABLE_ROLES) {
      const requested = matrix[role] ?? [];
      const sanitized = Array.from(new Set(requested)).filter((p) =>
        EDITABLE_PERMISSIONS.includes(p as PermissionKey),
      );
      for (const permission of sanitized) {
        creates.push({ companyId, role, permission });
      }
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: { companyId, role: { in: CONFIGURABLE_ROLES } },
      }),
      ...(creates.length > 0
        ? [this.prisma.rolePermission.createMany({ data: creates })]
        : []),
    ]);

    return this.getMatrix(companyId);
  }
}

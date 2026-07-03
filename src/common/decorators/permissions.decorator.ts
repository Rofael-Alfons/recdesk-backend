import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../permissions';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Require the current user to hold ALL of the given permission keys. Enforced
 * by PermissionsGuard against the permissions resolved in the JWT strategy.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

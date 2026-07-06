import { UserRole } from '@prisma/client';

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  RECRUITER: 'Recruiter',
  HIRING_MANAGER: 'Hiring Manager',
  VIEWER: 'Viewer',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

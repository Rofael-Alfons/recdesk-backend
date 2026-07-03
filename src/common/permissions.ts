import { UserRole } from '@prisma/client';

/**
 * Canonical permission keys used across the app. Kept in sync with the
 * frontend catalog in recdesk-frontend/src/lib/roles.ts.
 */
export const ALL_PERMISSIONS = [
  'manageJobs',
  'manageCandidates',
  'reviewCandidates',
  'uploadCVs',
  'sendEmails',
  'manageIntegrations',
  'manageTemplates',
  'manageTeam',
  'editCompany',
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number];

/**
 * Permissions an Admin can grant/revoke per role, per company. The two locked
 * permissions (`manageTeam`, `editCompany`) are intentionally excluded: they
 * stay Admin-only to prevent privilege escalation and admin lockout.
 */
export const EDITABLE_PERMISSIONS: PermissionKey[] = [
  'manageJobs',
  'manageCandidates',
  'reviewCandidates',
  'uploadCVs',
  'sendEmails',
  'manageIntegrations',
  'manageTemplates',
];

/** Admin-only permissions that are never editable. */
export const LOCKED_PERMISSIONS: PermissionKey[] = ['manageTeam', 'editCompany'];

/**
 * Default permission sets used until a company customizes its matrix. These
 * mirror the previous hardcoded @Roles enforcement. Admin implicitly holds all
 * permissions and is not represented here.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  Exclude<UserRole, 'ADMIN'>,
  PermissionKey[]
> = {
  RECRUITER: [
    'manageJobs',
    'manageCandidates',
    'reviewCandidates',
    'uploadCVs',
    'sendEmails',
    'manageIntegrations',
    'manageTemplates',
  ],
  HIRING_MANAGER: ['reviewCandidates'],
  VIEWER: [],
};

/** Non-admin roles that appear in the editable matrix (column order). */
export const CONFIGURABLE_ROLES: Exclude<UserRole, 'ADMIN'>[] = [
  'RECRUITER',
  'HIRING_MANAGER',
  'VIEWER',
];

interface PermissionMeta {
  label: string;
  description: string;
  group: string;
}

/** UI metadata for each editable permission, grouped by product area. */
export const PERMISSION_META: Record<PermissionKey, PermissionMeta> = {
  manageJobs: {
    label: 'Manage jobs',
    description: 'Create, edit, and delete job postings.',
    group: 'Jobs',
  },
  manageCandidates: {
    label: 'Manage candidates',
    description: 'Add, edit, delete, tag, assign, and rescore candidates.',
    group: 'Candidates',
  },
  reviewCandidates: {
    label: 'Review candidates',
    description: 'Add notes and change candidate status (shortlist/reject).',
    group: 'Candidates',
  },
  uploadCVs: {
    label: 'Upload CVs',
    description: 'Bulk upload CV files for parsing and scoring.',
    group: 'Candidates',
  },
  sendEmails: {
    label: 'Send emails',
    description: 'Send and bulk-send emails to candidates.',
    group: 'Communication',
  },
  manageTemplates: {
    label: 'Manage email templates',
    description: 'Create and edit email templates.',
    group: 'Communication',
  },
  manageIntegrations: {
    label: 'Manage integrations',
    description: 'Connect and manage Gmail/Outlook integrations.',
    group: 'Integrations',
  },
  manageTeam: {
    label: 'Manage team',
    description: 'Invite, update, and deactivate members (Admin only).',
    group: 'Administration',
  },
  editCompany: {
    label: 'Edit company settings',
    description: 'Update company profile and settings (Admin only).',
    group: 'Administration',
  },
};

export type PermissionMatrix = Record<string, PermissionKey[]>;

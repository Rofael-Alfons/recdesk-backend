import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllowlistEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Gates registration and login against the `allowed_emails` table.
 *
 * An email is permitted when either:
 *   - an exact EMAIL entry matches the full address, or
 *   - a DOMAIN entry matches the address' domain (e.g. entry "acme.com"
 *     allows "anyone@acme.com").
 *
 * On startup the service can seed initial entries from the comma-separated
 * `AUTH_ALLOWLIST` env var so the first admins can get in before the table is
 * populated. Values starting with "@" (or plain domains) are stored as DOMAIN
 * entries; everything containing a local part is stored as an EMAIL entry.
 */
@Injectable()
export class AllowlistService implements OnModuleInit {
  private readonly logger = new Logger(AllowlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrapFromEnv();
  }

  /**
   * Returns true when the given email is permitted to register or sign in.
   */
  async isAllowed(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      return false;
    }

    const domain = normalized.slice(normalized.lastIndexOf('@') + 1);

    const match = await this.prisma.allowedEmail.findFirst({
      where: {
        OR: [
          { type: AllowlistEntryType.EMAIL, value: normalized },
          { type: AllowlistEntryType.DOMAIN, value: domain },
        ],
      },
      select: { id: true },
    });

    return match !== null;
  }

  /**
   * Ensures the given email is permitted (adds an exact EMAIL entry if not
   * already covered). Used when inviting a teammate so they can accept the
   * invitation and log in regardless of the global allowlist configuration.
   */
  async allow(email: string, note = 'Invited teammate'): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      return;
    }

    // Skip if already allowed (exact email or domain match).
    if (await this.isAllowed(normalized)) {
      return;
    }

    await this.prisma.allowedEmail.upsert({
      where: { value: normalized },
      update: {},
      create: {
        value: normalized,
        type: AllowlistEntryType.EMAIL,
        note,
      },
    });
  }

  /**
   * List all allowlist entries (most recent first). Used by the platform admin
   * console.
   */
  async list() {
    return this.prisma.allowedEmail.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Add a raw allowlist token (email or domain) as a typed entry. Idempotent.
   * Returns the created/existing entry.
   */
  async add(rawValue: string, note?: string) {
    const entry = AllowlistService.normalizeEntry(rawValue);
    if (!entry) {
      return null;
    }

    return this.prisma.allowedEmail.upsert({
      where: { value: entry.value },
      update: {},
      create: {
        value: entry.value,
        type: entry.type,
        note: note ?? 'Added via platform admin',
      },
    });
  }

  /**
   * Remove an allowlist entry by id. Returns true if a row was deleted.
   */
  async removeById(id: string): Promise<boolean> {
    const result = await this.prisma.allowedEmail.deleteMany({
      where: { id },
    });
    return result.count > 0;
  }

  /**
   * Normalizes a raw allowlist token into a typed entry.
   * "@acme.com" or "acme.com" -> DOMAIN "acme.com"
   * "user@acme.com" -> EMAIL "user@acme.com"
   */
  static normalizeEntry(raw: string): {
    value: string;
    type: AllowlistEntryType;
  } | null {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('@')) {
      const domain = trimmed.slice(1);
      return domain
        ? { value: domain, type: AllowlistEntryType.DOMAIN }
        : null;
    }

    if (trimmed.includes('@')) {
      return { value: trimmed, type: AllowlistEntryType.EMAIL };
    }

    // No local part and no leading "@" -> treat as a bare domain.
    return trimmed.includes('.')
      ? { value: trimmed, type: AllowlistEntryType.DOMAIN }
      : null;
  }

  private async bootstrapFromEnv(): Promise<void> {
    const raw = this.configService.get<string>('auth.allowlist');
    if (!raw) {
      return;
    }

    const entries = raw
      .split(',')
      .map((token) => AllowlistService.normalizeEntry(token))
      .filter(
        (entry): entry is { value: string; type: AllowlistEntryType } =>
          entry !== null,
      );

    if (entries.length === 0) {
      return;
    }

    let seeded = 0;
    for (const entry of entries) {
      const result = await this.prisma.allowedEmail.upsert({
        where: { value: entry.value },
        update: {},
        create: {
          value: entry.value,
          type: entry.type,
          note: 'Seeded from AUTH_ALLOWLIST env',
        },
      });
      if (result) {
        seeded += 1;
      }
    }

    this.logger.log(
      `Allowlist bootstrap complete: ${seeded} entr${
        seeded === 1 ? 'y' : 'ies'
      } ensured from AUTH_ALLOWLIST.`,
    );
  }
}

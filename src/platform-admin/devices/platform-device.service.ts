import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const DEVICE_TOKEN_HEADER = 'x-admin-device-token';

@Injectable()
export class PlatformDeviceService {
  constructor(private prisma: PrismaService) {}

  /**
   * SHA-256 of a device token. Device tokens are high-entropy random secrets so
   * a fast hash is safe here (unlike low-entropy passwords) and lets us look up
   * by hash directly via the unique index.
   */
  static hashToken(token: string): string {
    return createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Returns the matching ACTIVE device for a raw token, or null. Also refreshes
   * lastSeenAt (best-effort, rate-limited) so operators can audit device usage.
   */
  async verifyToken(
    rawToken: string | undefined | null,
  ): Promise<{ id: string; name: string } | null> {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const tokenHash = PlatformDeviceService.hashToken(rawToken);
    const device = await this.prisma.platformDevice.findUnique({
      where: { tokenHash },
    });

    if (!device || !device.isActive) {
      return null;
    }

    // Rate-limit lastSeenAt writes to at most once per minute per device.
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    if (!device.lastSeenAt || device.lastSeenAt < oneMinuteAgo) {
      this.prisma.platformDevice
        .update({ where: { id: device.id }, data: { lastSeenAt: now } })
        .catch(() => {});
    }

    return { id: device.id, name: device.name };
  }
}

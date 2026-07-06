import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import {
  DEVICE_TOKEN_HEADER,
  PlatformDeviceService,
} from './platform-device.service';

/**
 * Gates ALL /api/admin/* routes (including login) behind device enrollment.
 * A request must carry a valid, active device token in the
 * `x-admin-device-token` header. Unknown/absent tokens get a generic 404 so the
 * console's existence is not revealed to unrecognized devices.
 *
 * Note: this runs as Express middleware (before Nest's guard/pipe pipeline), so
 * we respond directly rather than throwing, to avoid relying on the exception
 * filter for middleware-originated errors.
 */
@Injectable()
export class DeviceCheckMiddleware implements NestMiddleware {
  constructor(private readonly deviceService: PlatformDeviceService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const header = req.headers[DEVICE_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;

    const device = await this.deviceService.verifyToken(token);

    if (!device) {
      res.status(404).json({ statusCode: 404, message: 'Not Found' });
      return;
    }

    // Expose the recognized device to downstream handlers if needed.
    (req as Request & { platformDevice?: { id: string; name: string } }).platformDevice =
      device;
    next();
  }
}

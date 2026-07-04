import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Platform Admin - Device')
// @Public() bypasses the tenant JWT guard. Access is still gated by the
// DeviceCheckMiddleware (a request only reaches here with a valid device token).
@Public()
@Controller('admin/device')
export class PlatformDeviceController {
  @Get('verify')
  @ApiOperation({ summary: 'Verify the current device token (enrollment check)' })
  verify(@Req() req: Request) {
    const device = (
      req as Request & { platformDevice?: { id: string; name: string } }
    ).platformDevice;
    return { ok: true, device: device?.name ?? null };
  }
}

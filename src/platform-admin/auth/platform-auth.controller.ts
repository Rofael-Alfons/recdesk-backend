import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ThrottleAuth } from '../../common/decorators/throttle-auth.decorator';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformLoginDto, PlatformRefreshDto } from '../dto';
import { PlatformAuthGuard } from '../guards/platform-auth.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { CurrentAdminData } from '../decorators/current-admin.decorator';

@ApiTags('Platform Admin - Auth')
// @Public() bypasses the GLOBAL tenant JwtAuthGuard for the whole controller.
// Routes that must be authenticated apply PlatformAuthGuard explicitly.
@Public()
@Controller('admin/auth')
export class PlatformAuthController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @ThrottleAuth()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform admin login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: PlatformLoginDto) {
    return this.platformAuthService.login(dto);
  }

  @ThrottleAuth()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh platform admin tokens' })
  async refresh(@Body() dto: PlatformRefreshDto) {
    return this.platformAuthService.refreshTokens(dto);
  }

  @UseGuards(PlatformAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(@Body() dto: PlatformRefreshDto) {
    await this.platformAuthService.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(PlatformAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get the current platform admin' })
  async me(@CurrentAdmin() admin: CurrentAdminData) {
    return this.platformAuthService.me(admin.id);
  }
}

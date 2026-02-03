import {
  Controller,
  Get,
  Delete,
  Patch,
  Query,
  Param,
  Body,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { UpdateConnectionDto } from './dto/update-connection.dto';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private integrationsService: IntegrationsService,
    private configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all email connections' })
  @ApiResponse({ status: 200, description: 'Email connections retrieved' })
  async getConnections(@CurrentUser() user: CurrentUserData) {
    return this.integrationsService.getEmailConnections(user.companyId);
  }

  @Get('gmail/connect')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Get Gmail OAuth URL' })
  @ApiResponse({ status: 200, description: 'OAuth URL generated' })
  async connectGmail(@CurrentUser() user: CurrentUserData) {
    return this.integrationsService.getGmailAuthUrl(user.companyId, user.id);
  }

  @Public()
  @Get('gmail/callback')
  @ApiOperation({ summary: 'Handle Gmail OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend' })
  async gmailCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('frontend.url') || 'http://localhost:3000';

    if (error) {
      return res.redirect(
        `${frontendUrl}/integrations?error=${encodeURIComponent(error)}`,
      );
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/integrations?error=missing_params`);
    }

    try {
      const result = await this.integrationsService.handleGmailCallback(
        code,
        state,
      );
      return res.redirect(
        `${frontendUrl}/integrations?success=true&email=${encodeURIComponent(result.email)}`,
      );
    } catch (err) {
      console.error('Gmail callback error:', err);
      return res.redirect(
        `${frontendUrl}/integrations?error=connection_failed`,
      );
    }
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Update email connection settings' })
  @ApiResponse({ status: 200, description: 'Connection updated' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  async updateConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateConnectionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.integrationsService.updateConnection(
      id,
      user.companyId,
      updateDto,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Disconnect email integration' })
  @ApiResponse({ status: 200, description: 'Email disconnected' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  async disconnect(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.integrationsService.disconnectEmail(id, user.companyId);
  }
}

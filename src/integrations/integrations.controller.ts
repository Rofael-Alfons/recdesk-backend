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
  Logger,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { GmailPubsubService } from '../email-monitor/gmail-pubsub.service';
import { OutlookGraphService } from '../email-monitor/outlook-graph.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ConfigService } from '@nestjs/config';
import { UpdateConnectionDto } from './dto/update-connection.dto';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private integrationsService: IntegrationsService,
    private configService: ConfigService,
    @Optional()
    @Inject(forwardRef(() => GmailPubsubService))
    private gmailPubsubService?: GmailPubsubService,
    @Optional()
    @Inject(forwardRef(() => OutlookGraphService))
    private outlookGraphService?: OutlookGraphService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all email connections' })
  @ApiResponse({ status: 200, description: 'Email connections retrieved' })
  async getConnections(@CurrentUser() user: CurrentUserData) {
    return this.integrationsService.getEmailConnections(user.companyId);
  }

  // ==========================================
  // GMAIL
  // ==========================================

  @Get('gmail/connect')
  @RequirePermissions('manageIntegrations')
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

      // Set up Gmail Pub/Sub watch for real-time push notifications
      if (result.connectionId && this.gmailPubsubService?.isEnabled()) {
        this.gmailPubsubService
          .watchMailbox(result.connectionId)
          .catch((err) => {
            this.logger.error(
              `Failed to set up Gmail watch for connection ${result.connectionId}:`,
              err,
            );
          });
      }

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

  // ==========================================
  // OUTLOOK
  // ==========================================

  @Get('outlook/connect')
  @RequirePermissions('manageIntegrations')
  @ApiOperation({ summary: 'Get Outlook OAuth URL' })
  @ApiResponse({ status: 200, description: 'OAuth URL generated' })
  async connectOutlook(@CurrentUser() user: CurrentUserData) {
    return this.integrationsService.getOutlookAuthUrl(
      user.companyId,
      user.id,
    );
  }

  @Public()
  @Get('outlook/callback')
  @ApiOperation({ summary: 'Handle Outlook OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend' })
  async outlookCallback(
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
      const result = await this.integrationsService.handleOutlookCallback(
        code,
        state,
      );

      // Set up Graph change notification subscription
      if (result.connectionId && this.outlookGraphService?.isEnabled()) {
        this.outlookGraphService
          .createSubscription(result.connectionId)
          .catch((err) => {
            this.logger.error(
              `Failed to set up Outlook subscription for connection ${result.connectionId}:`,
              err,
            );
          });
      }

      return res.redirect(
        `${frontendUrl}/integrations?success=true&email=${encodeURIComponent(result.email)}`,
      );
    } catch (err) {
      console.error('Outlook callback error:', err);
      return res.redirect(
        `${frontendUrl}/integrations?error=connection_failed`,
      );
    }
  }

  // ==========================================
  // SHARED
  // ==========================================

  @Patch(':id')
  @RequirePermissions('manageIntegrations')
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
  @RequirePermissions('manageIntegrations')
  @ApiOperation({ summary: 'Disconnect email integration' })
  @ApiResponse({ status: 200, description: 'Email disconnected' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  async disconnect(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Look up the connection to determine provider
    const connections = await this.integrationsService.getEmailConnections(
      user.companyId,
    );
    const connection = connections.find((c) => c.id === id);

    if (connection?.provider === 'OUTLOOK') {
      // Clean up Graph subscription
      if (this.outlookGraphService) {
        try {
          await this.outlookGraphService.deleteSubscription(id);
        } catch (err) {
          this.logger.warn(
            `Failed to delete Outlook subscription during disconnect for connection ${id}:`,
            err,
          );
        }
      }
    } else {
      // Stop Gmail Pub/Sub watch before disconnecting
      if (this.gmailPubsubService) {
        try {
          await this.gmailPubsubService.stopWatch(id);
        } catch (err) {
          this.logger.warn(
            `Failed to stop Gmail watch during disconnect for connection ${id}:`,
            err,
          );
        }
      }
    }

    return this.integrationsService.disconnectEmail(id, user.companyId);
  }
}

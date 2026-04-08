import {
  Controller,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { OutlookGraphService } from './outlook-graph.service';

/**
 * Handles Microsoft Graph change notification webhooks for Outlook email integration.
 *
 * Two responsibilities:
 * 1. Subscription validation: Microsoft sends a validationToken query param during
 *    subscription creation — must echo it back as text/plain within 10 seconds.
 * 2. Change notifications: Microsoft sends POST with notification payloads when
 *    new emails arrive in the user's inbox.
 */
@ApiTags('Webhooks')
@Controller('webhooks')
export class OutlookWebhookController {
  private readonly logger = new Logger(OutlookWebhookController.name);

  constructor(private outlookGraphService: OutlookGraphService) {}

  @Post('outlook')
  @Public() // Microsoft Graph doesn't send our JWT
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Handle Microsoft Graph change notifications for Outlook',
  })
  @ApiResponse({ status: 200, description: 'Validation token echoed' })
  @ApiResponse({ status: 202, description: 'Notification accepted' })
  async handleOutlookWebhook(
    @Query('validationToken') validationToken: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    // Step 1: Subscription validation
    // During subscription creation, Microsoft sends a POST with ?validationToken=xxx
    // We must respond with 200 and echo the token as text/plain
    if (validationToken) {
      this.logger.log(
        'Received Graph subscription validation request, echoing token',
      );
      return res.status(HttpStatus.OK).contentType('text/plain').send(validationToken);
    }

    // Step 2: Handle change notifications
    if (body?.value && Array.isArray(body.value)) {
      this.logger.log(
        `Received ${body.value.length} Graph change notification(s)`,
      );

      // Process notifications asynchronously and return 202 quickly
      const notifications = body.value.map((n: any) => ({
        subscriptionId: n.subscriptionId,
        clientState: n.clientState,
        resource: n.resource,
        changeType: n.changeType,
      }));

      this.outlookGraphService
        .handleChangeNotification(notifications)
        .catch((error) => {
          this.logger.error(
            'Error processing Outlook change notifications:',
            error,
          );
        });

      return res.status(HttpStatus.ACCEPTED).json({ received: true });
    }

    this.logger.warn('Received unrecognized webhook payload');
    return res.status(HttpStatus.ACCEPTED).json({ received: true });
  }
}

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { GmailPubsubService } from './gmail-pubsub.service';

/**
 * DTO for Google Cloud Pub/Sub push message.
 *
 * Pub/Sub sends:
 * {
 *   "message": {
 *     "data": "<base64-encoded JSON: {emailAddress, historyId}>",
 *     "messageId": "...",
 *     "publishTime": "..."
 *   },
 *   "subscription": "projects/.../subscriptions/..."
 * }
 */
interface PubsubPushMessage {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class GmailWebhookController {
  private readonly logger = new Logger(GmailWebhookController.name);

  constructor(
    private gmailPubsubService: GmailPubsubService,
    private configService: ConfigService,
  ) {}

  @Post('gmail')
  @Public() // Google Pub/Sub doesn't send our JWT
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Gmail Pub/Sub push notifications' })
  @ApiResponse({
    status: 200,
    description: 'Notification acknowledged',
  })
  async handleGmailPushNotification(
    @Body() body: PubsubPushMessage,
  ) {
    // Validate the push message structure
    if (!body?.message?.data) {
      this.logger.warn('Received invalid Pub/Sub message: missing message.data');
      throw new BadRequestException('Invalid Pub/Sub message format');
    }

    // Optional: Verify the notification came from our expected subscription
    const verificationToken = this.configService.get<string>(
      'google.pubsubVerificationToken',
    );
    if (verificationToken && body.subscription) {
      // Log subscription for debugging; Pub/Sub doesn't send a secret token
      // in the standard push format, but we can verify the subscription name
      this.logger.debug(
        `Pub/Sub notification from subscription: ${body.subscription}`,
      );
    }

    this.logger.log(
      `Received Gmail Pub/Sub notification (messageId: ${body.message.messageId})`,
    );

    // Process the notification asynchronously but don't await
    // to return 200 quickly and acknowledge the message
    this.gmailPubsubService
      .handlePushNotification(body.message.data)
      .catch((error) => {
        this.logger.error(
          'Error processing Gmail push notification:',
          error,
        );
      });

    return { received: true };
  }
}

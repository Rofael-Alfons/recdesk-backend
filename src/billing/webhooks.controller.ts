import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private billingService: BillingService) {}

  @Post('stripe')
  @Public() // Stripe webhooks don't have our JWT
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const payload = req.rawBody;

    if (!payload) {
      throw new Error('No raw body found');
    }

    await this.billingService.handleWebhook(payload, signature);
    return { received: true };
  }
}

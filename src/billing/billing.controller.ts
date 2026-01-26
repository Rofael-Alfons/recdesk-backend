import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreatePortalDto } from './dto/create-portal.dto';

interface AuthUser {
  userId: string;
  companyId: string;
  email: string;
  role: string;
}

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get available subscription plans' })
  @ApiResponse({ status: 200, description: 'Returns list of subscription plans' })
  async getPlans(@CurrentUser() user: AuthUser) {
    return this.billingService.getPlans(user.companyId);
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get current subscription' })
  @ApiResponse({ status: 200, description: 'Returns current subscription details' })
  async getSubscription(@CurrentUser() user: AuthUser) {
    let subscription = await this.billingService.getSubscription(user.companyId);
    
    // Auto-create trial subscription if none exists
    if (!subscription) {
      try {
        await this.billingService.createTrialSubscription(user.companyId);
        subscription = await this.billingService.getSubscription(user.companyId);
      } catch (error) {
        // If trial creation fails, return no subscription
        return { status: 'none', message: 'No active subscription' };
      }
    }
    
    return subscription || { status: 'none', message: 'No active subscription' };
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  @ApiResponse({ status: 200, description: 'Returns checkout session URL' })
  async createCheckout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckoutSession(
      user.companyId,
      dto.priceId,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Stripe customer portal session' })
  @ApiResponse({ status: 200, description: 'Returns portal session URL' })
  async createPortal(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePortalDto,
  ) {
    return this.billingService.createPortalSession(user.companyId, dto.returnUrl);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get current usage stats' })
  @ApiResponse({ status: 200, description: 'Returns usage statistics' })
  async getUsage(@CurrentUser() user: AuthUser) {
    return this.billingService.getUsage(user.companyId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Get invoice history' })
  @ApiResponse({ status: 200, description: 'Returns list of invoices' })
  async getInvoices(@CurrentUser() user: AuthUser) {
    return this.billingService.getInvoices(user.companyId);
  }

  @Post('seed-plans')
  @Public() // Allow seeding without authentication for initial setup
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seed subscription plans (for initial setup)' })
  @ApiResponse({ status: 200, description: 'Plans seeded successfully' })
  async seedPlans() {
    await this.billingService.seedPlans();
    return { message: 'Plans seeded successfully' };
  }
}

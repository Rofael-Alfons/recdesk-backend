import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAuthGuard } from '../guards/platform-auth.guard';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import {
  GrantSubscriptionDto,
  ListQueryDto,
  UpdateSubscriptionDto,
} from '../dto';

@ApiTags('Platform Admin - Subscriptions')
@Public()
@UseGuards(PlatformAuthGuard)
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(
    private readonly subscriptionsService: AdminSubscriptionsService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'List all subscription plans' })
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get()
  @ApiOperation({ summary: 'List company subscriptions (paginated)' })
  async findAll(@Query() query: ListQueryDto) {
    return this.subscriptionsService.findAll(query);
  }

  @Post('grant')
  @ApiOperation({ summary: 'Grant an active subscription (no Stripe)' })
  async grant(@Body() dto: GrantSubscriptionDto) {
    return this.subscriptionsService.grant(dto);
  }

  @Patch(':companyId')
  @ApiOperation({ summary: 'Change a company plan and/or subscription status' })
  async update(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.update(companyId, dto);
  }

  @Get('companies/:companyId/invoices')
  @ApiOperation({ summary: 'List invoices for a company' })
  async getInvoices(@Param('companyId') companyId: string) {
    return this.subscriptionsService.getInvoices(companyId);
  }
}

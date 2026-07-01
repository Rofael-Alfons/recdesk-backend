import {
  Controller,
  Post,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EmailMonitorService } from './email-monitor.service';
import { OutlookMonitorService } from './outlook-monitor.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsageType } from '@prisma/client';
import {
  SubscriptionGuard,
  UsageCheck,
} from '../billing/guards/subscription.guard';

interface AuthUser {
  userId: string;
  companyId: string;
  email: string;
  role: string;
}

@ApiTags('Email Integration')
@ApiBearerAuth()
@Controller('integrations/gmail')
export class EmailMonitorController {
  constructor(
    private emailMonitorService: EmailMonitorService,
    private outlookMonitorService: OutlookMonitorService,
    private prisma: PrismaService,
  ) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SubscriptionGuard)
  @UsageCheck(UsageType.EMAIL_IMPORTED)
  @ApiOperation({ summary: 'Manually trigger email sync for all connections' })
  @ApiResponse({ status: 200, description: 'Sync completed successfully' })
  async triggerSync(@CurrentUser() user: AuthUser) {
    const [gmail, outlook] = await Promise.all([
      this.emailMonitorService.syncAllConnectionsForCompany(user.companyId),
      this.outlookMonitorService.syncAllConnectionsForCompany(user.companyId),
    ]);
    return {
      results: [...gmail.results, ...outlook.results],
      totalImported: gmail.totalImported + outlook.totalImported,
    };
  }

  @Post('sync/:connectionId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SubscriptionGuard)
  @UsageCheck(UsageType.EMAIL_IMPORTED)
  @ApiOperation({
    summary: 'Manually trigger email sync for a specific connection',
  })
  @ApiResponse({ status: 200, description: 'Sync completed successfully' })
  async triggerSyncForConnection(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const connection = await this.prisma.emailConnection.findFirst({
      where: { id: connectionId, companyId: user.companyId },
      select: { provider: true },
    });

    if (connection?.provider === 'OUTLOOK') {
      return this.outlookMonitorService.pollEmailsForConnection(
        connectionId,
        user.companyId,
      );
    }

    return this.emailMonitorService.pollEmailsForConnection(
      connectionId,
      user.companyId,
    );
  }

  @Get('status')
  @ApiOperation({ summary: 'Get sync status for all email connections' })
  @ApiResponse({ status: 200, description: 'Returns sync status' })
  async getSyncStatus(@CurrentUser() user: AuthUser) {
    const status = await this.emailMonitorService.getSyncStatus(user.companyId);
    return status;
  }

  @Get('status/:connectionId')
  @ApiOperation({ summary: 'Get sync status for a specific connection' })
  @ApiResponse({ status: 200, description: 'Returns connection sync status' })
  async getConnectionSyncStatus(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const status = await this.emailMonitorService.getConnectionSyncStatus(
      connectionId,
      user.companyId,
    );
    return status;
  }
}

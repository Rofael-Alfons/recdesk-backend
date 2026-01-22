import {
  Controller,
  Post,
  Get,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { EmailMonitorService } from './email-monitor.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
  constructor(private emailMonitorService: EmailMonitorService) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger email sync for all connections' })
  @ApiResponse({ status: 200, description: 'Sync completed successfully' })
  async triggerSync(@CurrentUser() user: AuthUser) {
    const result = await this.emailMonitorService.syncAllConnectionsForCompany(
      user.companyId,
    );
    return result;
  }

  @Post('sync/:connectionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger email sync for a specific connection' })
  @ApiResponse({ status: 200, description: 'Sync completed successfully' })
  async triggerSyncForConnection(
    @Param('connectionId') connectionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.emailMonitorService.pollEmailsForConnection(
      connectionId,
      user.companyId,
    );
    return result;
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

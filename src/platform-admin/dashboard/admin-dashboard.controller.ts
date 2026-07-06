import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAuthGuard } from '../guards/platform-auth.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('Platform Admin - Dashboard')
@Public()
@UseGuards(PlatformAuthGuard)
@Controller('admin/stats')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Platform-wide KPIs' })
  async getStats() {
    return this.dashboardService.getStats();
  }
}

import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import { ReportsBreakdownQueryDto, ReportsQueryDto, UpdateChannelCostsDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('funnel')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Application counts per pipeline stage with conversion rates' })
  @ApiResponse({ status: 200, description: 'Returns the hiring funnel for the period' })
  async getFunnel(@CurrentUser() user: CurrentUserData, @Query() query: ReportsQueryDto) {
    return this.reportsService.getFunnel(user.companyId, query);
  }

  @Get('time-to-hire')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Average days from candidate creation to Hired status' })
  @ApiResponse({ status: 200, description: 'Returns time-to-hire overall and by job' })
  async getTimeToHire(@CurrentUser() user: CurrentUserData, @Query() query: ReportsQueryDto) {
    return this.reportsService.getTimeToHire(user.companyId, query);
  }

  @Get('source-effectiveness')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Candidate volume, score, and hire rate per source channel' })
  @ApiResponse({ status: 200, description: 'Returns per-channel effectiveness metrics' })
  async getSourceEffectiveness(
    @CurrentUser() user: CurrentUserData,
    @Query() query: ReportsQueryDto,
  ) {
    return this.reportsService.getSourceEffectiveness(user.companyId, query);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Top-line summary cards for the reports dashboard' })
  @ApiResponse({ status: 200, description: 'Returns summary metrics for the period' })
  async getSummary(@CurrentUser() user: CurrentUserData, @Query() query: ReportsQueryDto) {
    return this.reportsService.getSummary(user.companyId, query);
  }

  @Get('breakdown')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Candidates, hires, hire rate and avg score per value of one dimension' })
  @ApiResponse({ status: 200, description: 'Returns the breakdown rows for the period and segment' })
  async getBreakdown(
    @CurrentUser() user: CurrentUserData,
    @Query() query: ReportsBreakdownQueryDto,
  ) {
    return this.reportsService.getBreakdown(user.companyId, query);
  }

  @Get('channel-costs')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Get configured monthly spend per source channel' })
  @ApiResponse({ status: 200, description: 'Returns monthly cost per channel' })
  async getChannelCosts(@CurrentUser() user: CurrentUserData) {
    return this.reportsService.getChannelCosts(user.companyId);
  }

  @Put('channel-costs')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Set monthly spend per source channel (used for cost-per-hire)' })
  @ApiResponse({ status: 200, description: 'Channel costs updated' })
  async updateChannelCosts(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateChannelCostsDto,
  ) {
    return this.reportsService.updateChannelCosts(user.companyId, dto);
  }
}

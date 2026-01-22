import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user company details' })
  @ApiResponse({ status: 200, description: 'Company details retrieved' })
  async getCurrentCompany(@CurrentUser() user: CurrentUserData) {
    return this.companiesService.findOne(user.companyId, user.id);
  }

  @Get('me/stats')
  @ApiOperation({ summary: 'Get current company statistics' })
  @ApiResponse({ status: 200, description: 'Company statistics retrieved' })
  async getCurrentCompanyStats(@CurrentUser() user: CurrentUserData) {
    return this.companiesService.getStats(user.companyId, user.id);
  }

  @Patch('me')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update current user company' })
  @ApiResponse({ status: 200, description: 'Company updated successfully' })
  @ApiResponse({ status: 403, description: 'Only admins can update company' })
  async updateCurrentCompany(
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.companiesService.update(
      user.companyId,
      dto,
      user.id,
      user.role as UserRole,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get company by ID' })
  @ApiResponse({ status: 200, description: 'Company details retrieved' })
  @ApiResponse({ status: 403, description: 'Can only view your own company' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.companiesService.findOne(id, user.id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get company statistics by ID' })
  @ApiResponse({ status: 200, description: 'Company statistics retrieved' })
  @ApiResponse({ status: 403, description: 'Can only view your own company stats' })
  async getStats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.companiesService.getStats(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update company by ID' })
  @ApiResponse({ status: 200, description: 'Company updated successfully' })
  @ApiResponse({ status: 403, description: 'Only admins can update company' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.companiesService.update(id, dto, user.id, user.role as UserRole);
  }
}

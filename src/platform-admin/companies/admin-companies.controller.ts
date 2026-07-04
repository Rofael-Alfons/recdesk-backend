import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAuthGuard } from '../guards/platform-auth.guard';
import { AdminCompaniesService } from './admin-companies.service';
import { ListQueryDto, UpdateCompanyStatusDto } from '../dto';

@ApiTags('Platform Admin - Companies')
@Public() // bypass global tenant guard; PlatformAuthGuard enforces auth
@UseGuards(PlatformAuthGuard)
@Controller('admin/companies')
export class AdminCompaniesController {
  constructor(private readonly companiesService: AdminCompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'List all companies (paginated, searchable)' })
  async findAll(@Query() query: ListQueryDto) {
    return this.companiesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get company detail' })
  async findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Suspend or reactivate a company' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyStatusDto,
  ) {
    return this.companiesService.updateStatus(id, dto);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PipelineTemplatesService } from './pipeline-templates.service';
import {
  CreatePipelineTemplateDto,
  TemplateFromJobDto,
  UpdatePipelineTemplateDto,
} from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Pipeline Templates')
@ApiBearerAuth()
@Controller('pipeline-templates')
export class PipelineTemplatesController {
  constructor(private readonly templates: PipelineTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List hiring pipeline templates for your company' })
  async list(@CurrentUser() user: CurrentUserData) {
    return this.templates.list(user.companyId);
  }

  @Post()
  @RequirePermissions('manageJobs')
  @ApiOperation({ summary: 'Create a hiring pipeline template' })
  async create(
    @Body() dto: CreatePipelineTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.templates.create(dto, user.companyId);
  }

  @Post('from-job/:jobId')
  @RequirePermissions('manageJobs')
  @ApiOperation({ summary: "Save a job's pipeline as a new template" })
  async fromJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: TemplateFromJobDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.templates.createFromJob(jobId, dto.name, user.companyId);
  }

  @Patch(':id')
  @RequirePermissions('manageJobs')
  @ApiOperation({ summary: 'Update a hiring pipeline template' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePipelineTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.templates.update(id, dto, user.companyId);
  }

  @Post(':id/default')
  @RequirePermissions('manageJobs')
  @ApiOperation({ summary: 'Make a template the default for new jobs' })
  async setDefault(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.templates.setDefault(id, user.companyId);
  }

  @Delete(':id')
  @RequirePermissions('manageJobs')
  @ApiOperation({ summary: 'Delete a hiring pipeline template (jobs keep their stages)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.templates.remove(id, user.companyId);
  }
}

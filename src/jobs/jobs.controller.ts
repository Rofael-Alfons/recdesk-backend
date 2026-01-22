import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto, UpdateJobDto, QueryJobsDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Create a new job posting' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async create(
    @Body() dto: CreateJobDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.jobsService.create(dto, user.companyId);
  }

  @Get()
  @ApiOperation({ summary: 'List all jobs in company' })
  @ApiResponse({ status: 200, description: 'Jobs list retrieved' })
  async findAll(
    @Query() query: QueryJobsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.jobsService.findAll(user.companyId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get job statistics for company' })
  @ApiResponse({ status: 200, description: 'Job statistics retrieved' })
  async getStats(@CurrentUser() user: CurrentUserData) {
    return this.jobsService.getJobStats(user.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, description: 'Job details retrieved' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.jobsService.findOne(id, user.companyId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Update job by ID' })
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.jobsService.update(id, dto, user.companyId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Close job by ID' })
  @ApiResponse({ status: 200, description: 'Job closed successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.jobsService.remove(id, user.companyId);
  }
}

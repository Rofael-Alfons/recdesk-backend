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
import { EmailTemplatesService } from './email-templates.service';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
  QueryEmailTemplatesDto,
} from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Email Templates')
@ApiBearerAuth()
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private emailTemplatesService: EmailTemplatesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Create a new email template' })
  @ApiResponse({ status: 201, description: 'Email template created successfully' })
  async create(
    @Body() dto: CreateEmailTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.emailTemplatesService.create(dto, user.companyId);
  }

  @Get()
  @ApiOperation({ summary: 'List all email templates' })
  @ApiResponse({ status: 200, description: 'Email templates list retrieved' })
  async findAll(
    @Query() query: QueryEmailTemplatesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.emailTemplatesService.findAll(query, user.companyId);
  }

  @Get('tokens')
  @ApiOperation({ summary: 'Get available personalization tokens' })
  @ApiResponse({ status: 200, description: 'Available tokens retrieved' })
  async getTokens() {
    return this.emailTemplatesService.getAvailableTokens();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get email template by ID' })
  @ApiResponse({ status: 200, description: 'Email template retrieved' })
  @ApiResponse({ status: 404, description: 'Email template not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.emailTemplatesService.findOne(id, user.companyId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Update email template by ID' })
  @ApiResponse({ status: 200, description: 'Email template updated' })
  @ApiResponse({ status: 404, description: 'Email template not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.emailTemplatesService.update(id, dto, user.companyId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete email template by ID' })
  @ApiResponse({ status: 200, description: 'Email template deleted' })
  @ApiResponse({ status: 404, description: 'Email template not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.emailTemplatesService.remove(id, user.companyId);
  }

  @Post('seed-defaults')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Seed default email templates for your company' })
  @ApiResponse({ status: 201, description: 'Default templates seeded' })
  async seedDefaults(@CurrentUser() user: CurrentUserData) {
    return this.emailTemplatesService.seedDefaults(user.companyId);
  }
}

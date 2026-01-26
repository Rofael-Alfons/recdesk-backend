import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { EmailSendingService } from './email-sending.service';
import { SendEmailDto, BulkSendEmailDto, PreviewEmailDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
export class EmailSendingController {
  constructor(private emailSendingService: EmailSendingService) {}

  @Post('send')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Send email to a single candidate' })
  @ApiResponse({ status: 201, description: 'Email sent successfully' })
  @ApiResponse({ status: 404, description: 'Candidate or template not found' })
  @ApiResponse({ status: 400, description: 'Candidate has no email address' })
  async sendEmail(
    @Body() dto: SendEmailDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.emailSendingService.sendEmail(dto, user.id, user.companyId);
  }

  @Post('bulk-send')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Send bulk emails to multiple candidates' })
  @ApiResponse({ status: 201, description: 'Bulk emails sent' })
  @ApiResponse({ status: 404, description: 'Candidates or template not found' })
  async bulkSendEmails(
    @Body() dto: BulkSendEmailDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.emailSendingService.bulkSendEmails(dto, user.id, user.companyId);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Preview email with personalization' })
  @ApiResponse({ status: 200, description: 'Email preview generated' })
  @ApiResponse({ status: 404, description: 'Template or candidate not found' })
  async previewEmail(
    @Body() dto: PreviewEmailDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.emailSendingService.previewEmail(dto, user.companyId, user.id);
  }

  @Get('sent')
  @ApiOperation({ summary: 'Get sent emails history' })
  @ApiResponse({ status: 200, description: 'Sent emails retrieved' })
  @ApiQuery({ name: 'candidateId', required: false, description: 'Filter by candidate ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getSentEmails(
    @CurrentUser() user: CurrentUserData,
    @Query('candidateId') candidateId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.emailSendingService.getSentEmails(user.companyId, {
      candidateId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}

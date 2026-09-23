import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocumentRequestsService } from './document-requests.service';
import { CreateDocumentRequestDto, QueryDocumentRequestsDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Document Requests')
@ApiBearerAuth()
@Controller('document-requests')
export class DocumentRequestsController {
  constructor(private readonly documentRequests: DocumentRequestsService) {}

  @Post()
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Create a document collection request for a candidate' })
  async create(
    @Body() dto: CreateDocumentRequestDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentRequests.create(dto, user);
  }

  @Get()
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'List document requests for a candidate' })
  async list(
    @Query('candidateId', ParseUUIDPipe) candidateId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentRequests.listForCandidate(candidateId, user.companyId);
  }

  @Get('company')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'List document requests across the whole company' })
  async listForCompany(
    @Query() query: QueryDocumentRequestsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentRequests.listForCompany(query, user.companyId);
  }

  @Get(':id')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'Get a document request by id' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentRequests.findOneForCompany(id, user.companyId);
  }

  @Post(':id/resend')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Re-send the upload link to the candidate' })
  async resend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentRequests.resend(id, user);
  }

  @Get('documents/:uploadId/download')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'Get a short-lived signed download URL for an uploaded document' })
  async download(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentRequests.getDownloadUrl(uploadId, user);
  }

  @Delete('documents/:uploadId')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Delete an uploaded document' })
  async deleteDocument(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentRequests.deleteDocument(uploadId, user);
  }
}

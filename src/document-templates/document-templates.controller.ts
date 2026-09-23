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
import { DocumentTemplatesService } from './document-templates.service';
import {
  CreateDocumentTemplateItemDto,
  UpdateDocumentTemplateItemDto,
} from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Document Templates')
@ApiBearerAuth()
@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(private readonly documentTemplates: DocumentTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List document checklist presets for your company' })
  async list(@CurrentUser() user: CurrentUserData) {
    return this.documentTemplates.list(user.companyId);
  }

  @Post()
  @RequirePermissions('manageTemplates')
  @ApiOperation({ summary: 'Create a document checklist preset' })
  async create(
    @Body() dto: CreateDocumentTemplateItemDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentTemplates.create(dto, user.companyId);
  }

  @Patch(':id')
  @RequirePermissions('manageTemplates')
  @ApiOperation({ summary: 'Update a document checklist preset' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentTemplateItemDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentTemplates.update(id, dto, user.companyId);
  }

  @Delete(':id')
  @RequirePermissions('manageTemplates')
  @ApiOperation({ summary: 'Delete a document checklist preset' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentTemplates.remove(id, user.companyId);
  }
}

import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocumentRequestsService } from './document-requests.service';
import { Public } from '../common/decorators/public.decorator';
import { MAX_DOCUMENT_FILE_SIZE_BYTES } from './document-requests.constants';

@ApiTags('Document Requests (Public)')
@Public()
@Controller('public/document-requests')
export class PublicDocumentRequestsController {
  constructor(private readonly documentRequests: DocumentRequestsService) {}

  @Get(':token')
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get document checklist and status by public token' })
  async getByToken(@Param('token') token: string) {
    return this.documentRequests.getPublicByToken(token);
  }

  @Post(':token/items/:itemId/upload')
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_FILE_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file against a checklist item' })
  async upload(
    @Param('token') token: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentRequests.uploadPublicDocument(token, itemId, file);
  }

  @Delete(':token/items/:itemId/uploads/:uploadId')
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remove a mis-uploaded file before the link expires' })
  async deleteUpload(
    @Param('token') token: string,
    @Param('itemId') itemId: string,
    @Param('uploadId') uploadId: string,
  ) {
    return this.documentRequests.deletePublicUpload(token, itemId, uploadId);
  }
}

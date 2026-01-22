import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('cvs')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(
    FilesInterceptor('files', 200, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bulk upload CVs' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'CV files (PDF, DOCX). Max 200 files, 10MB each.',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'CVs uploaded and processed' })
  @ApiResponse({ status: 400, description: 'Invalid files or parameters' })
  async uploadCVs(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('jobId', new ParseUUIDPipe({ optional: true })) jobId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.uploadService.uploadBulkCVs(files, user.companyId, jobId);
  }
}

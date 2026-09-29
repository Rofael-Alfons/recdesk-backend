import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { SubmitReferralDto } from './dto';
import { Public } from '../common/decorators/public.decorator';

const MAX_CV_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Anyone holding a referral link can use these, logged in or not. The
// dashboard "Refer a Candidate" form posts here too, with the user's own code.
@ApiTags('Referrals (Public)')
@Public()
@Controller()
export class PublicReferralsController {
  constructor(private referralsService: ReferralsService) {}

  @Get('public/referrals/:code')
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Referral landing-page data: company, referrer, open jobs',
  })
  @ApiResponse({
    status: 404,
    description: 'Unknown or inactive referral code',
  })
  async getByCode(@Param('code') code: string) {
    return this.referralsService.getPublicReferral(code);
  }

  @Post('candidates/refer/:code')
  @HttpCode(201)
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_CV_FILE_SIZE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fullName', 'email', 'file'],
      properties: {
        fullName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        jobId: { type: 'string', format: 'uuid' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'CV (PDF or DOCX), max 10MB',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Submit a referred candidate through a referral link',
  })
  @ApiResponse({ status: 201, description: 'Referral received' })
  @ApiResponse({ status: 409, description: 'Candidate already on file' })
  async submit(
    @Param('code') code: string,
    @Body() dto: SubmitReferralDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.referralsService.submitReferral(code, dto, file);
  }
}

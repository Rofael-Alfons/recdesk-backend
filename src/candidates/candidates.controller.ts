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
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CandidatesService } from './candidates.service';
import {
  CreateCandidateDto,
  UpdateCandidateDto,
  QueryCandidatesDto,
  BulkUpdateStatusDto,
  BulkAddTagsDto,
  BulkAssignJobDto,
  RescoreCandidateDto,
} from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, UsageType } from '@prisma/client';
import { SubscriptionGuard, UsageCheck } from '../billing/guards/subscription.guard';

@ApiTags('Candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(private candidatesService: CandidatesService) { }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseGuards(SubscriptionGuard)
  @UsageCheck(UsageType.CV_PROCESSED)
  @ApiOperation({ summary: 'Create a new candidate' })
  @ApiResponse({ status: 201, description: 'Candidate created successfully' })
  async create(
    @Body() dto: CreateCandidateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.create(dto, user.companyId);
  }

  @Get()
  @ApiOperation({ summary: 'List all candidates' })
  @ApiResponse({ status: 200, description: 'Candidates list retrieved' })
  async findAll(
    @Query() query: QueryCandidatesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.findAll(user.companyId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get candidate statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getStats(@CurrentUser() user: CurrentUserData) {
    return this.candidatesService.getStats(user.companyId);
  }

  @Post('bulk/status')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Bulk update candidate status' })
  @ApiResponse({ status: 200, description: 'Candidates updated' })
  async bulkUpdateStatus(
    @Body() dto: BulkUpdateStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkUpdateStatus(dto, user.companyId, user.id);
  }

  @Post('bulk/tags')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Bulk add tags to candidates' })
  @ApiResponse({ status: 200, description: 'Tags added' })
  async bulkAddTags(
    @Body() dto: BulkAddTagsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkAddTags(dto, user.companyId);
  }

  @Post('bulk/assign-job')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Bulk assign candidates to job' })
  @ApiResponse({ status: 200, description: 'Candidates assigned' })
  async bulkAssignJob(
    @Body() dto: BulkAssignJobDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkAssignJob(dto, user.companyId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get candidate by ID' })
  @ApiResponse({ status: 200, description: 'Candidate details retrieved' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.findOne(id, user.companyId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Update candidate by ID' })
  @ApiResponse({ status: 200, description: 'Candidate updated' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.update(id, dto, user.companyId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({ summary: 'Delete candidate by ID' })
  @ApiResponse({ status: 200, description: 'Candidate deleted' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.remove(id, user.companyId);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add note to candidate' })
  @ApiResponse({ status: 201, description: 'Note added' })
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('content') content: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.addNote(id, content, user.companyId, user.id);
  }

  @Post(':id/rescore')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseGuards(SubscriptionGuard)
  @UsageCheck(UsageType.AI_SCORING_CALL)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Rescore candidate for a different job' })
  @ApiResponse({
    status: 202,
    description: 'Scoring job queued successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid job or job status' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async rescoreForJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescoreCandidateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.rescoreForJob(id, dto, user.companyId);
  }

  @Get(':id/cv-url')
  @ApiOperation({ summary: 'Get signed URL for candidate CV file' })
  @ApiResponse({
    status: 200,
    description: 'Signed URL generated successfully',
  })
  @ApiResponse({ status: 400, description: 'Candidate has no CV file' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async getCvSignedUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const url = await this.candidatesService.getCvSignedUrl(id, user.companyId);
    return { url };
  }
}

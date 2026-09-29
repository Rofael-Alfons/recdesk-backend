import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
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
  BulkDeleteDto,
  BulkExportDto,
  BulkRejectDto,
  BulkRemoveTagsDto,
  RescoreCandidateDto,
  CreateSavedViewDto,
  UpdateSavedViewDto,
  SetViewAlertDto,
  MoveStageDto,
} from './dto';
import { SavedViewsService } from './saved-views.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { UsageType } from '@prisma/client';
import {
  SubscriptionGuard,
  UsageCheck,
} from '../billing/guards/subscription.guard';

@ApiTags('Candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(
    private candidatesService: CandidatesService,
    private savedViewsService: SavedViewsService,
  ) {}

  @Post()
  @RequirePermissions('manageCandidates')
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

  @Get('filter-options')
  @ApiOperation({
    summary: 'Get facet values (with counts) available for filtering',
  })
  @ApiResponse({ status: 200, description: 'Filter options retrieved' })
  async getFilterOptions(@CurrentUser() user: CurrentUserData) {
    return this.candidatesService.getFilterOptions(user.companyId);
  }

  @Get('views')
  @ApiOperation({ summary: 'List own and team-shared saved filter views' })
  @ApiResponse({ status: 200, description: 'Saved views retrieved' })
  async listViews(@CurrentUser() user: CurrentUserData) {
    return this.savedViewsService.list(user);
  }

  @Post('views')
  @ApiOperation({ summary: 'Save the current filters as a named view' })
  @ApiResponse({ status: 201, description: 'View saved' })
  @ApiResponse({ status: 409, description: 'A view with this name already exists' })
  async createView(
    @Body() dto: CreateSavedViewDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.savedViewsService.create(user, dto);
  }

  @Patch('views/:viewId')
  @ApiOperation({ summary: 'Rename, re-filter or share/unshare a saved view' })
  @ApiResponse({ status: 200, description: 'View updated' })
  @ApiResponse({ status: 403, description: 'Not the owner or an admin' })
  async updateView(
    @Param('viewId', ParseUUIDPipe) viewId: string,
    @Body() dto: UpdateSavedViewDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.savedViewsService.update(user, viewId, dto);
  }

  @Delete('views/:viewId')
  @ApiOperation({ summary: 'Delete a saved view' })
  @ApiResponse({ status: 200, description: 'View deleted' })
  @ApiResponse({ status: 403, description: 'Not the owner or an admin' })
  async removeView(
    @Param('viewId', ParseUUIDPipe) viewId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.savedViewsService.remove(user, viewId);
  }

  @Put('views/:viewId/alert')
  @ApiOperation({
    summary: 'Get notified when new candidates match a saved view',
  })
  @ApiResponse({ status: 200, description: 'Alert set' })
  @ApiResponse({ status: 404, description: 'View not visible to the caller' })
  async setViewAlert(
    @Param('viewId', ParseUUIDPipe) viewId: string,
    @Body() dto: SetViewAlertDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.savedViewsService.setAlert(user, viewId, dto);
  }

  @Delete('views/:viewId/alert')
  @ApiOperation({ summary: 'Stop alerts for a saved view' })
  @ApiResponse({ status: 200, description: 'Alert removed' })
  async removeViewAlert(
    @Param('viewId', ParseUUIDPipe) viewId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.savedViewsService.removeAlert(user, viewId);
  }

  @Post('bulk/status')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'Bulk update candidate status' })
  @ApiResponse({ status: 200, description: 'Candidates updated' })
  async bulkUpdateStatus(
    @Body() dto: BulkUpdateStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkUpdateStatus(
      dto,
      user.companyId,
      user.id,
    );
  }

  @Post('bulk/reject')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({
    summary: 'Bulk reject with a reason, optionally scheduling a rejection email',
  })
  @ApiResponse({ status: 200, description: 'Candidates rejected' })
  async bulkReject(
    @Body() dto: BulkRejectDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkReject(dto, user.companyId, user.id);
  }

  @Post('bulk/tags')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Bulk add tags to candidates' })
  @ApiResponse({ status: 200, description: 'Tags added' })
  async bulkAddTags(
    @Body() dto: BulkAddTagsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkAddTags(dto, user.companyId);
  }

  @Post('bulk/tags/remove')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Bulk remove tags from candidates' })
  @ApiResponse({ status: 200, description: 'Tags removed' })
  async bulkRemoveTags(
    @Body() dto: BulkRemoveTagsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkRemoveTags(dto, user.companyId, user.id);
  }

  @Post('bulk/export')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Rows for a CSV export of a selection' })
  @ApiResponse({ status: 200, description: 'Export rows' })
  async bulkExport(
    @Body() dto: BulkExportDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkExport(dto, user.companyId);
  }

  @Post('bulk/assign-job')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Bulk assign candidates to job' })
  @ApiResponse({ status: 200, description: 'Candidates assigned' })
  async bulkAssignJob(
    @Body() dto: BulkAssignJobDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkAssignJob(dto, user.companyId, user.id);
  }

  @Post('bulk/delete')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Bulk delete candidates' })
  @ApiResponse({ status: 200, description: 'Candidates deleted' })
  async bulkDelete(
    @Body() dto: BulkDeleteDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.bulkDelete(dto, user.companyId);
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

  @Get(':id/neighbors')
  @ApiOperation({
    summary: 'Previous/next candidate and position within a filtered list',
  })
  @ApiResponse({ status: 200, description: 'Neighbors retrieved' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async getNeighbors(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryCandidatesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.getNeighbors(id, user.companyId, query);
  }

  @Patch(':id')
  @RequirePermissions('manageCandidates')
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
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Delete candidate by ID' })
  @ApiResponse({ status: 200, description: 'Candidate deleted' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.remove(id, user.companyId);
  }

  @Post(':id/stage')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({
    summary: "Move a candidate to a stage of their job's pipeline (status follows the stage)",
  })
  @ApiResponse({ status: 201, description: 'Candidate moved' })
  async moveToStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveStageDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.moveToStage(id, dto.stageId, user.companyId, user.id);
  }

  @Post(':id/notes')
  @RequirePermissions('reviewCandidates')
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
  @RequirePermissions('manageCandidates')
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

  @Get(':id/scores/:jobId/history')
  @ApiOperation({ summary: 'Get rescore history for a candidate on a job' })
  @ApiResponse({ status: 200, description: 'Score history retrieved' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async getScoreHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.candidatesService.getScoreHistory(id, jobId, user.companyId);
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

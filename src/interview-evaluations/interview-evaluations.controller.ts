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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InterviewEvaluationsService } from './interview-evaluations.service';
import {
  CreateInterviewEvaluationDto,
  UpdateInterviewEvaluationDto,
} from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Interview Evaluations')
@ApiBearerAuth()
@Controller('interview-evaluations')
export class InterviewEvaluationsController {
  constructor(private readonly evaluations: InterviewEvaluationsService) {}

  @Post()
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'Submit an interview scorecard for a candidate' })
  async create(
    @Body() dto: CreateInterviewEvaluationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.evaluations.create(dto, user);
  }

  @Get()
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'List interview scorecards for a candidate' })
  async list(
    @Query('candidateId', ParseUUIDPipe) candidateId: string,
    @Query('jobId') jobId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.evaluations.listForCandidate(
      candidateId,
      jobId,
      user.companyId,
    );
  }

  @Patch(':id')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'Update your own interview scorecard' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInterviewEvaluationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.evaluations.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'Delete your own interview scorecard' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.evaluations.remove(id, user);
  }

  @Get(':id/history')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'Get edit history for an interview scorecard' })
  async getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.evaluations.getHistory(id, user.companyId);
  }
}

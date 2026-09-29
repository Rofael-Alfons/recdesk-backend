import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InterviewFeedbackService } from './interview-feedback.service';
import { SubmitFeedbackDto, AssignInterviewersDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Interview Feedback')
@ApiBearerAuth()
@Controller('candidates')
export class InterviewFeedbackController {
  constructor(private readonly feedback: InterviewFeedbackService) {}

  @Post(':id/feedback')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'Submit interview feedback for a pipeline stage' })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitFeedbackDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.feedback.submit(id, dto, user);
  }

  @Get(':id/feedback')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'List interview feedback grouped by stage' })
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.feedback.listForCandidate(id, user.companyId);
  }

  @Get(':id/stages/:stageId/interviewers')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'List interviewers assigned to a candidate stage' })
  async getInterviewers(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.feedback.getInterviewers(id, stageId, user.companyId);
  }

  @Post(':id/stages/:stageId/interviewers')
  @RequirePermissions('manageCandidates')
  @ApiOperation({
    summary: 'Set the interviewers assigned to a candidate stage',
  })
  async assignInterviewers(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() dto: AssignInterviewersDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.feedback.assignInterviewers(id, stageId, dto, user);
  }
}

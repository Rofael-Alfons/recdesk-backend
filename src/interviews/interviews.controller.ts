import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InterviewsService } from './interviews.service';
import { CreateInterviewDto, SubmitAvailabilityDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Interviews')
@ApiBearerAuth()
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Post()
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Create an interview (request availability or manual slots)' })
  async create(
    @Body() dto: CreateInterviewDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.interviews.create(dto, user);
  }

  @Get('assigned')
  @ApiOperation({ summary: 'Interviews awaiting the current user’s availability' })
  async assigned(@CurrentUser() user: CurrentUserData) {
    return this.interviews.getAssigned(user);
  }

  @Get()
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'List interviews for a candidate' })
  async list(
    @Query('candidateId', ParseUUIDPipe) candidateId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.interviews.listForCandidate(candidateId, user.companyId);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Upcoming scheduled interviews for the current user' })
  async upcoming(@CurrentUser() user: CurrentUserData) {
    return this.interviews.getUpcoming(user);
  }

  @Get(':id')
  @RequirePermissions('reviewCandidates')
  @ApiOperation({ summary: 'Get an interview by id' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.interviews.findOneForCompany(id, user.companyId);
  }

  @Post(':id/availability')
  @ApiOperation({ summary: 'Assigned interviewer submits their availability' })
  async submitAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAvailabilityDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.interviews.submitAvailability(id, dto.slots, user);
  }

  @Post(':id/live-availability')
  @ApiOperation({
    summary: 'Assigned interviewer shares their live calendar (no pre-picked slots)',
  })
  async shareLiveAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.interviews.shareLiveAvailability(id, user);
  }

  @Post(':id/send-to-candidate')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Email the candidate the booking link' })
  async sendToCandidate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.interviews.sendToCandidate(id, user);
  }

  @Post(':id/resend')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Re-notify the manager or re-send the candidate link' })
  async resend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.interviews.resend(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('manageCandidates')
  @ApiOperation({ summary: 'Cancel an interview' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.interviews.cancel(id, user);
  }
}

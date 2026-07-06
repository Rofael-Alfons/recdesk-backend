import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import {
  SlotGridQueryDto,
  SuggestSlotsQueryDto,
  UpsertOverrideDto,
  UpsertScheduleDto,
} from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Availability')
@ApiBearerAuth()
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user’s recurring availability schedule' })
  async getMine(@CurrentUser() user: CurrentUserData) {
    return this.availability.getMine(user.id);
  }

  @Get('me/suggested-slots')
  @ApiOperation({
    summary:
      'Suggest upcoming interview slots from the current user’s saved weekly availability',
  })
  async suggestedSlots(
    @Query() query: SuggestSlotsQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.availability.suggestSlots(user.id, query);
  }

  @Get('me/slots')
  @ApiOperation({
    summary:
      'Full conflict-aware slot grid for the current user, for interactive picking',
  })
  async mySlotGrid(
    @Query() query: SlotGridQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.availability.getSlotGrid(user.id, query);
  }

  @Get(':userId/slots')
  @RequirePermissions('manageCandidates')
  @ApiOperation({
    summary:
      'Full conflict-aware slot grid for a team member, used when scheduling an interview',
  })
  async slotGridForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: SlotGridQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.availability.getSlotGrid(userId, query, user.companyId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Replace the current user’s weekly hours and timezone' })
  async upsertMine(
    @Body() dto: UpsertScheduleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.availability.upsertMine(user.id, dto);
  }

  @Post('me/overrides')
  @ApiOperation({ summary: 'Add or update a date-specific availability override' })
  async addOverride(
    @Body() dto: UpsertOverrideDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.availability.addOverride(user.id, dto);
  }

  @Delete('me/overrides/:id')
  @ApiOperation({ summary: 'Remove a date-specific availability override' })
  async removeOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.availability.removeOverride(user.id, id);
  }
}

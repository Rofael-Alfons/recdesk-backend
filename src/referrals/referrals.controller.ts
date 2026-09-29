import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ReferralsService } from './referrals.service';
import { LeaderboardQueryDto, MyLinkQueryDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Referrals')
@ApiBearerAuth()
@Controller('referrals')
export class ReferralsController {
  constructor(private referralsService: ReferralsService) {}

  // Every role can refer — deliberately not gated by uploadCVs.
  @Get('my-link')
  @ApiOperation({
    summary: "Get (or create) the current user's shareable referral link",
  })
  @ApiResponse({ status: 200, description: 'Returns { code, url, job }' })
  async getMyLink(
    @CurrentUser() user: CurrentUserData,
    @Query() query: MyLinkQueryDto,
  ) {
    return this.referralsService.getMyLink(
      user.id,
      user.companyId,
      query.jobId,
    );
  }

  @Get('leaderboard')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @ApiOperation({
    summary: 'Per-user referral counts: referred, reached interview, hired',
  })
  @ApiResponse({
    status: 200,
    description: 'Rows sorted by hires, then interviews, then referrals',
  })
  async getLeaderboard(
    @CurrentUser() user: CurrentUserData,
    @Query() query: LeaderboardQueryDto,
  ) {
    return this.referralsService.getLeaderboard(user.companyId, query);
  }
}

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InterviewsService } from './interviews.service';
import { BookSlotDto, PublicSlotGridQueryDto } from './dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Interviews (Public)')
@Public()
@Controller('public/interviews')
export class PublicInterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Get bookable interview details by public token' })
  async getByToken(@Param('token') token: string) {
    return this.interviews.getPublicByToken(token);
  }

  @Get(':token/slots')
  // Looser than :token/book since browsing a calendar fires more reads than writes.
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Live, conflict-aware availability grid for a LIVE-offer interview' })
  async getSlotGrid(
    @Param('token') token: string,
    @Query() query: PublicSlotGridQueryDto,
  ) {
    return this.interviews.getPublicSlotGrid(token, query);
  }

  @Post(':token/book')
  // Stricter limit than the global throttler for this unauthenticated write.
  @Throttle({ short: { limit: 6, ttl: 60_000 } })
  @ApiOperation({ summary: 'Book an offered or live-computed interview time' })
  async book(@Param('token') token: string, @Body() dto: BookSlotDto) {
    return this.interviews.book(token, dto);
  }
}

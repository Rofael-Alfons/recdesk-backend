import {
  Controller,
  Post,
  Get,
  Body,
  Ip,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { WaitlistService } from './waitlist.service';
import { SubscribeWaitlistDto } from './dto';

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post('subscribe')
  @Public()
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscribe to the waitlist' })
  @ApiResponse({ status: 200, description: 'Subscription result' })
  async subscribe(
    @Body() dto: SubscribeWaitlistDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const result = await this.waitlistService.subscribe(dto, {
      ip,
      userAgent,
    });

    if (result.alreadySubscribed) {
      return {
        success: true,
        message: "You're already on the waitlist! We'll notify you when we launch.",
        alreadySubscribed: true,
      };
    }

    return {
      success: true,
      message: "You're in! We'll send you early access when we launch.",
      alreadySubscribed: false,
      position: result.position,
    };
  }

  @Get('count')
  @Public()
  @ApiOperation({ summary: 'Get total waitlist subscriber count' })
  @ApiResponse({ status: 200, description: 'Subscriber count' })
  async getCount() {
    const count = await this.waitlistService.getCount();
    return { count };
  }
}

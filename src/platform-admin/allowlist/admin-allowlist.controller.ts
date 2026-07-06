import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAuthGuard } from '../guards/platform-auth.guard';
import { AllowlistService } from '../../allowlist/allowlist.service';
import { CreateAllowlistEntryDto } from '../dto';

@ApiTags('Platform Admin - Allowlist')
@Public()
@UseGuards(PlatformAuthGuard)
@Controller('admin/allowlist')
export class AdminAllowlistController {
  constructor(private readonly allowlistService: AllowlistService) {}

  @Get()
  @ApiOperation({ summary: 'List all access-allowlist entries' })
  async list() {
    return this.allowlistService.list();
  }

  @Post()
  @ApiOperation({ summary: 'Add an email or domain to the allowlist' })
  async add(@Body() dto: CreateAllowlistEntryDto) {
    const entry = await this.allowlistService.add(dto.value, dto.note);
    if (!entry) {
      throw new BadRequestException(
        'Invalid allowlist value. Use an email (user@acme.com) or domain (@acme.com).',
      );
    }
    return entry;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove an allowlist entry' })
  async remove(@Param('id') id: string) {
    const removed = await this.allowlistService.removeById(id);
    if (!removed) {
      throw new NotFoundException('Allowlist entry not found');
    }
    return { message: 'Removed' };
  }
}

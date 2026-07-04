import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAuthGuard } from '../guards/platform-auth.guard';
import { AdminUsersService } from './admin-users.service';
import { ListQueryDto, UpdateUserStatusDto } from '../dto';

@ApiTags('Platform Admin - Users')
@Public()
@UseGuards(PlatformAuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users across companies' })
  async findAll(@Query() query: ListQueryDto) {
    return this.usersService.findAll(query, query.companyId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or deactivate a user' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(id, dto);
  }
}

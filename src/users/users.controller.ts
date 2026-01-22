import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { InviteUserDto, UpdateUserDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getMe(@CurrentUser() user: CurrentUserData) {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateMe(
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.update(
      user.id,
      dto,
      user.companyId,
      user.id,
      user.role as UserRole,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all users in company' })
  @ApiResponse({ status: 200, description: 'Users list retrieved' })
  async findAll(@CurrentUser() user: CurrentUserData) {
    return this.usersService.findAll(user.companyId);
  }

  @Post('invite')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Invite a new user to company' })
  @ApiResponse({ status: 201, description: 'User invited successfully' })
  @ApiResponse({ status: 403, description: 'Only admins can invite users' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async invite(
    @Body() dto: InviteUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.invite(dto, user.companyId, user.role as UserRole);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User details retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.findOne(id, user.companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user by ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.update(
      id,
      dto,
      user.companyId,
      user.id,
      user.role as UserRole,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate user by ID' })
  @ApiResponse({ status: 200, description: 'User deactivated successfully' })
  @ApiResponse({ status: 403, description: 'Only admins can delete users' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.remove(
      id,
      user.companyId,
      user.id,
      user.role as UserRole,
    );
  }
}

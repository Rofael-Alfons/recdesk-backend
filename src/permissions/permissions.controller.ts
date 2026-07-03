import { Controller, Get, Put, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PermissionsService } from './permissions.service';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CONFIGURABLE_ROLES,
  EDITABLE_PERMISSIONS,
  LOCKED_PERMISSIONS,
  PERMISSION_META,
} from '../common/permissions';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private permissionsService: PermissionsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get the editable permission catalog + matrix' })
  @ApiResponse({ status: 200, description: 'Permissions retrieved' })
  async get(@CurrentUser() user: CurrentUserData) {
    const matrix = await this.permissionsService.getMatrix(user.companyId);
    return {
      roles: CONFIGURABLE_ROLES,
      editablePermissions: EDITABLE_PERMISSIONS.map((key) => ({
        key,
        ...PERMISSION_META[key],
      })),
      lockedPermissions: LOCKED_PERMISSIONS.map((key) => ({
        key,
        ...PERMISSION_META[key],
      })),
      matrix,
    };
  }

  @Put()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update the per-role permission matrix' })
  @ApiResponse({ status: 200, description: 'Permissions updated' })
  async update(
    @Body() dto: UpdatePermissionsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const matrix = await this.permissionsService.setMatrix(
      user.companyId,
      dto.matrix,
    );
    return { matrix, message: 'Permissions updated.' };
  }
}

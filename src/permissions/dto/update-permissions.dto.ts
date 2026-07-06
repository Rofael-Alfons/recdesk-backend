import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import type { PermissionMatrix } from '../../common/permissions';

export class UpdatePermissionsDto {
  @ApiProperty({
    description:
      'Map of non-admin role -> list of granted permission keys. Unknown roles/permissions are ignored.',
    example: {
      RECRUITER: ['manageJobs', 'manageCandidates'],
      HIRING_MANAGER: ['reviewCandidates'],
      VIEWER: [],
    },
  })
  @IsObject()
  matrix: PermissionMatrix;
}

import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePortalDto {
  @ApiProperty({ description: 'URL to redirect to after leaving the portal' })
  @IsString()
  @IsNotEmpty()
  returnUrl: string;
}

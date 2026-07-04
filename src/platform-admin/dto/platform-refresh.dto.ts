import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PlatformRefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

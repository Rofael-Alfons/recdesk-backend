import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PlatformLoginDto {
  @ApiProperty({ example: 'ops@recdesk.io' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SuperSecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;
}

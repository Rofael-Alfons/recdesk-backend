import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubscribeWaitlistDto {
  @ApiProperty({ example: 'ahmed@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Ahmed Hassan' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

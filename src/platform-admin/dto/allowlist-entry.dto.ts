import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAllowlistEntryDto {
  @ApiProperty({
    description:
      'An email (user@acme.com), or a domain (@acme.com / acme.com). ' +
      'Domains allow anyone at that domain.',
    example: '@acme.com',
  })
  @IsString()
  @MinLength(3)
  value: string;

  @ApiPropertyOptional({ description: 'Optional note for context' })
  @IsOptional()
  @IsString()
  note?: string;
}

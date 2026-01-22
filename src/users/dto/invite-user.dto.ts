import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class InviteUserDto {
  @ApiProperty({ example: 'john.doe@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  @ApiPropertyOptional({
    enum: UserRole,
    default: UserRole.RECRUITER,
    description: 'Role for the invited user',
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

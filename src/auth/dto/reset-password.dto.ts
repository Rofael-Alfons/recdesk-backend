import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token from email' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewPassword123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one lowercase letter, one uppercase letter, and one number',
  })
  newPassword: string;
}

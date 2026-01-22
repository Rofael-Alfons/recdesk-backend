import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateConnectionDto {
  @ApiPropertyOptional({ description: 'Enable/disable auto-import of job applications' })
  @IsOptional()
  @IsBoolean()
  autoImport?: boolean;
}

import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CompanyStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCompanyStatusDto {
  @ApiProperty({ enum: CompanyStatus })
  @IsEnum(CompanyStatus)
  status: CompanyStatus;

  @ApiPropertyOptional({ description: 'Optional reason recorded for audit' })
  @IsOptional()
  @IsString()
  reason?: string;
}

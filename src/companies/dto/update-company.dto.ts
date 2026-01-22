import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MinLength, MaxLength, Matches } from 'class-validator';
import { CompanyMode, PlanType } from '@prisma/client';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'TechCorp Egypt', description: 'Company name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'techcorp.com.eg', description: 'Company domain' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/, {
    message: 'Invalid domain format',
  })
  domain?: string;

  @ApiPropertyOptional({ enum: CompanyMode, example: CompanyMode.FULL_ATS })
  @IsOptional()
  @IsEnum(CompanyMode)
  mode?: CompanyMode;

  @ApiPropertyOptional({ enum: PlanType, example: PlanType.PROFESSIONAL })
  @IsOptional()
  @IsEnum(PlanType)
  plan?: PlanType;
}

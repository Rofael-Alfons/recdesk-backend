import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Grant / comp an ACTIVE subscription to a company without going through Stripe
 * (demos, pilots, manual comping). Mirrors the grant-subscription CLI script.
 */
export class GrantSubscriptionDto {
  @ApiProperty({ description: 'Target company id' })
  @IsString()
  companyId: string;

  @ApiProperty({ description: 'Plan name (e.g. Starter, Professional, Enterprise)' })
  @IsString()
  plan: string;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  months: number = 12;
}

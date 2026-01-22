import { IsString, IsNotEmpty, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCheckoutDto {
  @ApiProperty({ description: 'Stripe price ID for the plan' })
  @IsString()
  @IsNotEmpty()
  priceId: string;

  @ApiProperty({ description: 'URL to redirect to after successful checkout' })
  @IsString()
  @IsNotEmpty()
  successUrl: string;

  @ApiProperty({ description: 'URL to redirect to if checkout is cancelled' })
  @IsString()
  @IsNotEmpty()
  cancelUrl: string;
}

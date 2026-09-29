import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, Min, ValidateNested } from 'class-validator';
import { CandidateSourceChannel } from '@prisma/client';

export class ChannelCostItemDto {
  @ApiProperty({ enum: CandidateSourceChannel })
  @IsEnum(CandidateSourceChannel)
  channel: CandidateSourceChannel;

  @ApiProperty({ description: 'Monthly spend for this channel, in cents' })
  @IsInt()
  @Min(0)
  monthlyCost: number;
}

export class UpdateChannelCostsDto {
  @ApiProperty({ type: [ChannelCostItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelCostItemDto)
  costs: ChannelCostItemDto[];
}

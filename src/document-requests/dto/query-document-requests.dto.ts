import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { DocumentRequestStatus } from '@prisma/client';

export class QueryDocumentRequestsDto {
  @ApiPropertyOptional({ enum: DocumentRequestStatus })
  @IsOptional()
  @IsEnum(DocumentRequestStatus)
  status?: DocumentRequestStatus;

  @ApiPropertyOptional({ description: 'Search by candidate name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

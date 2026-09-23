import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDocumentTemplateItemDto {
  @ApiProperty({ description: 'e.g. "National ID (front + back)"' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Whether this item is pre-checked when the request dialog opens',
  })
  @IsOptional()
  @IsBoolean()
  includeByDefault?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      "Marks this preset as the candidate's personal photo. At most one per company.",
  })
  @IsOptional()
  @IsBoolean()
  isPersonalPhoto?: boolean;
}

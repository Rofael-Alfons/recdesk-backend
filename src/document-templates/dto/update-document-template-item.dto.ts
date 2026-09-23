import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CreateDocumentTemplateItemDto } from './create-document-template-item.dto';

export class UpdateDocumentTemplateItemDto extends PartialType(
  CreateDocumentTemplateItemDto,
) {
  @ApiPropertyOptional({ description: 'Used for reordering (swap with an adjacent item)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Upper bound for one bulk action, whichever way the selection is given. */
export const MAX_BULK = 5000;

@ValidatorConstraint({ name: 'singleSelection' })
class SingleSelectionConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CandidateSelectionDto;
    return (dto.candidateIds === undefined) !== (dto.filter === undefined);
  }

  defaultMessage(): string {
    return 'Provide exactly one of candidateIds or filter';
  }
}

/**
 * Which candidates a bulk action applies to: either explicit IDs (the rows a
 * user ticked) or every candidate matching a list filter, minus exclusions
 * ("select all 312 matching" with a few rows unticked).
 */
export class CandidateSelectionDto {
  @ApiPropertyOptional({ description: 'Explicit candidate IDs', type: [String] })
  @ValidateIf((o) => o.filter === undefined || o.candidateIds !== undefined)
  @Validate(SingleSelectionConstraint)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK)
  @IsUUID('4', { each: true })
  candidateIds?: string[];

  @ApiPropertyOptional({
    description:
      'Candidate list query string (as used by GET /candidates); selects every match',
    example: 'status=NEW&minScore=70',
  })
  @ValidateIf((o) => o.candidateIds === undefined || o.filter !== undefined)
  @Validate(SingleSelectionConstraint)
  @IsString()
  @MaxLength(10000)
  filter?: string;

  @ApiPropertyOptional({
    description: 'IDs to leave out of a filter selection',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BULK)
  @IsUUID('4', { each: true })
  excludeIds?: string[];
}

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { RecommendPlantsDto } from './spaces.dto';

export class CreateDesignDto extends RecommendPlantsDto {
  @ApiProperty({ description: 'Keep the same UUID when retrying this save' })
  @IsUUID('4')
  requestId!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  title!: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 8 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  recommendationIds!: string[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CareType, PlantOutcomeType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CompleteBatchCareDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') clientActionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() occurredAt?: string;

  @ApiProperty({ enum: CareType, example: CareType.WATER })
  @IsEnum(CareType)
  actionType!: CareType;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  plantIds!: string[];

  @ApiPropertyOptional({ type: [String], description: 'Only exceptions the user did not complete' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  skippedPlantIds?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  skipReasons?: Record<string, 'SKIP' | 'SOIL_WET' | 'BUSY'>;
}

export class RecoveryOutcomeDto {
  @ApiProperty({
    enum: [
      PlantOutcomeType.IMPROVED,
      PlantOutcomeType.HEALTHY,
      PlantOutcomeType.DECLINED,
      PlantOutcomeType.UNKNOWN,
    ],
  })
  @IsEnum(PlantOutcomeType)
  outcome!: PlantOutcomeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}

export class EngagementEventDto {
  @ApiProperty() @IsString() @Length(2, 80) name!: string;
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

export class CorrectCareSessionDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(500) @IsUUID('4', { each: true }) plantIds?: string[];
}

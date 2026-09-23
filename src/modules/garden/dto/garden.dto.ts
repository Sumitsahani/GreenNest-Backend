import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsUUID,
  IsIn,
  IsNumber,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlantEnvironment } from '@prisma/client';

export class CreatePlantDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() species?: string;
  @ApiProperty() @IsString() @MinLength(2) location!: string;
  @ApiProperty({ enum: PlantEnvironment })
  @IsEnum(PlantEnvironment)
  environment!: PlantEnvironment;
  @ApiProperty({ required: false, description: 'City or area used for this plant weather' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  weatherLocation?: string;
  @ApiProperty({ required: false, minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude?: number;
  @ApiProperty({ required: false, minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(1000) imageUrl?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) category?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(120) source?: string;
  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  acquiredAt?: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() lastWateredAt!: string;
  @ApiProperty({ minimum: 1, maximum: 60, default: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  wateringDays = 7;
}
export enum CareAction {
  WATER = 'WATER',
  FERTILIZE = 'FERTILIZE',
  PRUNE = 'PRUNE',
  REPOT = 'REPOT',
  NOTE = 'NOTE',
}
export class UpdatePlantDto extends PartialType(
  PickType(CreatePlantDto, [
    'name',
    'species',
    'location',
    'environment',
    'notes',
    'weatherLocation',
    'latitude',
    'longitude',
  ] as const),
) {}
export class AddCareEventDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID('4') clientActionId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() occurredAt?: string;
  @ApiProperty({ enum: CareAction }) @IsEnum(CareAction) type!: CareAction;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class CreateReminderDto {
  @ApiProperty({ enum: CareAction }) @IsEnum(CareAction) type!: CareAction;
  @ApiProperty({ format: 'date-time' }) @IsDateString() scheduledAt!: string;
}
export class UpdateReminderDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
}
export enum CareResponse {
  WATERED = 'WATERED',
  BUSY = 'BUSY',
  SOIL_WET = 'SOIL_WET',
}
export class RespondCareDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID('4') clientActionId?: string;
  @ApiProperty({ enum: CareResponse }) @IsEnum(CareResponse) action!: CareResponse;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() remindAt?: string;
}
export class CareTimingDto {
  @ApiProperty() @IsString() @MaxLength(80) timezone!: string;
  @ApiProperty({ minimum: 8, maximum: 20 }) @IsInt() @Min(8) @Max(20) hour!: number;
}

export class WateringContextDto {
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(1) @Max(60) dryingDays?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsIn(['WET', 'MOIST', 'DRY', 'UNKNOWN']) soilState?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH']) light?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsIn(['TERRACOTTA', 'PLASTIC', 'OTHER']) potMaterial?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsIn(['FAST_DRAINING', 'RETAINING', 'OTHER']) soilMix?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) @Max(100) humidity?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(-20) @Max(60) temperature?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() rainExposed?: boolean;
}

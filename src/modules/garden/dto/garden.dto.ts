import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
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

export class CreatePlantDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() species?: string;
  @ApiProperty() @IsString() @MinLength(2) location!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(1000) imageUrl?: string;
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
export class AddCareEventDto {
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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Length, Max, Min } from 'class-validator';

export enum MemoryTypeDto {
  PREFERENCE = 'PREFERENCE',
  ENVIRONMENT = 'ENVIRONMENT',
  GOAL = 'GOAL',
  EXPERIENCE = 'EXPERIENCE',
  GARDEN_PREFERENCE = 'GARDEN_PREFERENCE',
  PLANT_PREFERENCE = 'PLANT_PREFERENCE',
  SHOPPING_PREFERENCE = 'SHOPPING_PREFERENCE',
  CARE_PREFERENCE = 'CARE_PREFERENCE',
}

export class CreateConversationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;
}

export class SendAiMessageDto {
  @ApiProperty({ example: 'I have a sunny balcony and prefer low-maintenance plants.' })
  @IsString()
  @Length(2, 4000)
  message!: string;

  @ApiPropertyOptional({ description: 'A GreenNest Supabase Storage plant photo URL' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Current plant context for references such as "this plant"' })
  @IsOptional()
  @IsUUID()
  plantId?: string;
}

export class IdentifyPlantDto {
  @ApiProperty()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  imageUrl!: string;
}

export class GardenBriefingDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() temperature?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() humidity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) weather?: string;
}

export class UpdateMemoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  memoryKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  memoryValue?: string;

  @ApiPropertyOptional({ enum: MemoryTypeDto })
  @IsOptional()
  @IsEnum(MemoryTypeDto)
  memoryType?: MemoryTypeDto;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

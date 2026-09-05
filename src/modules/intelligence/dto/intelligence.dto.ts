import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AiFeedbackReason,
  EvidenceSource,
  PlantEventType,
  PlantLifecycleStatus,
  PlantOutcomeType,
  RecommendationOutcome,
  RecommendationStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreatePlantEventDto {
  @ApiProperty({ enum: PlantEventType })
  @IsEnum(PlantEventType)
  type!: PlantEventType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  eventKey?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  value?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  @ApiPropertyOptional({ enum: EvidenceSource })
  @IsOptional()
  @IsEnum(EvidenceSource)
  source?: EvidenceSource;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class UpdatePlantLifecycleDto {
  @ApiProperty({ enum: PlantLifecycleStatus })
  @IsEnum(PlantLifecycleStatus)
  status!: PlantLifecycleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 300)
  reason?: string;
}

export class RecordPlantOutcomeDto {
  @ApiProperty({ enum: PlantOutcomeType })
  @IsEnum(PlantOutcomeType)
  outcome!: PlantOutcomeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 300)
  reason?: string;

  @ApiProperty({ enum: EvidenceSource })
  @IsEnum(EvidenceSource)
  source!: EvidenceSource;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class AddPlantPhotoDto {
  @ApiProperty()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  url!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  analysis?: Record<string, unknown>;
}

export class RecommendationResponseDto {
  @ApiProperty({
    enum: [
      RecommendationStatus.ACCEPTED,
      RecommendationStatus.REJECTED,
      RecommendationStatus.SKIPPED,
      RecommendationStatus.DISMISSED,
      RecommendationStatus.COMPLETED,
    ],
  })
  @IsEnum(RecommendationStatus)
  status!:
    | 'ACCEPTED'
    | 'REJECTED'
    | 'SKIPPED'
    | 'DISMISSED'
    | 'COMPLETED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 300)
  reason?: string;

  @ApiPropertyOptional({ enum: RecommendationOutcome })
  @IsOptional()
  @IsEnum(RecommendationOutcome)
  outcome?: RecommendationOutcome;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  outcomeNote?: string;
}

export class AiFeedbackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  messageId?: string;

  @ApiProperty()
  @IsBoolean()
  helpful!: boolean;

  @ApiPropertyOptional({ enum: AiFeedbackReason })
  @IsOptional()
  @IsEnum(AiFeedbackReason)
  reason?: AiFeedbackReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}

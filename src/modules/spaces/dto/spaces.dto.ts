import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SpaceCarePreference, SpaceDesignStyle, SpaceType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class AnalyzeSpaceDto {
  @ApiProperty({ description: 'Short-lived signed URL for a private GreenNest space photo' })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  imageUrl!: string;

  @ApiProperty({ example: 'user-id/spaces/photo.jpg' })
  @IsString()
  @Length(10, 500)
  photoPath!: string;

  @ApiPropertyOptional({ enum: SpaceType })
  @IsOptional()
  @IsEnum(SpaceType)
  declaredType?: SpaceType;

  @ApiPropertyOptional({ enum: ['ENGLISH', 'HINDI'], default: 'ENGLISH' })
  @IsOptional()
  @IsIn(['ENGLISH', 'HINDI'])
  language?: 'ENGLISH' | 'HINDI';
}

export class RecommendPlantsDto {
  @ApiProperty({ enum: SpaceDesignStyle, default: SpaceDesignStyle.MINIMAL })
  @IsEnum(SpaceDesignStyle)
  style!: SpaceDesignStyle;

  @ApiProperty({ enum: SpaceCarePreference, default: SpaceCarePreference.EASY })
  @IsEnum(SpaceCarePreference)
  carePreference!: SpaceCarePreference;

  @ApiPropertyOptional({ enum: ['ENGLISH', 'HINDI'], default: 'ENGLISH' })
  @IsOptional()
  @IsIn(['ENGLISH', 'HINDI'])
  language?: 'ENGLISH' | 'HINDI';
}

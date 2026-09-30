import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  BookingStatus,
  OrderStatus,
  PlantEnvironment,
  PlantLifecycleStatus,
  SpaceAnalysisStatus,
  SpaceDesignStyle,
  SupportConversationStatus,
} from '@prisma/client';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) search?: string;
  @ApiPropertyOptional({ enum: ['newest', 'oldest'], default: 'newest' })
  @IsIn(['newest', 'oldest'])
  sort: 'newest' | 'oldest' = 'newest';
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true }) from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true }) to?: string;
}
export class OrderListQuery extends ListQueryDto {
  @ApiPropertyOptional({ enum: [...Object.values(OrderStatus), 'ACTIVE'] })
  @IsOptional()
  @IsIn([...Object.values(OrderStatus), 'ACTIVE'])
  status?: OrderStatus | 'ACTIVE';
}
export class BookingListQuery extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['createdAt', 'scheduledAt'], default: 'createdAt' })
  @IsIn(['createdAt', 'scheduledAt'])
  sortBy: 'createdAt' | 'scheduledAt' = 'createdAt';
  @ApiPropertyOptional({ enum: [...Object.values(BookingStatus), 'ACTIVE', 'HISTORY'] })
  @IsOptional()
  @IsIn([...Object.values(BookingStatus), 'ACTIVE', 'HISTORY'])
  status?: BookingStatus | 'ACTIVE' | 'HISTORY';
}
export class NotificationListQuery extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) type?: string;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unread?: boolean;
}
export class GardenListQuery extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) location?: string;
  @ApiPropertyOptional({ enum: PlantEnvironment })
  @IsOptional()
  @IsEnum(PlantEnvironment)
  environment?: PlantEnvironment;
  @ApiPropertyOptional({ enum: PlantLifecycleStatus })
  @IsOptional()
  @IsEnum(PlantLifecycleStatus)
  status?: PlantLifecycleStatus;
}
export class ServiceListQuery extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) category?: string;
}
export class SpaceListQuery extends ListQueryDto {
  @ApiPropertyOptional({ enum: SpaceAnalysisStatus })
  @IsOptional()
  @IsEnum(SpaceAnalysisStatus)
  status?: SpaceAnalysisStatus;
}
export class DesignListQuery extends ListQueryDto {
  @ApiPropertyOptional({ enum: SpaceDesignStyle })
  @IsOptional()
  @IsEnum(SpaceDesignStyle)
  style?: SpaceDesignStyle;
}
export class SupportListQuery extends ListQueryDto {
  @ApiPropertyOptional({ enum: SupportConversationStatus })
  @IsOptional()
  @IsEnum(SupportConversationStatus)
  status?: SupportConversationStatus;
}

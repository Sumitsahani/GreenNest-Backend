import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GardenerProfileDto {
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(100) city!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) serviceAreas!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Matches(/^\d{6}$/, { each: true })
  postalCodes!: string[];
  @IsInt() @Min(0) @Max(80) experienceYears!: number;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) skills!: string[];
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) plantTypes!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsUUID('all', { each: true })
  serviceIds!: string[];
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) languages!: string[];
  @IsString() @MaxLength(1500) about!: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
}
export class AvailabilityDto {
  @IsBoolean() available!: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workingDays!: number[];
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @IsInt() @Min(1) @Max(100) serviceRadiusKm!: number;
}
export class JobActionDto {
  @IsUUID() requestId!: string;
  @IsOptional() @IsString() @MaxLength(1500) note?: string;
  @IsOptional() @IsUUID() plantId?: string;
  @IsOptional() @IsIn(['BEFORE', 'AFTER']) phase?: 'BEFORE' | 'AFTER';
  @IsOptional() @IsUrl() photoUrl?: string;
  @IsOptional()
  @IsIn([
    'WATER',
    'SOIL_CHANGE',
    'REPOT',
    'PRUNE',
    'MOVE',
    'FERTILIZE',
    'PEST_TREATMENT',
    'FUNGUS_TREATMENT',
    'CLEAN',
    'INSPECT',
    'NO_ACTION',
    'OTHER',
  ])
  work?: string;
  @IsOptional() @IsObject() observations?: Record<string, string>;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional()
  @IsIn(['HEALTHY', 'IMPROVED', 'STABLE', 'DECLINED', 'DIED', 'UNKNOWN'])
  outcome?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}
export class GardenerChatDto {
  @IsOptional() @IsUUID() jobId?: string;
  @IsOptional() @IsUUID() plantId?: string;
  @IsString() @MaxLength(4000) message!: string;
  @IsOptional() @IsIn(['AUTO', 'ENGLISH', 'HINDI']) language?: 'AUTO' | 'ENGLISH' | 'HINDI';
}
export class VerifyGardenerDto {
  @IsBoolean() verified!: boolean;
}
export class RecordPayoutDto {
  @IsString() @MaxLength(120) reference!: string;
}

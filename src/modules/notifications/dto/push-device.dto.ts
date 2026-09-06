import { ApiProperty } from '@nestjs/swagger';
import { PushPlatform } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class PushDeviceDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @Matches(/^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]+\]$/, {
    message: 'token must be a valid Expo push token',
  })
  token!: string;

  @ApiProperty({ enum: PushPlatform })
  @IsEnum(PushPlatform)
  platform!: PushPlatform;

  @ApiProperty({ required: false, description: 'Current city/area used for important weather alerts' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locationLabel?: string;

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
}

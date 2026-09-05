import { NotificationAgeGroup, NotificationTone } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() orderUpdates?: boolean;
  @IsOptional() @IsBoolean() gardenerUpdates?: boolean;
  @IsOptional() @IsBoolean() careReminders?: boolean;
  @IsOptional() @IsBoolean() offers?: boolean;
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsEnum(NotificationAgeGroup) notificationAgeGroup?: NotificationAgeGroup;
  @IsOptional() @IsEnum(NotificationTone) notificationTone?: NotificationTone;
}

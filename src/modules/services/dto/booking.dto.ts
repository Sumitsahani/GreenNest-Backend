import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() serviceId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() addressId!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() scheduledAt!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUrl({}, { each: true })
  photoUrls?: string[];
}

import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsPostalCode, IsString, Length, MinLength } from 'class-validator';

export class CreateAddressDto {
  @ApiProperty() @IsString() @Length(2, 30) label!: string;
  @ApiProperty() @IsString() @MinLength(8) fullAddress!: string;
  @ApiProperty() @IsPostalCode('IN') postalCode!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isDefault?: boolean;
}
export class UpdateAddressDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(2, 30) label?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(8) fullAddress?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsPostalCode('IN') postalCode?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isDefault?: boolean;
}

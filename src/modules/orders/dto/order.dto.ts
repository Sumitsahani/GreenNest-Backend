import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID, IsOptional, IsString, Length } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(8, 100) requestId?: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() addressId!: string;
  @ApiProperty({ enum: ['COD'] }) @IsIn(['COD']) paymentMethod!: 'COD';
}

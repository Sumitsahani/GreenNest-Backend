import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() addressId!: string;
  @ApiProperty({ enum: ['COD'] }) @IsIn(['COD']) paymentMethod!: 'COD';
}

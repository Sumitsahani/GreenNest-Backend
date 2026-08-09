import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() productId!: string;
  @ApiProperty({ minimum: 1, maximum: 20 }) @Type(() => Number) @IsInt() @Min(1) @Max(20) quantity!: number;
}
export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: 20 }) @Type(() => Number) @IsInt() @Min(1) @Max(20) quantity!: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class RedeemRewardDto {
  @ApiProperty({ enum: ['free-delivery', 'order-50', 'service-100', 'care-kit'] })
  @IsIn(['free-delivery', 'order-50', 'service-100', 'care-kit'])
  rewardId!: string;
}

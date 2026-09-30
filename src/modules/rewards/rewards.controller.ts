import { ApiPaginatedResponse } from '../../common/paginated-response';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { Query, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { RedeemRewardDto } from './dto/rewards.dto';
import {
  type RewardRedemptionResult,
  type RewardsSummary,
  RewardsService,
} from './rewards.service';

@ApiTags('Rewards')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}
  @Get() summary(@CurrentUser() user: AuthenticatedUser): Promise<RewardsSummary> {
    return this.rewards.summary(user.id);
  }
  @ApiPaginatedResponse()
  @Get('transactions')
  transactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ): ReturnType<RewardsService['transactions']> {
    return this.rewards.transactions(user.id, query);
  }
  @ApiPaginatedResponse()
  @Get('redemptions')
  redemptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ): ReturnType<RewardsService['redemptions']> {
    return this.rewards.redemptions(user.id, query);
  }
  @Post('redeem')
  redeem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RedeemRewardDto,
  ): Promise<RewardRedemptionResult> {
    return this.rewards.redeem(user.id, dto.rewardId);
  }
}

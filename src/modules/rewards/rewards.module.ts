import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({ controllers: [RewardsController], providers: [RewardsService, SupabaseAuthGuard] })
export class RewardsModule {}

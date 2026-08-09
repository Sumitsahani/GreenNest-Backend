import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { GardenController } from './garden.controller';
import { GardenService } from './garden.service';

@Module({ controllers: [GardenController], providers: [GardenService, SupabaseAuthGuard] })
export class GardenModule {}

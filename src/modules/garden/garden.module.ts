import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { GardenController } from './garden.controller';
import { GardenService } from './garden.service';
import { GardenCarePlanService } from './garden-care-plan.service';
import { IntelligenceModule } from '../intelligence/intelligence.module';

@Module({ imports: [IntelligenceModule], controllers: [GardenController], providers: [GardenService, GardenCarePlanService, SupabaseAuthGuard] })
export class GardenModule {}

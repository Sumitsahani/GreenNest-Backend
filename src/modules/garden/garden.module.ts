import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { GardenController } from './garden.controller';
import { GardenService } from './garden.service';
import { GardenCarePlanService } from './garden-care-plan.service';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { WeatherCareService } from './weather-care.service';

@Module({
  imports: [IntelligenceModule],
  controllers: [GardenController],
  providers: [GardenService, GardenCarePlanService, WeatherCareService, SupabaseAuthGuard],
  exports: [WeatherCareService],
})
export class GardenModule {}

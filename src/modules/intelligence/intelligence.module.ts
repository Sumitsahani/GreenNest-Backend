import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { IntelligenceController } from './intelligence.controller';
import { NextBestActionService } from './next-best-action.service';
import { PlantIntelligenceService } from './plant-intelligence.service';
import { PlantStateService } from './plant-state.service';
import { UserGardeningProfileService } from './user-gardening-profile.service';
import { GardenIntelligenceService } from './garden-intelligence.service';
import { CareSessionService } from './care-session.service';

@Module({
  controllers: [IntelligenceController],
  providers: [
    PlantStateService,
    NextBestActionService,
    UserGardeningProfileService,
    PlantIntelligenceService,
    GardenIntelligenceService,
    CareSessionService,
    SupabaseAuthGuard,
  ],
  exports: [
    PlantStateService,
    NextBestActionService,
    UserGardeningProfileService,
    PlantIntelligenceService,
    GardenIntelligenceService,
  ],
})
export class IntelligenceModule {}

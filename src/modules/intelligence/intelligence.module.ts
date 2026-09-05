import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { IntelligenceController } from './intelligence.controller';
import { NextBestActionService } from './next-best-action.service';
import { PlantIntelligenceService } from './plant-intelligence.service';
import { PlantStateService } from './plant-state.service';
import { UserGardeningProfileService } from './user-gardening-profile.service';

@Module({
  controllers: [IntelligenceController],
  providers: [
    PlantStateService,
    NextBestActionService,
    UserGardeningProfileService,
    PlantIntelligenceService,
    SupabaseAuthGuard,
  ],
  exports: [
    PlantStateService,
    NextBestActionService,
    UserGardeningProfileService,
    PlantIntelligenceService,
  ],
})
export class IntelligenceModule {}

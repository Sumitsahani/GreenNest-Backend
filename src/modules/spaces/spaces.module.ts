import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AiModule } from '../ai/ai.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { PlantMatchingService } from './plant-matching.service';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

@Module({
  imports: [AiModule, IntelligenceModule],
  controllers: [SpacesController],
  providers: [SpacesService, PlantMatchingService, SupabaseAuthGuard],
})
export class SpacesModule {}

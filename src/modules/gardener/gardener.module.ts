import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { AiModule } from '../ai/ai.module';
import { GardenerService } from './gardener.service';
import { GardenerController } from './gardener.controller';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { VisitRouteService } from './visit-route.service';
@Module({
  imports: [IntelligenceModule, AiModule],
  controllers: [GardenerController, TrackingController],
  providers: [GardenerService, TrackingService, VisitRouteService, SupabaseAuthGuard],
})
export class GardenerModule {}

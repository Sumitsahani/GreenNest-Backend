import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AiModule } from '../ai/ai.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { PlantMatchingService } from './plant-matching.service';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { SpaceDesignsService } from './space-designs.service';
import { DesignImagesService } from './design-images.service';
import { DesignImageProvider } from './design-image-provider';
import { DesignImageStorage } from './design-image-storage';

@Module({
  imports: [AiModule, IntelligenceModule],
  controllers: [SpacesController],
  providers: [
    SpacesService,
    PlantMatchingService,
    SpaceDesignsService,
    DesignImagesService,
    DesignImageProvider,
    DesignImageStorage,
    SupabaseAuthGuard,
  ],
})
export class SpacesModule {}

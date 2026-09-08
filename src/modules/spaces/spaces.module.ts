import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AiModule } from '../ai/ai.module';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

@Module({
  imports: [AiModule],
  controllers: [SpacesController],
  providers: [SpacesService, SupabaseAuthGuard],
})
export class SpacesModule {}

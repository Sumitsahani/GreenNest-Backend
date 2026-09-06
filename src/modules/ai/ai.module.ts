import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AiContextService } from './ai-context.service';
import { AiController } from './ai.controller';
import { AiMemoryService } from './ai-memory.service';
import { AiResponseService } from './ai-response.service';
import { AiService } from './ai.service';
import { MemoryExtractorService } from './memory-extractor.service';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { QuestionUnderstandingService } from './question-understanding.service';
import { AiCareActionService } from './ai-care-action.service';
import { GardenModule } from '../garden/garden.module';

@Module({
  imports: [IntelligenceModule, GardenModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiMemoryService,
    MemoryExtractorService,
    AiContextService,
    AiResponseService,
    QuestionUnderstandingService,
    AiCareActionService,
    SupabaseAuthGuard,
  ],
  exports: [AiService, AiMemoryService],
})
export class AiModule {}

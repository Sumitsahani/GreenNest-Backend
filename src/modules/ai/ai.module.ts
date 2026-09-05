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

@Module({
  imports: [IntelligenceModule],
  controllers: [AiController],
  providers: [AiService, AiMemoryService, MemoryExtractorService, AiContextService, AiResponseService, QuestionUnderstandingService, SupabaseAuthGuard],
  exports: [AiService, AiMemoryService],
})
export class AiModule {}

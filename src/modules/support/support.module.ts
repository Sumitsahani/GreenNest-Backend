import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { SupportController } from './support.controller';
import { SupportAdminController } from './support-admin.controller';
import { SupportAgentGuard } from './support-agent.guard';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService, SupabaseAuthGuard, SupportAgentGuard],
})
export class SupportModule {}

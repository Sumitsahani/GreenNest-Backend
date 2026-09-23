import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAccessModule } from './admin-access.service';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { GardenerModule } from '../gardener/gardener.module';
import { SupportModule } from '../support/support.module';
@Module({
  imports: [AdminAccessModule, IntelligenceModule, GardenerModule, SupportModule],
  controllers: [AdminController],
  providers: [AdminService, SupabaseAuthGuard],
})
export class AdminModule {}

import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({ controllers: [ServicesController], providers: [ServicesService, SupabaseAuthGuard] })
export class ServicesModule {}

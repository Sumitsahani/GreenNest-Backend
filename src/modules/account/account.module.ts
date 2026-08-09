import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({ controllers: [AccountController], providers: [AccountService, SupabaseAuthGuard] })
export class AccountModule {}

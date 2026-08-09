import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

@Module({ controllers: [AddressesController], providers: [AddressesService, SupabaseAuthGuard], exports: [AddressesService] })
export class AddressesModule {}

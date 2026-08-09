import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({ imports: [CatalogModule], controllers: [CartController], providers: [CartService, SupabaseAuthGuard] })
export class CartModule {}

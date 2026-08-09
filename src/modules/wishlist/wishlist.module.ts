import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({ imports: [CatalogModule], controllers: [WishlistController], providers: [WishlistService, SupabaseAuthGuard] })
export class WishlistModule {}

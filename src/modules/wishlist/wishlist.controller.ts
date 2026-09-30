import { ApiPaginatedResponse } from '../../common/paginated-response';
import { ServiceListQuery } from '../../common/dto/list-query.dto';
import { Query, Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AddWishlistItemDto } from './dto/wishlist.dto';
import { WishlistService } from './wishlist.service';

@ApiTags('Wishlist')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}
  @ApiPaginatedResponse()
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ServiceListQuery,
  ): ReturnType<WishlistService['listPage']> {
    return this.wishlist.listPage(user.id, query);
  }
  @Post('items') add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddWishlistItemDto,
  ): Promise<{ saved: true }> {
    return this.wishlist.add(user.id, dto.productId);
  }
  @Delete('items/:productId') remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
  ): Promise<{ saved: false }> {
    return this.wishlist.remove(user.id, productId);
  }
}

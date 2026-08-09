import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { CartService, type CartResponse } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

@ApiTags('Cart') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser): Promise<CartResponse> { return this.cart.get(user.id); }
  @Post('items') add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddCartItemDto): Promise<CartResponse> { return this.cart.add(user.id, dto.productId, dto.quantity); }
  @Patch('items/:id') update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCartItemDto): Promise<CartResponse> { return this.cart.update(user.id, id, dto.quantity); }
  @Delete('items/:id') remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<CartResponse> { return this.cart.remove(user.id, id); }
  @Delete() clear(@CurrentUser() user: AuthenticatedUser): Promise<CartResponse> { return this.cart.clear(user.id); }
}

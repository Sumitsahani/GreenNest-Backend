import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { CreateOrderDto } from './dto/order.dto';
import { OrdersService, type OrderResponse } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    return this.orders.create(user.id, dto);
  }
  @Get() list(@CurrentUser() user: AuthenticatedUser): Promise<OrderResponse[]> {
    return this.orders.list(user.id);
  }
  @Get(':id') detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<OrderResponse> {
    return this.orders.detail(user.id, id);
  }
}

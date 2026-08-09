import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { CreateBookingDto } from './dto/booking.dto';
import { ServicesService } from './services.service';
import type { BookingResponse, ServiceResponse, SlotResponse } from './services.service';

@ApiTags('Gardening Services')
@Controller()
export class ServicesController {
  constructor(private readonly services: ServicesService) {}
  @Get('services') list(): Promise<ServiceResponse[]> {
    return this.services.list();
  }
  @Get('services/slots') slots(@Query('date') date: string): SlotResponse[] {
    return this.services.slots(date);
  }
  @Get('services/:id') detail(@Param('id') id: string): Promise<ServiceResponse> {
    return this.services.detail(id);
  }
  @Post('bookings') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingResponse> {
    return this.services.createBooking(user.id, dto);
  }
  @Get('bookings') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) bookings(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponse[]> {
    return this.services.bookings(user.id);
  }
  @Get('bookings/:id') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) booking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BookingResponse> {
    return this.services.booking(user.id, id);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Address } from '@prisma/client';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@ApiTags('Addresses') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser): Promise<Address[]> { return this.addresses.list(user.id); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAddressDto): Promise<Address> { return this.addresses.create(user.id, dto); }
  @Patch(':id') update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAddressDto): Promise<Address> { return this.addresses.update(user.id, id, dto); }
  @Delete(':id') remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<{ deleted: true }> { return this.addresses.remove(user.id, id); }
}

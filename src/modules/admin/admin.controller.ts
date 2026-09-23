import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AdminService } from './admin.service';
import { AdminChange, AdminQuery } from './admin.dto';

@Controller('admin')
@UseGuards(SupabaseAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get('me') me(@CurrentUser() u: AuthenticatedUser): ReturnType<AdminService['me']> {
    return this.admin.me(u);
  }
  @Get('dashboard') dashboard(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: AdminQuery,
  ): ReturnType<AdminService['dashboard']> {
    return this.admin.dashboard(u, q);
  }
  @Get('reports') reports(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: AdminQuery,
  ): ReturnType<AdminService['finance']> {
    return this.admin.finance(u, q);
  }
  @Get('system') health(@CurrentUser() u: AuthenticatedUser): ReturnType<AdminService['health']> {
    return this.admin.health(u);
  }
  @Get('customers') customers(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: AdminQuery,
  ): ReturnType<AdminService['customers']> {
    return this.admin.customers(u, q);
  }
  @Get('customers/:id') customer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): ReturnType<AdminService['customer']> {
    return this.admin.customer(u, id);
  }
  @Get(':resource/export') export(
    @CurrentUser() u: AuthenticatedUser,
    @Param('resource') key: string,
    @Query() q: AdminQuery,
  ): ReturnType<AdminService['export']> {
    return this.admin.export(u, key, q);
  }
  @Get(':resource') list(
    @CurrentUser() u: AuthenticatedUser,
    @Param('resource') key: string,
    @Query() q: AdminQuery,
  ): ReturnType<AdminService['list']> {
    return this.admin.list(u, key, q);
  }
  @Get(':resource/:id') detail(
    @CurrentUser() u: AuthenticatedUser,
    @Param('resource') key: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): ReturnType<AdminService['detail']> {
    return this.admin.detail(u, key, id);
  }
  @Post(':resource') create(
    @CurrentUser() u: AuthenticatedUser,
    @Param('resource') key: string,
    @Body() dto: AdminChange,
  ): ReturnType<AdminService['create']> {
    return this.admin.create(u, key, dto);
  }
  @Patch(':resource/:id') change(
    @CurrentUser() u: AuthenticatedUser,
    @Param('resource') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminChange,
  ): ReturnType<AdminService['change']> {
    return this.admin.change(u, key, id, dto);
  }
}

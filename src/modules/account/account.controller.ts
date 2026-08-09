import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Notification, UserSettings } from '@prisma/client';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AccountService } from './account.service';
import { UpdateSettingsDto } from './dto/settings.dto';

@ApiTags('Account') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller()
export class AccountController {
  constructor(private readonly account: AccountService) {}
  @Get('settings') settings(@CurrentUser() user: AuthenticatedUser): Promise<UserSettings> { return this.account.settings(user.id); }
  @Patch('settings') updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSettingsDto): Promise<UserSettings> { return this.account.updateSettings(user.id, dto); }
  @Get('notifications') notifications(@CurrentUser() user: AuthenticatedUser): Promise<Notification[]> { return this.account.notifications(user.id); }
  @Patch('notifications/:id/read') markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Notification> { return this.account.markRead(user.id, id); }
  @Post('notifications/read-all') readAll(@CurrentUser() user: AuthenticatedUser): Promise<{ updated: number }> { return this.account.readAll(user.id); }
}

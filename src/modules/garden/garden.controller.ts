import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { CareReminder } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import {
  AddCareEventDto,
  CreatePlantDto,
  CreateReminderDto,
  UpdateReminderDto,
} from './dto/garden.dto';
import { GardenService } from './garden.service';
import type { GardenPlantResponse } from './garden.service';

@ApiTags('My Garden')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('garden/plants')
export class GardenController {
  constructor(private readonly garden: GardenService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser): Promise<GardenPlantResponse[]> {
    return this.garden.list(user.id);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlantDto,
  ): Promise<GardenPlantResponse> {
    return this.garden.create(user.id, dto);
  }
  @Get(':id') detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GardenPlantResponse> {
    return this.garden.detail(user.id, id);
  }
  @Delete(':id') remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ deleted: true }> {
    return this.garden.remove(user.id, id);
  }
  @Post(':id/care-events') care(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddCareEventDto,
  ): Promise<GardenPlantResponse> {
    return this.garden.care(user.id, id, dto);
  }
  @Get(':id/reminders') reminders(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CareReminder[]> {
    return this.garden.reminders(user.id, id);
  }
  @Post(':id/reminders') createReminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateReminderDto,
  ): Promise<CareReminder> {
    return this.garden.createReminder(user.id, id, dto);
  }
  @Patch('reminders/:id') toggleReminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ): Promise<CareReminder> {
    return this.garden.toggleReminder(user.id, id, dto.enabled);
  }
}

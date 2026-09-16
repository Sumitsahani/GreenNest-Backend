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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { GardenerService } from './gardener.service';
import {
  AvailabilityDto,
  GardenerChatDto,
  GardenerProfileDto,
  JobActionDto,
  RecordPayoutDto,
  VerifyGardenerDto,
} from './gardener.dto';

function page(value?: string): number {
  const n = Number(value ?? 1);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10000) : 1;
}
@ApiTags('Gardener Mode')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class GardenerController {
  constructor(private readonly gardeners: GardenerService) {}
  @Get('gardener/access') access(@CurrentUser() u: AuthenticatedUser): ReturnType<GardenerService['access']> {
    return this.gardeners.access(u);
  }
  @Get('gardener/profile') profile(@CurrentUser() u: AuthenticatedUser): ReturnType<GardenerService['profile']> {
    return this.gardeners.profile(u.id);
  }
  @Post('gardener/register') register(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: GardenerProfileDto,
  ): ReturnType<GardenerService['saveProfile']> {
    return this.gardeners.saveProfile(u, dto);
  }
  @Patch('gardener/profile') save(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: GardenerProfileDto,
  ): ReturnType<GardenerService['saveProfile']> {
    return this.gardeners.saveProfile(u, dto);
  }
  @Get('gardener/dashboard') dashboard(@CurrentUser() u: AuthenticatedUser): ReturnType<GardenerService['dashboard']> {
    return this.gardeners.dashboard(u.id);
  }
  @Get('gardener/jobs') jobs(@CurrentUser() u: AuthenticatedUser, @Query('page') p?: string): ReturnType<GardenerService['jobs']> {
    return this.gardeners.jobs(u.id, page(p));
  }
  @Get('gardener/history') history(@CurrentUser() u: AuthenticatedUser, @Query('page') p?: string): ReturnType<GardenerService['jobs']> {
    return this.gardeners.jobs(u.id, page(p), true);
  }
  @Get('gardener/earnings') earnings(
    @CurrentUser() u: AuthenticatedUser,
    @Query('page') p?: string,
  ): ReturnType<GardenerService['earnings']> {
    return this.gardeners.earnings(u.id, page(p));
  }
  @Get('gardener/availability') availability(@CurrentUser() u: AuthenticatedUser): ReturnType<GardenerService['profile']> {
    return this.gardeners.profile(u.id);
  }
  @Patch('gardener/availability') setAvailability(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: AvailabilityDto,
  ): ReturnType<GardenerService['availability']> {
    return this.gardeners.availability(u.id, dto);
  }
  @Get('gardener/jobs/:id') detail(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): ReturnType<GardenerService['detail']> {
    return this.gardeners.detail(u.id, id);
  }
  @Get('gardener/jobs/:id/activities') activities(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') p?: string,
  ): ReturnType<GardenerService['activityPage']> {
    return this.gardeners.activityPage(u.id, id, page(p), false);
  }
  @Post('gardener/jobs/:id/:action') act(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: string,
    @Body() dto: JobActionDto,
  ): ReturnType<GardenerService['act']> {
    return this.gardeners.act(u.id, id, action, dto);
  }
  @Post('gardener/ai/chat') chat(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: GardenerChatDto,
  ): ReturnType<GardenerService['chat']> {
    return this.gardeners.chat(u.id, dto);
  }
  @Get('bookings/:id/visit') visit(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): ReturnType<GardenerService['detail']> {
    return this.gardeners.detail(u.id, id, true);
  }
  @Post('bookings/:id/visit/:action') customerAction(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: string,
    @Body() dto: JobActionDto,
  ): ReturnType<GardenerService['act']> {
    return this.gardeners.act(u.id, id, action, dto, true);
  }
  @Patch('admin/gardeners/:id/verification') verify(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyGardenerDto,
  ): ReturnType<GardenerService['verify']> {
    return this.gardeners.verify(u, id, dto.verified);
  }
  @Post('admin/gardener-payouts/:id/paid') payout(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPayoutDto,
  ): ReturnType<GardenerService['payout']> {
    return this.gardeners.payout(u, id, dto.reference);
  }
}

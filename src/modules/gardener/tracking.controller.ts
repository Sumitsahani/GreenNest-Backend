import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { TrackingService, TrackingPointDto } from './tracking.service';
import { VisitRouteService } from './visit-route.service';

@Controller('bookings/:id/tracking')
@UseGuards(SupabaseAuthGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService, private readonly routes: VisitRouteService) {}
  @Get('route') route(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Query('gardener') gardener?: string): ReturnType<VisitRouteService['route']> {
    return this.routes.route(user.id, id, gardener === 'true');
  }
  @Get() read(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Query('gardener') gardener?: string): ReturnType<TrackingService['read']> {
    return this.tracking.read(user.id, id, gardener === 'true');
  }
  @Put('location') location(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: TrackingPointDto): ReturnType<TrackingService['write']> {
    return this.tracking.write(user.id, id, body);
  }
  @Put('destination') destination(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: TrackingPointDto): ReturnType<TrackingService['write']> {
    return this.tracking.write(user.id, id, body, true);
  }
  @Delete('location') stop(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): ReturnType<TrackingService['stop']> {
    return this.tracking.stop(user.id, id);
  }
}

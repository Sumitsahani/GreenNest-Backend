import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { PushDevice } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { PushDeviceDto } from './dto/push-device.dto';
import { PushDeviceService } from './push-device.service';

@ApiTags('Push notifications')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('devices/push')
export class PushDeviceController {
  constructor(private readonly devices: PushDeviceService) {}

  @Post()
  @ApiOperation({ summary: 'Register or refresh this device Expo push token' })
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushDeviceDto,
  ): Promise<PushDevice> {
    return this.devices.register(user.id, dto);
  }

  @Post('unregister')
  @ApiOperation({ summary: 'Stop push notifications on this device' })
  unregister(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushDeviceDto,
  ): Promise<{ unregistered: true }> {
    return this.devices.unregister(user.id, dto.token);
  }
}

import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { GardenModule } from '../garden/garden.module';
import { CareReminderDispatcherService } from './care-reminder-dispatcher.service';
import { PushDeviceController } from './push-device.controller';
import { PushDeviceService } from './push-device.service';

@Module({
  imports: [GardenModule],
  controllers: [PushDeviceController],
  providers: [PushDeviceService, CareReminderDispatcherService, SupabaseAuthGuard],
})
export class NotificationsModule {}

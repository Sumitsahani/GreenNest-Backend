import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { GardenModule } from '../garden/garden.module';
import { CareReminderDispatcherService } from './care-reminder-dispatcher.service';
import { ExpoPushService } from './expo-push.service';
import { NotificationCopyService } from './notification-copy.service';
import { PushDeviceController } from './push-device.controller';
import { PushDeviceService } from './push-device.service';
import { WeatherAlertDispatcherService } from './weather-alert-dispatcher.service';

@Module({
  imports: [GardenModule],
  controllers: [PushDeviceController],
  providers: [
    PushDeviceService,
    ExpoPushService,
    NotificationCopyService,
    CareReminderDispatcherService,
    WeatherAlertDispatcherService,
    SupabaseAuthGuard,
  ],
})
export class NotificationsModule {}

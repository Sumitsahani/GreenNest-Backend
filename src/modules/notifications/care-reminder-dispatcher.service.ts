import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CareType, PlantLifecycleStatus, type PushDevice } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WeatherCareService } from '../garden/weather-care.service';

interface ExpoPushTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

@Injectable()
export class CareReminderDispatcherService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CareReminderDispatcherService.name);
  private dispatching = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly weatherCare: WeatherCareService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.dispatchDueReminders();
    this.timer = setInterval(() => void this.dispatchDueReminders(), 5 * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatchDueReminders(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      await this.dispatchBatch();
    } catch (error) {
      this.logger.error(
        `Reminder dispatch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.dispatching = false;
    }
  }

  private async dispatchBatch(): Promise<void> {
    const now = new Date();
    const candidateCutoff = new Date(now.getTime() + 2 * 86_400_000);
    const reminders = await this.prisma.careReminder.findMany({
      where: {
        enabled: true,
        type: CareType.WATER,
        scheduledAt: { lte: candidateCutoff },
        plant: {
          lifecycleStatus: { in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED] },
        },
      },
      include: { plant: true },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    });

    for (const reminder of reminders) {
      if (reminder.lastNotifiedAt && reminder.lastNotifiedAt >= reminder.scheduledAt) continue;
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId: reminder.plant.userId },
      });
      if (settings && (!settings.careReminders || !settings.pushEnabled)) continue;

      const smart = await this.weatherCare.createReminder({
        id: reminder.plant.id,
        name: reminder.plant.name,
        location: reminder.plant.location,
        weatherLocation: reminder.plant.weatherLocation,
        latitude: reminder.plant.latitude,
        longitude: reminder.plant.longitude,
        wateringDays: reminder.plant.wateringDays,
        lastWateredAt: reminder.plant.lastWateredAt,
        nextWateringAt: reminder.plant.nextWateringAt,
        reminder,
      });
      if (smart.scheduledAt > now) continue;

      const devices = await this.prisma.pushDevice.findMany({
        where: { userId: reminder.plant.userId, active: true },
      });
      const delivered = await this.sendExpoPush(devices, {
        title: `${reminder.plant.name}: ${smart.title}`,
        body: smart.reason,
        plantId: reminder.plant.id,
      });
      if (!delivered && devices.length > 0) continue;

      await this.prisma.$transaction([
        this.prisma.notification.create({
          data: {
            userId: reminder.plant.userId,
            title: `${reminder.plant.name}: ${smart.title}`,
            message: smart.reason,
            type: 'CARE_REMINDER',
          },
        }),
        this.prisma.careReminder.update({
          where: { id: reminder.id },
          data: { lastNotifiedAt: now },
        }),
      ]);
    }
  }

  private async sendExpoPush(
    devices: PushDevice[],
    content: { title: string; body: string; plantId: string },
  ): Promise<boolean> {
    if (devices.length === 0) return true;
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          devices.map((device) => ({
            to: device.token,
            sound: 'default',
            title: content.title,
            body: content.body,
            channelId: 'plant-care',
            data: { url: `/plant/${content.plantId}`, plantId: content.plantId },
          })),
        ),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        this.logger.warn(`Expo push service returned HTTP ${response.status}`);
        return false;
      }
      const body = (await response.json()) as { data?: ExpoPushTicket[] | ExpoPushTicket };
      const tickets = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
      await Promise.all(
        tickets.map((ticket, index) => {
          if (ticket.status !== 'error' || ticket.details?.error !== 'DeviceNotRegistered') {
            return Promise.resolve();
          }
          const device = devices[index];
          return device
            ? this.prisma.pushDevice.update({ where: { id: device.id }, data: { active: false } })
            : Promise.resolve();
        }),
      );
      return tickets.some((ticket) => ticket.status === 'ok');
    } catch (error) {
      this.logger.warn(
        `Expo push delivery failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }
}

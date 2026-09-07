import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CareType, PlantLifecycleStatus, type PushDevice } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WeatherCareService } from '../garden/weather-care.service';
import { canDeliverCare } from './care-delivery-policy';
import { GardenIntelligenceService } from '../intelligence/garden-intelligence.service';

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
    private readonly gardenIntelligence: GardenIntelligenceService,
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
        notificationCount: { lt: 3 },
        OR: [{ scheduledAt: { lte: candidateCutoff } }, { snoozedUntil: { lte: now } }],
        plant: {
          lifecycleStatus: { in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED] },
        },
      },
      include: { plant: true },
      orderBy: { scheduledAt: 'asc' },
      take: 250,
    });
    const userIds = [...new Set(reminders.map((reminder) => reminder.plant.userId))];
    for (const userId of userIds) {
      const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
      if (settings && !settings.careReminders) continue;
      const garden = await this.gardenIntelligence.today(userId);
      const actionable = new Map(garden.items.map((item) => [item.plant.id, item]));
      const unique = [
        ...new Map(
          reminders
            .filter((value) => value.plant.userId === userId && actionable.has(value.plant.id))
            .map((value) => [value.plant.id, value]),
        ).values(),
      ];
      const eligible: typeof reminders = [];
      for (const reminder of unique) {
        const smart = await this.weatherCare.createReminder({
          id: reminder.plant.id,
          name: reminder.plant.name,
          location: reminder.plant.location,
          environment: reminder.plant.environment,
          weatherLocation: reminder.plant.weatherLocation,
          latitude: reminder.plant.latitude,
          longitude: reminder.plant.longitude,
          wateringDays: reminder.plant.wateringDays,
          lastWateredAt: reminder.plant.lastWateredAt,
          nextWateringAt: reminder.plant.nextWateringAt,
          reminder,
        });
        if (
          canDeliverCare({
            now,
            dueAt: smart.scheduledAt,
            lastNotifiedAt: reminder.lastNotifiedAt,
            count: reminder.notificationCount,
            timezone: settings?.careTimezone ?? 'Asia/Kolkata',
            preferredHour: settings?.preferredCareHour ?? 9,
          })
        )
          eligible.push(reminder);
      }
      if (!eligible.length) continue;
      const title =
        eligible.length === 1
          ? `${eligible[0]!.plant.name}: care check due`
          : `${eligible.length} plants need care today`;
      const locations = [...new Set(eligible.map((value) => value.plant.location))];
      const message =
        eligible.length === 1
          ? actionable.get(eligible[0]!.plant.id)!.reason
          : `Review ${eligible.length} prioritized soil checks${locations.length ? ` in ${locations.slice(0, 2).join(' and ')}` : ''}. Mark only the plants you skipped.`;
      const claimedIds = await this.prisma.$transaction(async (tx) => {
        const ids: string[] = [];
        for (const reminder of eligible) {
          const claimed = await tx.careReminder.updateMany({
            where: {
              id: reminder.id,
              enabled: true,
              updatedAt: reminder.updatedAt,
              notificationCount: reminder.notificationCount,
            },
            data: { lastNotifiedAt: now, notificationCount: { increment: 1 } },
          });
          if (claimed.count) ids.push(reminder.id);
        }
        if (ids.length)
          await tx.notification.create({
            data: {
              userId,
              plantId: ids.length === 1 ? eligible[0]!.plant.id : null,
              title,
              message,
              type: 'GARDEN_CARE_BATCH',
            },
          });
        return ids;
      });
      if (!claimedIds.length || settings?.pushEnabled === false) continue;
      const devices = await this.prisma.pushDevice.findMany({ where: { userId, active: true } });
      await this.sendExpoPush(devices, {
        title,
        body: message,
        plantId: claimedIds.length === 1 ? eligible[0]!.plant.id : undefined,
        url: claimedIds.length === 1 ? `/plant/${eligible[0]!.plant.id}` : '/screen/batch-care',
      });
    }
  }

  private async sendExpoPush(
    devices: PushDevice[],
    content: { title: string; body: string; plantId?: string; url: string },
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
            data: {
              kind: 'CARE_REMINDER',
              url: content.url,
              plantId: content.plantId,
            },
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

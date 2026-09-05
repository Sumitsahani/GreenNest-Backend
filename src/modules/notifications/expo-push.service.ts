import { Injectable, Logger } from '@nestjs/common';
import type { PushDevice } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

interface ExpoPushTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

export interface PushContent {
  title: string;
  body: string;
  url: string;
  data?: Record<string, string>;
}

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendToUser(
    userId: string,
    content: PushContent,
  ): Promise<{ delivered: boolean; deviceCount: number }> {
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId, active: true },
    });
    if (devices.length === 0) return { delivered: true, deviceCount: 0 };

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
            data: { url: content.url, ...content.data },
          })),
        ),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        this.logger.warn(`Expo push service returned HTTP ${response.status}`);
        return { delivered: false, deviceCount: devices.length };
      }
      const body = (await response.json()) as {
        data?: ExpoPushTicket[] | ExpoPushTicket;
      };
      const tickets = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
      await this.disableUnregisteredDevices(devices, tickets);
      return {
        delivered: tickets.some((ticket) => ticket.status === 'ok'),
        deviceCount: devices.length,
      };
    } catch (error) {
      this.logger.warn(
        `Expo push delivery failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { delivered: false, deviceCount: devices.length };
    }
  }

  private async disableUnregisteredDevices(
    devices: PushDevice[],
    tickets: ExpoPushTicket[],
  ): Promise<void> {
    await Promise.all(
      tickets.map((ticket, index) => {
        if (ticket.status !== 'error' || ticket.details?.error !== 'DeviceNotRegistered') {
          return Promise.resolve();
        }
        const device = devices[index];
        return device
          ? this.prisma.pushDevice.update({
              where: { id: device.id },
              data: { active: false },
            })
          : Promise.resolve();
      }),
    );
  }
}

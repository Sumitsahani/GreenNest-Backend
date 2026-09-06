import { Injectable } from '@nestjs/common';
import type { PushDevice } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { PushDeviceDto } from './dto/push-device.dto';

@Injectable()
export class PushDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  register(userId: string, dto: PushDeviceDto): Promise<PushDevice> {
    const hasLocation = typeof dto.latitude === 'number' && typeof dto.longitude === 'number';
    return this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        locationLabel: dto.locationLabel,
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationUpdatedAt: hasLocation ? new Date() : undefined,
      },
      update: {
        userId,
        platform: dto.platform,
        ...(hasLocation
          ? {
              locationLabel: dto.locationLabel,
              latitude: dto.latitude,
              longitude: dto.longitude,
              locationUpdatedAt: new Date(),
            }
          : {}),
        active: true,
        lastSeenAt: new Date(),
      },
    });
  }

  async unregister(userId: string, token: string): Promise<{ unregistered: true }> {
    await this.prisma.pushDevice.updateMany({
      where: { userId, token },
      data: { active: false },
    });
    return { unregistered: true };
  }
}

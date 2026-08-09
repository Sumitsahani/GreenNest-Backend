import { Injectable } from '@nestjs/common';
import type { Notification, UserSettings } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  settings(userId: string): Promise<UserSettings> {
    return this.prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  updateSettings(userId: string, dto: UpdateSettingsDto): Promise<UserSettings> {
    return this.prisma.userSettings.upsert({ where: { userId }, create: { userId, ...dto }, update: dto });
  }

  async notifications(userId: string): Promise<Notification[]> {
    const count = await this.prisma.notification.count({ where: { userId } });
    if (count === 0) {
      await this.prisma.notification.create({ data: { userId, title: 'Welcome to GreenNest', message: 'Your garden, orders and service updates will appear here.', type: 'WELCOME' } });
    }
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  markRead(userId: string, id: string): Promise<Notification> {
    return this.prisma.notification.update({ where: { id, userId }, data: { readAt: new Date() } });
  }

  async readAll(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }
}

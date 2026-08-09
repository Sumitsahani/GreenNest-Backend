import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type CareReminder } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import {
  CareAction,
  type AddCareEventDto,
  type CreatePlantDto,
  type CreateReminderDto,
} from './dto/garden.dto';

export type GardenPlantResponse = Prisma.GardenPlantGetPayload<{ include: { careEvents: true } }>;

@Injectable()
export class GardenService {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: string): Promise<GardenPlantResponse[]> {
    return this.prisma.gardenPlant.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { careEvents: { orderBy: { caredAt: 'desc' }, take: 1 } },
    });
  }
  create(userId: string, dto: CreatePlantDto): Promise<GardenPlantResponse> {
    const nextWateringAt = new Date();
    nextWateringAt.setDate(nextWateringAt.getDate() + dto.wateringDays);
    return this.prisma.gardenPlant.create({
      data: { userId, ...dto, nextWateringAt },
      include: { careEvents: true },
    });
  }
  async detail(userId: string, id: string): Promise<GardenPlantResponse> {
    const plant = await this.prisma.gardenPlant.findFirst({
      where: { id, userId },
      include: { careEvents: { orderBy: { caredAt: 'desc' } } },
    });
    if (!plant)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Garden plant not found',
        HttpStatus.NOT_FOUND,
      );
    return plant;
  }
  async care(userId: string, id: string, dto: AddCareEventDto): Promise<GardenPlantResponse> {
    const plant = await this.detail(userId, id);
    const nextWateringAt = new Date();
    nextWateringAt.setDate(nextWateringAt.getDate() + plant.wateringDays);
    await this.prisma.$transaction([
      this.prisma.careEvent.create({ data: { plantId: id, type: dto.type, note: dto.note } }),
      this.prisma.gardenPlant.update({
        where: { id },
        data:
          dto.type === CareAction.WATER
            ? { nextWateringAt, health: Math.min(100, plant.health + 3) }
            : {},
      }),
    ]);
    return this.detail(userId, id);
  }
  async reminders(userId: string, plantId: string): Promise<CareReminder[]> {
    await this.detail(userId, plantId);
    return this.prisma.careReminder.findMany({
      where: { plantId },
      orderBy: { scheduledAt: 'asc' },
    });
  }
  async createReminder(
    userId: string,
    plantId: string,
    dto: CreateReminderDto,
  ): Promise<CareReminder> {
    await this.detail(userId, plantId);
    return this.prisma.careReminder.create({
      data: { plantId, type: dto.type, scheduledAt: new Date(dto.scheduledAt) },
    });
  }
  async toggleReminder(
    userId: string,
    reminderId: string,
    enabled: boolean,
  ): Promise<CareReminder> {
    const reminder = await this.prisma.careReminder.findFirst({
      where: { id: reminderId, plant: { userId } },
    });
    if (!reminder)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Care reminder not found',
        HttpStatus.NOT_FOUND,
      );
    return this.prisma.careReminder.update({ where: { id: reminderId }, data: { enabled } });
  }
}

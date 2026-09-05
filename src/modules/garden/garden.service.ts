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
import { GardenCarePlanService } from './garden-care-plan.service';
import { PlantLifecycleStatus } from '@prisma/client';
import { PlantIntelligenceService } from '../intelligence/plant-intelligence.service';

export type GardenPlantResponse = Prisma.GardenPlantGetPayload<{ include: { careEvents: true } }>;

@Injectable()
export class GardenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carePlans: GardenCarePlanService,
    private readonly intelligence: PlantIntelligenceService,
  ) {}
  list(userId: string): Promise<GardenPlantResponse[]> {
    return this.prisma.gardenPlant.findMany({
      where: {
        userId,
        lifecycleStatus: { in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED] },
      },
      orderBy: { createdAt: 'desc' },
      include: { careEvents: { orderBy: { caredAt: 'desc' }, take: 1 } },
    });
  }
  async create(userId: string, dto: CreatePlantDto): Promise<GardenPlantResponse> {
    const plan = await this.carePlans.create(dto);
    const lastWateredAt = new Date(dto.lastWateredAt);
    const nextWateringAt = new Date(lastWateredAt);
    nextWateringAt.setDate(nextWateringAt.getDate() + plan.wateringDays);
    const plant = await this.prisma.gardenPlant.create({
      data: {
        userId,
        name: dto.name,
        species: dto.species,
        location: dto.location,
        notes: dto.notes,
        imageUrl: dto.imageUrl,
        category: dto.category,
        source: dto.source,
        acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : undefined,
        lastWateredAt,
        nextWateringAt,
        ...plan,
        careEvents: { create: { type: CareAction.WATER, caredAt: lastWateredAt, note: 'Last watering provided when plant was added' } },
        reminders: { create: { type: CareAction.WATER, scheduledAt: nextWateringAt } },
      },
      include: { careEvents: true },
    });
    await this.intelligence.initializePlant(userId, plant.id, {
      imageUrl: dto.imageUrl,
      species: dto.species,
    });
    return plant;
  }
  async detail(userId: string, id: string): Promise<GardenPlantResponse> {
    let plant = await this.prisma.gardenPlant.findFirst({
      where: { id, userId },
      include: { careEvents: { orderBy: { caredAt: 'desc' } } },
    });
    if (!plant)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Garden plant not found',
        HttpStatus.NOT_FOUND,
      );
    const genericFallback = plant.carePlan === 'Check the top 2-3 cm of soil before watering. Water thoroughly only when it feels dry and ensure drainage.';
    if (!plant.carePlan || !plant.idealSunlight || !plant.placementAdvice || !plant.summerWatering || genericFallback) {
      const plan = await this.carePlans.create({
        name: plant.name,
        species: plant.species ?? undefined,
        location: plant.location,
        notes: plant.notes ?? undefined,
      });
      const lastWateredAt = plant.lastWateredAt ?? plant.createdAt;
      const nextWateringAt = new Date(lastWateredAt);
      nextWateringAt.setDate(nextWateringAt.getDate() + plan.wateringDays);
      plant = await this.prisma.gardenPlant.update({
        where: { id: plant.id },
        data: { ...plan, lastWateredAt, nextWateringAt },
        include: { careEvents: { orderBy: { caredAt: 'desc' } } },
      });
    }
    return plant;
  }
  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    await this.intelligence.updateLifecycle(userId, id, {
      status: PlantLifecycleStatus.REMOVED,
      reason: 'Removed by user',
    });
    return { deleted: true };
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
            ? { nextWateringAt, lastWateredAt: new Date(), health: Math.min(100, plant.health + 3) }
            : {},
      }),
    ]);
    await this.intelligence.recordCareEvent(userId, id, dto.type, dto.note);
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

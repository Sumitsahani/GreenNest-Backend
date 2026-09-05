import { HttpStatus, Injectable } from '@nestjs/common';
import { CareType, PlantLifecycleStatus, Prisma, type CareReminder } from '@prisma/client';
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
import { PlantIntelligenceService } from '../intelligence/plant-intelligence.service';
import { WeatherCareService, type SmartCareReminder } from './weather-care.service';

export type GardenPlantResponse = Prisma.GardenPlantGetPayload<{ include: { careEvents: true } }>;

@Injectable()
export class GardenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carePlans: GardenCarePlanService,
    private readonly intelligence: PlantIntelligenceService,
    private readonly weatherCare: WeatherCareService,
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
    const [plan, weatherLocation] = await Promise.all([
      this.carePlans.create(dto),
      this.weatherCare.resolveLocation({
        label: dto.weatherLocation,
        latitude: dto.latitude,
        longitude: dto.longitude,
      }),
    ]);
    const lastWateredAt = new Date(dto.lastWateredAt);
    const nextWateringAt = new Date(lastWateredAt);
    nextWateringAt.setDate(nextWateringAt.getDate() + plan.wateringDays);
    const plant = await this.prisma.gardenPlant.create({
      data: {
        userId,
        name: dto.name,
        species: dto.species,
        location: dto.location,
        weatherLocation: weatherLocation?.label ?? dto.weatherLocation,
        latitude: weatherLocation?.latitude,
        longitude: weatherLocation?.longitude,
        notes: dto.notes,
        imageUrl: dto.imageUrl,
        category: dto.category,
        source: dto.source,
        acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : undefined,
        lastWateredAt,
        nextWateringAt,
        ...plan,
        careEvents: {
          create: {
            type: CareAction.WATER,
            caredAt: lastWateredAt,
            note: 'Last watering provided when plant was added',
          },
        },
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
    let plant = await this.ownedPlant(userId, id);
    if (
      !plant.carePlan ||
      !plant.idealSunlight ||
      !plant.placementAdvice ||
      !plant.summerWatering ||
      !plant.normalWatering ||
      !plant.winterWatering
    ) {
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
    // Care actions must stay fast and reliable even when Gemini is unavailable.
    // Care-plan generation belongs to plant creation/backfill, never this write path.
    const plant = await this.ownedPlant(userId, id);
    const nextWateringAt = new Date();
    nextWateringAt.setDate(nextWateringAt.getDate() + plant.wateringDays);
    await this.prisma.$transaction(async (tx) => {
      await tx.careEvent.create({ data: { plantId: id, type: dto.type, note: dto.note } });
      await tx.gardenPlant.update({
        where: { id },
        data:
          dto.type === CareAction.WATER
            ? { nextWateringAt, lastWateredAt: new Date(), health: Math.min(100, plant.health + 3) }
            : {},
      });
      if (dto.type === CareAction.WATER) {
        await tx.careReminder.updateMany({
          where: { plantId: id, type: CareType.WATER, enabled: true },
          data: { scheduledAt: nextWateringAt, lastNotifiedAt: null },
        });
      }
    });
    await this.intelligence.recordCareEvent(userId, id, dto.type, dto.note);
    return this.ownedPlant(userId, id);
  }
  async reminders(userId: string, plantId: string): Promise<CareReminder[]> {
    await this.ownedPlant(userId, plantId);
    return this.prisma.careReminder.findMany({
      where: { plantId },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async smartReminders(userId: string): Promise<SmartCareReminder[]> {
    const plants = await this.prisma.gardenPlant.findMany({
      where: {
        userId,
        lifecycleStatus: { in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED] },
      },
      include: {
        reminders: {
          where: { type: CareType.WATER },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { nextWateringAt: 'asc' },
      take: 50,
    });
    const reminders = await Promise.all(
      plants.map((plant) =>
        this.weatherCare.createReminder({
          id: plant.id,
          name: plant.name,
          location: plant.location,
          weatherLocation: plant.weatherLocation,
          latitude: plant.latitude,
          longitude: plant.longitude,
          wateringDays: plant.wateringDays,
          lastWateredAt: plant.lastWateredAt,
          nextWateringAt: plant.nextWateringAt,
          reminder: plant.reminders[0] ?? null,
        }),
      ),
    );
    return reminders.sort(
      (left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime(),
    );
  }

  async smartReminder(userId: string, plantId: string): Promise<SmartCareReminder> {
    const plant = await this.prisma.gardenPlant.findFirst({
      where: { id: plantId, userId },
      include: {
        reminders: {
          where: { type: CareType.WATER },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
        },
      },
    });
    if (!plant) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Garden plant not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.weatherCare.createReminder({
      id: plant.id,
      name: plant.name,
      location: plant.location,
      weatherLocation: plant.weatherLocation,
      latitude: plant.latitude,
      longitude: plant.longitude,
      wateringDays: plant.wateringDays,
      lastWateredAt: plant.lastWateredAt,
      nextWateringAt: plant.nextWateringAt,
      reminder: plant.reminders[0] ?? null,
    });
  }
  async createReminder(
    userId: string,
    plantId: string,
    dto: CreateReminderDto,
  ): Promise<CareReminder> {
    await this.ownedPlant(userId, plantId);
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
    return this.prisma.careReminder.update({
      where: { id: reminderId },
      data: { enabled, ...(enabled ? { lastNotifiedAt: null } : {}) },
    });
  }

  private async ownedPlant(userId: string, id: string): Promise<GardenPlantResponse> {
    const plant = await this.prisma.gardenPlant.findFirst({
      where: { id, userId },
      include: { careEvents: { orderBy: { caredAt: 'desc' } } },
    });
    if (!plant) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Garden plant not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return plant;
  }
}

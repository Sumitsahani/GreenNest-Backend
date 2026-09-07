import { HttpStatus, Injectable } from '@nestjs/common';
import { CareType, PlantLifecycleStatus, Prisma, type CareReminder } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import {
  CareAction,
  CareResponse,
  type RespondCareDto,
  type CareTimingDto,
  type AddCareEventDto,
  type CreatePlantDto,
  type CreateReminderDto,
} from './dto/garden.dto';
import { GardenCarePlanService } from './garden-care-plan.service';
import { PlantIntelligenceService } from '../intelligence/plant-intelligence.service';
import { WeatherCareService, type SmartCareReminder } from './weather-care.service';
import { GardenIntelligenceService } from '../intelligence/garden-intelligence.service';

export type GardenPlantResponse = Prisma.GardenPlantGetPayload<{ include: { careEvents: true } }>;
export interface CareTimingResponse {
  timezone: string;
  hour: number;
  suggestedHour: number | null;
}

@Injectable()
export class GardenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carePlans: GardenCarePlanService,
    private readonly intelligence: PlantIntelligenceService,
    private readonly weatherCare: WeatherCareService,
    private readonly gardenIntelligence: GardenIntelligenceService,
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
        environment: dto.environment,
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
    this.gardenIntelligence.invalidate(userId);
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
        environment: plant.environment,
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
    this.gardenIntelligence.invalidate(userId);
    return { deleted: true };
  }
  async care(userId: string, id: string, dto: AddCareEventDto): Promise<GardenPlantResponse> {
    return this.recordCareAt(userId, id, dto, new Date());
  }

  async careTiming(userId: string): Promise<CareTimingResponse> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    const timezone = settings?.careTimezone ?? 'Asia/Kolkata';
    const hour = settings?.preferredCareHour ?? 9;
    const events = await this.prisma.careEvent.findMany({
      where: {
        type: CareType.WATER,
        plant: { userId },
        OR: [{ note: null }, { note: { not: 'Last watering provided when plant was added' } }],
      },
      orderBy: { caredAt: 'desc' },
      take: 20,
    });
    const hours = events.map((event) =>
      Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: 'numeric',
          hourCycle: 'h23',
        }).format(event.caredAt),
      ),
    );
    const counts = hours.reduce<Record<number, number>>((all, value) => {
      all[value] = (all[value] ?? 0) + 1;
      return all;
    }, {});
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const suggestedHour =
      best &&
      best[1] >= 3 &&
      best[1] / hours.length >= 0.6 &&
      Number(best[0]) >= 8 &&
      Number(best[0]) <= 20 &&
      Number(best[0]) !== hour
        ? Number(best[0])
        : null;
    return { timezone, hour, suggestedHour };
  }

  async setCareTiming(userId: string, dto: CareTimingDto): Promise<CareTimingResponse> {
    try {
      new Intl.DateTimeFormat('en', { timeZone: dto.timezone }).format();
    } catch {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Invalid timezone',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, careTimezone: dto.timezone, preferredCareHour: dto.hour },
      update: { careTimezone: dto.timezone, preferredCareHour: dto.hour },
    });
    return this.careTiming(userId);
  }

  async respondCare(userId: string, id: string, dto: RespondCareDto): Promise<GardenPlantResponse> {
    const plant = await this.ownedPlant(userId, id);
    if (!['ACTIVE', 'MOVED'].includes(plant.lifecycleStatus)) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'This plant is no longer in active care',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.action === CareResponse.WATERED)
      return this.care(userId, id, {
        type: CareAction.WATER,
        note: 'Watering confirmed from care reminder',
      });
    const now = new Date();
    const until =
      dto.action === CareResponse.SOIL_WET
        ? new Date(now.getTime() + 24 * 60 * 60_000)
        : new Date(dto.remindAt ?? '');
    if (
      !Number.isFinite(until.getTime()) ||
      until <= now ||
      until.getTime() > now.getTime() + 7 * 86_400_000
    ) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Choose a future check-in within seven days',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const data = {
        snoozedUntil: until,
        responseReason: dto.action,
        notificationCount: 0,
        lastNotifiedAt: null,
      };
      const changed = await tx.careReminder.updateMany({
        where: { plantId: id, type: CareType.WATER, enabled: true },
        data,
      });
      if (!changed.count)
        await tx.careReminder.create({
          data: { plantId: id, type: CareType.WATER, scheduledAt: plant.nextWateringAt, ...data },
        });
      await tx.careEvent.create({
        data: {
          plantId: id,
          type: CareType.NOTE,
          caredAt: now,
          note: `${dto.action}: soil check deferred until ${until.toISOString()}`,
        },
      });
      await tx.notification.updateMany({
        where: { userId, plantId: id, type: 'CARE_REMINDER', readAt: null },
        data: { readAt: now },
      });
    });
    return this.ownedPlant(userId, id);
  }

  async recordWateringAt(
    userId: string,
    id: string,
    caredAt: Date,
    note?: string,
  ): Promise<GardenPlantResponse> {
    return this.recordCareAt(userId, id, { type: CareAction.WATER, note }, caredAt);
  }

  async rescheduleWatering(
    userId: string,
    id: string,
    scheduledAt: Date,
    note?: string,
  ): Promise<GardenPlantResponse> {
    await this.ownedPlant(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.gardenPlant.update({
        where: { id },
        data: { nextWateringAt: scheduledAt },
      });
      const updated = await tx.careReminder.updateMany({
        where: { plantId: id, type: CareType.WATER, enabled: true },
        data: {
          scheduledAt,
          snoozedUntil: scheduledAt,
          responseReason: 'BUSY',
          notificationCount: 0,
          lastNotifiedAt: null,
        },
      });
      if (!updated.count) {
        await tx.careReminder.create({
          data: {
            plantId: id,
            type: CareType.WATER,
            scheduledAt,
            snoozedUntil: scheduledAt,
            responseReason: 'BUSY',
          },
        });
      }
    });
    await this.intelligence.recordCareEvent(
      userId,
      id,
      CareAction.NOTE,
      note ?? `Next watering rescheduled to ${scheduledAt.toISOString()}`,
    );
    this.gardenIntelligence.invalidate(userId);
    return this.ownedPlant(userId, id);
  }

  private async recordCareAt(
    userId: string,
    id: string,
    dto: AddCareEventDto,
    caredAt: Date,
  ): Promise<GardenPlantResponse> {
    // Care actions must stay fast and reliable even when Gemini is unavailable.
    // Care-plan generation belongs to plant creation/backfill, never this write path.
    const plant = await this.ownedPlant(userId, id);
    const nextWateringAt = new Date(caredAt);
    nextWateringAt.setDate(nextWateringAt.getDate() + plant.wateringDays);
    await this.prisma.$transaction(async (tx) => {
      await tx.careEvent.create({
        data: { plantId: id, type: dto.type, note: dto.note, caredAt },
      });
      await tx.gardenPlant.update({
        where: { id },
        data:
          dto.type === CareAction.WATER
            ? {
                nextWateringAt,
                lastWateredAt: caredAt,
                health: Math.min(100, plant.health + 3),
              }
            : {},
      });
      if (dto.type === CareAction.WATER) {
        await tx.careReminder.updateMany({
          where: { plantId: id, type: CareType.WATER, enabled: true },
          data: {
            scheduledAt: nextWateringAt,
            lastNotifiedAt: null,
            snoozedUntil: null,
            responseReason: null,
            notificationCount: 0,
          },
        });
        await tx.notification.updateMany({
          where: { userId, plantId: id, type: 'CARE_REMINDER', readAt: null },
          data: { readAt: caredAt },
        });
      }
    });
    await this.intelligence.recordCareEvent(userId, id, dto.type, dto.note);
    this.gardenIntelligence.invalidate(userId);
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
      take: 250,
    });
    const reminders = await Promise.all(
      plants.map((plant) =>
        this.weatherCare.createReminder({
          id: plant.id,
          name: plant.name,
          location: plant.location,
          environment: plant.environment,
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
      environment: plant.environment,
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

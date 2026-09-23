import { calculateWatering, wateringCheckAt, wateringEvidence } from '../garden/watering-engine';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CareSessionItemStatus,
  CareSessionStatus,
  CareType,
  EvidenceSource,
  PlantEventType,
  PlantLifecycleStatus,
  RecommendationAction,
  RecommendationStatus,
  type CareSession,
  type Prisma,
} from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { CompleteBatchCareDto } from './dto/garden-intelligence.dto';
import { GardenIntelligenceService } from './garden-intelligence.service';

export type CareSessionResult = CareSession & {
  items: Array<{
    id: string;
    plantId: string;
    status: CareSessionItemStatus;
    caredAt: Date | null;
  }>;
};

@Injectable()
export class CareSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly garden: GardenIntelligenceService,
  ) {}

  async complete(userId: string, dto: CompleteBatchCareDto): Promise<CareSessionResult> {
    if (dto.actionType !== CareType.WATER)
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Batch care currently supports watering',
        HttpStatus.BAD_REQUEST,
      );
    if (!dto.plantIds.length)
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Choose at least one plant',
        HttpStatus.BAD_REQUEST,
      );
    const skipped = new Set(dto.skippedPlantIds ?? []);
    if (
      Object.entries(dto.skipReasons ?? {}).some(
        ([id, reason]) => !skipped.has(id) || !['SKIP', 'SOIL_WET', 'BUSY'].includes(reason),
      )
    )
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Invalid reason for a skipped plant',
        HttpStatus.BAD_REQUEST,
      );
    if ([...skipped].some((id) => !dto.plantIds.includes(id)))
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Skipped plants must belong to this care session',
        HttpStatus.BAD_REQUEST,
      );
    const plants = await this.prisma.gardenPlant.findMany({
      where: {
        id: { in: dto.plantIds },
        userId,
        lifecycleStatus: { in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED] },
      },
      include: wateringEvidence,
    });
    if (plants.length !== dto.plantIds.length)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'One or more plants were not found in your active garden',
        HttpStatus.NOT_FOUND,
      );
    const now = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (!Number.isFinite(now.getTime()) || now.getTime() > Date.now() + 60_000)
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, 'Watering time cannot be in the future', HttpStatus.BAD_REQUEST);
    const session = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
        if (dto.clientActionId) {
          const previous = await tx.careSession.findUnique({ where: { id: dto.clientActionId }, include: { items: true } });
          if (previous) {
            if (previous.userId !== userId || previous.items.length !== dto.plantIds.length || previous.items.some(i => !dto.plantIds.includes(i.plantId) || (i.status === 'SKIPPED') !== skipped.has(i.plantId)))
              throw new BusinessException(ErrorCode.VALIDATION_ERROR, 'Session action ID was already used', HttpStatus.CONFLICT);
            return previous;
          }
        }
        const created = await tx.careSession.create({
          data: {
            id: dto.clientActionId,
            userId,
            actionType: CareType.WATER,
            source: EvidenceSource.USER_REPORTED,
            confidence: 0.8,
            status: CareSessionStatus.ACTIVE,
          },
        });
        const currentPlants = await tx.gardenPlant.findMany({ where: { id: { in: dto.plantIds }, userId, lifecycleStatus: { in: ['ACTIVE', 'MOVED'] } }, include: wateringEvidence });
        if (currentPlants.length !== dto.plantIds.length) throw new BusinessException(ErrorCode.NOT_FOUND, 'One or more plants left active care', HttpStatus.NOT_FOUND);
        for (const plant of currentPlants) {
          if (skipped.has(plant.id)) {
            const reason = dto.skipReasons?.[plant.id] ?? 'SKIP';
            const event = await tx.plantEvent.create({
              data: {
                userId,
                plantId: plant.id,
                type: PlantEventType.WATERING_SKIPPED,
                eventKey: 'batch_care_exception',
                value: { sessionId: created.id, reason },
                source: EvidenceSource.USER_REPORTED,
                confidence: 0.8,
                occurredAt: now,
              },
            });
            if (reason !== 'SKIP')
              await tx.careReminder.updateMany({
                where: { plantId: plant.id, type: CareType.WATER, enabled: true },
                data: {
                  snoozedUntil: new Date(
                    now.getTime() + (reason === 'SOIL_WET' ? 24 : 3) * 3_600_000,
                  ),
                  responseReason: reason,
                  lastNotifiedAt: null,
                  notificationCount: 0,
                },
              });
            await tx.careSessionItem.create({
              data: {
                sessionId: created.id,
                plantId: plant.id,
                status: CareSessionItemStatus.SKIPPED,
                eventId: event.id,
              },
            });
            continue;
          }
          const latest = plant.lastWateredAt && plant.lastWateredAt > now ? plant.lastWateredAt : now;
          const nextWateringAt = wateringCheckAt(calculateWatering({ ...plant, lastWateredAt: latest, careEvents: [{ type: 'WATER', caredAt: now }, ...(plant.careEvents ?? [])] }));
          const careEvent = await tx.careEvent.create({
            data: {
              plantId: plant.id,
              type: CareType.WATER,
              note: `User-reported batch watering (${created.id})`,
              caredAt: now,
            },
          });
          const event = await tx.plantEvent.create({
            data: {
              userId,
              plantId: plant.id,
              type: PlantEventType.WATERED,
              eventKey: 'batch_care',
              value: { sessionId: created.id, careEventId: careEvent.id },
              source: EvidenceSource.USER_REPORTED,
              confidence: 0.8,
              occurredAt: now,
            },
          });
          await tx.careSessionItem.create({
            data: {
              sessionId: created.id,
              plantId: plant.id,
              status: CareSessionItemStatus.COMPLETED,
              caredAt: now,
              eventId: event.id,
              careEventId: careEvent.id,
            },
          });
          await tx.gardenPlant.update({
            where: { id: plant.id },
            data: { lastWateredAt: latest, nextWateringAt },
          });
          await tx.careReminder.updateMany({
            where: { plantId: plant.id, type: CareType.WATER, enabled: true },
            data: {
              scheduledAt: nextWateringAt,
              lastNotifiedAt: null,
              snoozedUntil: null,
              responseReason: null,
              notificationCount: 0,
            },
          });
          await tx.plantRecommendation.updateMany({
            where: {
              userId,
              plantId: plant.id,
              action: RecommendationAction.WATER,
              status: {
                in: [
                  RecommendationStatus.GENERATED,
                  RecommendationStatus.SHOWN,
                  RecommendationStatus.ACCEPTED,
                ],
              },
            },
            data: { status: RecommendationStatus.COMPLETED, completedAt: now, respondedAt: now },
          });
          await tx.notification.updateMany({
            where: { userId, plantId: plant.id, type: 'CARE_REMINDER', readAt: null },
            data: { readAt: now },
          });
        }
        await tx.engagementEvent.create({
          data: {
            userId,
            name: 'care_session_completed',
            properties: {
              sessionId: created.id,
              total: plants.length,
              completed: plants.length - skipped.size,
              skipped: skipped.size,
            },
          },
        });
        return tx.careSession.update({
          where: { id: created.id },
          data: { status: CareSessionStatus.COMPLETED, completedAt: now },
          include: { items: { select: { id: true, plantId: true, status: true, caredAt: true } } },
        });
      },
      { timeout: 30_000 },
    );
    this.garden.invalidate(userId);
    return session;
  }

  async undo(userId: string, sessionId: string, plantIds?: string[]): Promise<CareSessionResult> {
    const session = await this.prisma.careSession.findFirst({
      where: { id: sessionId, userId },
      include: { items: { include: { plant: true } } },
    });
    if (!session)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Care session not found',
        HttpStatus.NOT_FOUND,
      );
    if (
      session.status !== CareSessionStatus.COMPLETED ||
      !session.completedAt ||
      (!plantIds && Date.now() - session.completedAt.getTime() > 15 * 60_000)
    ) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Completed care sessions can be undone for 15 minutes',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (plantIds && (!plantIds.length || plantIds.some(id => !session.items.some(item => item.plantId === id && item.status === CareSessionItemStatus.COMPLETED))))
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, 'Choose completed plants from this session', HttpStatus.BAD_REQUEST);
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;

      const current = await tx.careSession.findFirstOrThrow({ where: { id: sessionId, userId }, include: { items: { include: { plant: true } } } });
      if (current.status !== CareSessionStatus.COMPLETED) throw new BusinessException(ErrorCode.VALIDATION_ERROR, 'Session was already corrected', HttpStatus.CONFLICT);
      for (const item of current.items.filter(
        (value) => value.status === CareSessionItemStatus.COMPLETED && (!plantIds || plantIds.includes(value.plantId)),
      )) {
        if (item.careEventId)
          await tx.careEvent.deleteMany({ where: { id: item.careEventId, plantId: item.plantId } });
        const previous = await tx.careEvent.findFirst({
          where: {
            plantId: item.plantId,
            type: CareType.WATER,
            caredAt: { lt: item.caredAt ?? now },
          },
          orderBy: { caredAt: 'desc' },
        });
        const remaining = await tx.gardenPlant.findUniqueOrThrow({ where: { id: item.plantId }, include: wateringEvidence });
        const nextWateringAt = wateringCheckAt(calculateWatering({ ...remaining, lastWateredAt: previous?.caredAt ?? null }));
        if (item.plant.lastWateredAt?.getTime() === item.caredAt?.getTime()) {
          await tx.gardenPlant.update({
            where: { id: item.plantId },
            data: { lastWateredAt: previous?.caredAt ?? null, nextWateringAt },
          });
          await tx.careReminder.updateMany({
            where: { plantId: item.plantId, type: CareType.WATER, enabled: true },
            data: { scheduledAt: nextWateringAt, lastNotifiedAt: null, notificationCount: 0 },
          });
        }
        await tx.plantEvent.create({
          data: {
            userId,
            plantId: item.plantId,
            type: PlantEventType.USER_NOTE,
            eventKey: 'batch_care_undo',
            value: { sessionId, originalEventId: item.eventId },
            note: 'User corrected a previously reported batch watering.',
            source: EvidenceSource.USER_CORRECTION,
            confidence: 1,
            occurredAt: now,
          },
        });
      }
      await tx.careSessionItem.updateMany({
        where: { sessionId, status: CareSessionItemStatus.COMPLETED, ...(plantIds ? { plantId: { in: plantIds } } : {}) },
        data: { status: CareSessionItemStatus.UNDONE },
      });
      await tx.engagementEvent.create({
        data: { userId, name: 'care_session_undone', properties: { sessionId } },
      });
      return tx.careSession.update({
        where: { id: sessionId },
        data: { status: plantIds && current.items.some(item => item.status === CareSessionItemStatus.COMPLETED && !plantIds.includes(item.plantId)) ? CareSessionStatus.COMPLETED : CareSessionStatus.UNDONE, undoneAt: now },
        include: { items: { select: { id: true, plantId: true, status: true, caredAt: true } } },
      });
    });
    this.garden.invalidate(userId);
    return result;
  }

  recordEngagement(
    userId: string,
    name: string,
    properties?: Record<string, unknown>,
  ): Promise<unknown> {
    const allowed = new Set([
      'garden_today_opened',
      'garden_today_action_started',
      'weekly_review_opened',
      'plant_history_opened',
      'space_design_to_plant_addition',
      'space_design_commerce_intent',
      'space_photo_uploaded',
      'space_analysis_completed',
    ]);
    if (!allowed.has(name))
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Unsupported engagement event',
        HttpStatus.BAD_REQUEST,
      );
    return this.prisma.engagementEvent.create({
      data: { userId, name, properties: properties as Prisma.InputJsonValue | undefined },
    });
  }
}

import { Injectable } from '@nestjs/common';
import {
  EvidenceSource,
  PlantEventType,
  PlantLifecycleStatus,
  PlantOutcomeType,
  RecommendationAction,
  RecommendationPriority,
  RecommendationStatus,
  RecoveryCheckpointStatus,
  type Prisma,
} from '@prisma/client';
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { RecoveryOutcomeDto } from './dto/garden-intelligence.dto';
import { PrismaService } from '../../database/prisma.service';
import { NextBestActionService } from './next-best-action.service';

export type GardenPlantStatus =
  | 'HEALTHY'
  | 'NEEDS_WATER'
  | 'CHECK_SOIL'
  | 'NEEDS_INSPECTION'
  | 'RECOVERING'
  | 'AT_RISK'
  | 'ACTION_RECOMMENDED'
  | 'NO_ACTION'
  | 'UNKNOWN';
export type GardenPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface GardenAttentionItem {
  plant: { id: string; name: string; species: string | null; location: string; health: number };
  status: GardenPlantStatus;
  priority: GardenPriority;
  action: RecommendationAction;
  confidence: number;
  reason: string;
  recommendationId: string | null;
}

export interface GardenTodayResult {
  totalPlants: number;
  attentionCount: number;
  healthyCount: number;
  recoveringCount: number;
  atRiskCount: number;
  zeroAction: boolean;
  headline: string;
  nextBestAction: GardenAttentionItem | null;
  groups: Array<{
    action: RecommendationAction;
    location: string;
    priority: GardenPriority;
    count: number;
    plantIds: string[];
  }>;
  items: GardenAttentionItem[];
  recoveryCheckpoints: Array<{
    id: string;
    plantId: string;
    plantName: string;
    dayOffset: number;
    dueAt: Date;
  }>;
  progressUpdates: Array<{ plantId: string; plantName: string; message: string; evidenceAt: Date }>;
  generatedAt: Date;
}

const activeRecommendationStatuses: RecommendationStatus[] = [
  RecommendationStatus.GENERATED,
  RecommendationStatus.SHOWN,
  RecommendationStatus.ACCEPTED,
];
const priorityRank: Record<GardenPriority, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  NONE: 1,
};

@Injectable()
export class GardenIntelligenceService {
  private readonly cache = new Map<string, { expiresAt: number; value: GardenTodayResult }>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: NextBestActionService,
  ) {}

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  async today(userId: string): Promise<GardenTodayResult> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [plants, checkpoints] = await Promise.all([
      this.prisma.gardenPlant.findMany({
        where: {
          userId,
          lifecycleStatus: { in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED] },
        },
        select: {
          id: true,
          name: true,
          species: true,
          location: true,
          health: true,
          lastWateredAt: true,
          nextWateringAt: true,
          wateringDays: true,
          recommendations: {
            where: { status: { in: activeRecommendationStatuses } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          memories: { where: { status: 'ACTIVE' }, orderBy: { updatedAt: 'desc' }, take: 8 },
          outcomes: {
            where: { recordedAt: { gte: since } },
            orderBy: { recordedAt: 'desc' },
            take: 2,
          },
          photos: { where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 2 },
          recoveryCheckpoints: {
            where: { status: RecoveryCheckpointStatus.PENDING },
            orderBy: { dueAt: 'asc' },
            take: 1,
          },
        },
        orderBy: [{ health: 'asc' }, { nextWateringAt: 'asc' }],
        take: 250,
      }),
      this.prisma.recoveryCheckpoint.findMany({
        where: {
          userId,
          status: RecoveryCheckpointStatus.PENDING,
          dueAt: { lte: now },
          plant: {
            lifecycleStatus: { in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED] },
          },
        },
        include: { plant: { select: { name: true } } },
        orderBy: { dueAt: 'asc' },
        take: 20,
      }),
    ]);

    const allItems = plants.map((plant): GardenAttentionItem => {
      const recommendation = plant.recommendations[0];
      const decision =
        recommendation ??
        this.actions.decide({
          health: plant.health,
          lastWateredAt: plant.lastWateredAt,
          nextWateringAt: plant.nextWateringAt,
          wateringDays: plant.wateringDays,
          learnedSignals: plant.memories.map((memory) => ({
            key: memory.memoryKey,
            value: memory.memoryValue,
            confidence: Number(memory.confidence),
            source: memory.source,
          })),
          now,
        });
      const recovering =
        plant.recoveryCheckpoints.length > 0 ||
        plant.outcomes[0]?.outcome === PlantOutcomeType.IMPROVED;
      const status = this.statusFor(
        decision.action,
        plant.health,
        recovering,
        Boolean(recommendation),
      );
      return {
        plant: {
          id: plant.id,
          name: plant.name,
          species: plant.species,
          location: plant.location,
          health: plant.health,
        },
        status,
        priority: this.priorityFor(decision.priority, plant.health, status),
        action: decision.action,
        confidence: Number(decision.confidence),
        reason: decision.reason,
        recommendationId: recommendation?.id ?? null,
      };
    });
    const dueRecoveryPlantIds = new Set(
      checkpoints.map((checkpoint) => checkpoint.plantId),
    );
    const items = allItems
      .filter(
        (item) =>
          !['HEALTHY', 'NO_ACTION'].includes(item.status) &&
          (item.status !== 'RECOVERING' ||
            dueRecoveryPlantIds.has(item.plant.id)),
      )
      .sort(
        (a, b) =>
          priorityRank[b.priority] - priorityRank[a.priority] || b.confidence - a.confidence,
      );
    const healthyCount = allItems.filter((item) =>
      ['HEALTHY', 'NO_ACTION'].includes(item.status),
    ).length;
    const groups = [
      ...new Map(
        items.map((item) => {
          const key = `${item.action}:${item.plant.location}:${item.priority}`;
          return [
            key,
            {
              action: item.action,
              location: item.plant.location,
              priority: item.priority,
              count: 0,
              plantIds: [] as string[],
            },
          ];
        }),
      ).values(),
    ];
    for (const item of items) {
      const group = groups.find(
        (value) =>
          value.action === item.action &&
          value.location === item.plant.location &&
          value.priority === item.priority,
      )!;
      group.count += 1;
      group.plantIds.push(item.plant.id);
    }
    const progressUpdates = plants.flatMap((plant) => this.progressFor(plant));
    const value: GardenTodayResult = {
      totalPlants: plants.length,
      attentionCount: items.length,
      healthyCount,
      recoveringCount: allItems.filter((item) => item.status === 'RECOVERING').length,
      atRiskCount: allItems.filter((item) => item.status === 'AT_RISK').length,
      zeroAction: items.length === 0,
      headline: !plants.length
        ? 'Add your first plant to start your garden memory.'
        : items.length
          ? `${items.length} plant${items.length === 1 ? '' : 's'} need attention`
          : 'Your garden looks good today.',
      nextBestAction: items[0] ?? null,
      groups,
      items,
      recoveryCheckpoints: checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        plantId: checkpoint.plantId,
        plantName: checkpoint.plant.name,
        dayOffset: checkpoint.dayOffset,
        dueAt: checkpoint.dueAt,
      })),
      progressUpdates,
      generatedAt: now,
    };
    this.cache.set(userId, { expiresAt: Date.now() + 60_000, value });
    return value;
  }

  async weeklyReview(userId: string): Promise<Record<string, unknown>> {
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setUTCHours(0, 0, 0, 0);
    periodStart.setUTCDate(periodStart.getUTCDate() - periodStart.getUTCDay());
    const existing = await this.prisma.gardenReview.findUnique({
      where: { userId_periodStart: { userId, periodStart } },
    });
    if (existing && existing.updatedAt.getTime() > Date.now() - 60 * 60_000)
      return existing.summary as Record<string, unknown>;
    const today = await this.today(userId);
    const [careActions, newPlants] = await Promise.all([
      this.prisma.plantEvent.count({
        where: {
          userId,
          type: {
            in: [PlantEventType.WATERED, PlantEventType.FERTILIZED, PlantEventType.REPOTTED],
          },
          occurredAt: { gte: periodStart },
        },
      }),
      this.prisma.gardenPlant.count({ where: { userId, createdAt: { gte: periodStart } } }),
    ]);
    const summary = {
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      totalPlants: today.totalPlants,
      healthyCount: today.healthyCount,
      recoveringCount: today.recoveringCount,
      attentionCount: today.attentionCount,
      careActionsCompleted: careActions,
      newPlants,
      meaningfulChanges: today.progressUpdates
        .slice(0, 4)
        .map((update) => ({ ...update, evidenceAt: update.evidenceAt.toISOString() })),
      hasMeaningfulChanges:
        careActions > 0 ||
        newPlants > 0 ||
        today.progressUpdates.length > 0 ||
        today.atRiskCount > 0,
    };
    await this.prisma.gardenReview.upsert({
      where: { userId_periodStart: { userId, periodStart } },
      create: { userId, periodStart, periodEnd: now, summary },
      update: { periodEnd: now, summary },
    });
    return summary;
  }

  async completeRecoveryCheckpoint(
    userId: string,
    checkpointId: string,
    dto: RecoveryOutcomeDto,
  ): Promise<unknown> {
    const checkpoint = await this.prisma.recoveryCheckpoint.findFirst({
      where: { id: checkpointId, userId },
      include: { plant: { select: { id: true, name: true } } },
    });
    if (!checkpoint)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Recovery checkpoint not found',
        HttpStatus.NOT_FOUND,
      );
    if (checkpoint.status !== RecoveryCheckpointStatus.PENDING)
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Recovery checkpoint is already closed',
        HttpStatus.BAD_REQUEST,
      );
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.recoveryCheckpoint.update({
        where: { id: checkpointId },
        data: {
          status: RecoveryCheckpointStatus.COMPLETED,
          completedAt: now,
          outcome: dto.outcome,
        },
      });
      await tx.plantOutcomeRecord.create({
        data: {
          userId,
          plantId: checkpoint.plantId,
          outcome: dto.outcome,
          reason: dto.note,
          source: EvidenceSource.USER_REPORTED,
          confidence: 0.8,
          recordedAt: now,
        },
      });
      await tx.plantEvent.create({
        data: {
          userId,
          plantId: checkpoint.plantId,
          type: PlantEventType.OUTCOME_RECORDED,
          eventKey: 'recovery_checkpoint',
          value: { checkpointId, dayOffset: checkpoint.dayOffset, outcome: dto.outcome },
          note: dto.note,
          source: EvidenceSource.USER_REPORTED,
          confidence: 0.8,
          occurredAt: now,
        },
      });
      if (dto.outcome === PlantOutcomeType.DECLINED || dto.outcome === PlantOutcomeType.UNKNOWN) {
        await tx.plantRecommendation.updateMany({
          where: {
            userId,
            plantId: checkpoint.plantId,
            action: RecommendationAction.TREAT,
            status: { in: activeRecommendationStatuses },
          },
          data: {
            status: RecommendationStatus.DISMISSED,
            respondedAt: now,
            userResponseReason: 'Treatment did not produce a confirmed improvement',
          },
        });
        await tx.plantRecommendation.create({
          data: {
            userId,
            plantId: checkpoint.plantId,
            action: RecommendationAction.INSPECT,
            priority: RecommendationPriority.HIGH,
            confidence: 0.9,
            reason:
              "The plant hasn't shown confirmed improvement after the previous intervention. Reassess symptoms and current conditions before choosing another treatment.",
            signals: ['treatment_outcome', 'reassessment_required'],
          },
        });
        await tx.recoveryCheckpoint.updateMany({
          where: { plantId: checkpoint.plantId, status: RecoveryCheckpointStatus.PENDING },
          data: { status: RecoveryCheckpointStatus.CANCELLED },
        });
      }
      return updated;
    });
    this.invalidate(userId);
    return result;
  }

  private statusFor(
    action: RecommendationAction,
    health: number,
    recovering: boolean,
    hasActiveRecommendation: boolean,
  ): GardenPlantStatus {
    if (health < 60) return health < 35 ? 'AT_RISK' : 'NEEDS_INSPECTION';
    if (recovering) return 'RECOVERING';
    if (action === RecommendationAction.WATER) return 'NEEDS_WATER';
    if (action === RecommendationAction.SKIP_WATERING)
      return hasActiveRecommendation ? 'CHECK_SOIL' : 'NO_ACTION';
    if (action === RecommendationAction.MONITOR) return 'HEALTHY';
    if (action === RecommendationAction.INSPECT) return 'NEEDS_INSPECTION';
    if (action === RecommendationAction.NO_ACTION) return 'NO_ACTION';
    return 'ACTION_RECOMMENDED';
  }

  private priorityFor(
    priority: RecommendationPriority,
    health: number,
    status: GardenPlantStatus,
  ): GardenPriority {
    if (health < 35 || priority === RecommendationPriority.URGENT) return 'CRITICAL';
    if (health < 60 || priority === RecommendationPriority.HIGH || status === 'AT_RISK')
      return 'HIGH';
    if (priority === RecommendationPriority.MEDIUM) return 'MEDIUM';
    if (priority === RecommendationPriority.LOW) return 'LOW';
    return 'NONE';
  }

  private progressFor(plant: {
    id: string;
    name: string;
    outcomes: Array<{ outcome: PlantOutcomeType; recordedAt: Date }>;
    photos: Array<{ analysis: Prisma.JsonValue; createdAt: Date }>;
  }): GardenTodayResult['progressUpdates'] {
    const latestOutcome = plant.outcomes[0];
    if (
      latestOutcome &&
      (latestOutcome.outcome === PlantOutcomeType.IMPROVED ||
        latestOutcome.outcome === PlantOutcomeType.HEALTHY)
    ) {
      return [
        {
          plantId: plant.id,
          plantName: plant.name,
          message:
            latestOutcome.outcome === PlantOutcomeType.IMPROVED
              ? 'A recorded outcome shows recovery is progressing.'
              : 'The latest recorded outcome is healthy.',
          evidenceAt: latestOutcome.recordedAt,
        },
      ];
    }
    const photo = plant.photos.find((item) => {
      const data = item.analysis as Record<string, unknown> | null;
      return (
        data && (data.newLeaf === true || data.flowering === true || data.healthImproved === true)
      );
    });
    if (!photo) return [];
    const data = photo.analysis as Record<string, unknown>;
    const message =
      data.newLeaf === true
        ? 'A new leaf was recorded in the latest photo.'
        : data.flowering === true
          ? 'Flowering was recorded in the latest photo.'
          : 'The latest photo analysis recorded healthier growth.';
    return [{ plantId: plant.id, plantName: plant.name, message, evidenceAt: photo.createdAt }];
  }
}

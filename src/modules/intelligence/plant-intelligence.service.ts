import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AiMemoryType,
  EvidenceSource,
  MemoryStatus,
  PlantEventType,
  PlantLifecycleStatus,
  PlantOutcomeType,
  PlantRelationshipType,
  Prisma,
  RecommendationStatus,
  type AiFeedback,
  type AiUserMemory,
  type GardenPlant,
  type PlantEvent,
  type PlantOutcomeRecord,
  type PlantPhoto,
  type PlantRecommendation,
  type PlantRelationship,
} from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type {
  AddPlantPhotoDto,
  AiFeedbackDto,
  CreatePlantEventDto,
  RecommendationResponseDto,
  RecordPlantOutcomeDto,
  UpdatePlantLifecycleDto,
} from './dto/intelligence.dto';
import { NextBestActionService } from './next-best-action.service';
import { PlantStateService, type PlantState } from './plant-state.service';
import { UserGardeningProfileService } from './user-gardening-profile.service';

type HistoricalRelationship = PlantRelationship & {
  previousPlant: Pick<
    GardenPlant,
    'id' | 'name' | 'species' | 'lifecycleStatus'
  > & { outcomes: PlantOutcomeRecord[] };
};

interface PlantIntelligenceResult {
  plantState: PlantState;
  recommendation: PlantRecommendation;
  relationships: HistoricalRelationship[];
  personalizedInsight: string | null;
}

interface GardenTodayResult {
  attentionCount: number;
  healthyCount: number;
  items: Array<{
    plant: Pick<GardenPlant, 'id' | 'name' | 'species' | 'health'>;
    recommendation: PlantRecommendation;
  }>;
}

@Injectable()
export class PlantIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: PlantStateService,
    private readonly actions: NextBestActionService,
    private readonly profiles: UserGardeningProfileService,
  ) {}

  async intelligence(
    userId: string,
    plantId: string,
    environment?: { temperature?: number; humidity?: number },
  ): Promise<PlantIntelligenceResult> {
    const [state, relationships] = await Promise.all([
      this.states.getPlantState(plantId, userId),
      this.prisma.plantRelationship.findMany({
        where: { userId, newPlantId: plantId },
        include: {
          previousPlant: {
            select: {
              id: true,
              name: true,
              species: true,
              lifecycleStatus: true,
              outcomes: { orderBy: { recordedAt: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: { confidence: 'desc' },
        take: 6,
      }),
    ]);
    const recommendation = await this.ensureRecommendation(
      userId,
      plantId,
      state,
      environment,
      relationships,
    );
    return {
      plantState: state,
      recommendation,
      relationships,
      personalizedInsight: this.personalizedInsight(relationships),
    };
  }

  async gardenToday(
    userId: string,
    environment?: { temperature?: number; humidity?: number },
  ): Promise<GardenTodayResult> {
    const plants = await this.prisma.gardenPlant.findMany({
      where: {
        userId,
        lifecycleStatus: {
          in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED],
        },
      },
      select: { id: true, name: true, species: true, health: true },
      orderBy: { nextWateringAt: 'asc' },
      take: 30,
    });
    const items = await Promise.all(
      plants.map(async (plant) => {
        const state = await this.states.getPlantState(plant.id, userId);
        const recommendation = await this.ensureRecommendation(
          userId,
          plant.id,
          state,
          environment,
        );
        return { plant, recommendation };
      }),
    );
    const activeStatuses = new Set<RecommendationStatus>([
      RecommendationStatus.GENERATED,
      RecommendationStatus.SHOWN,
      RecommendationStatus.ACCEPTED,
    ]);
    const actionableItems = items.filter(({ recommendation }) =>
      activeStatuses.has(recommendation.status),
    );
    const needsAttention = actionableItems.filter(
      ({ recommendation }) => recommendation.action !== 'NO_ACTION' && recommendation.action !== 'MONITOR',
    );
    return {
      attentionCount: needsAttention.length,
      healthyCount: plants.filter((plant) => plant.health >= 80).length,
      items: needsAttention,
    };
  }

  gardeningProfile(
    userId: string,
  ): ReturnType<UserGardeningProfileService['build']> {
    return this.profiles.build(userId);
  }

  memories(userId: string, plantId: string): Promise<AiUserMemory[]> {
    return this.prisma.aiUserMemory.findMany({
      where: { userId, plantId, status: MemoryStatus.ACTIVE },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async initializePlant(
    userId: string,
    plantId: string,
    input: { imageUrl?: string; species?: string },
  ): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.plantEvent.create({
        data: {
          userId,
          plantId,
          type: PlantEventType.CREATED,
          source: EvidenceSource.SYSTEM_EVENT,
          value: { species: input.species ?? null },
        },
      }),
    ];
    if (input.species) {
      operations.push(
        this.prisma.plantEvent.create({
          data: {
            userId,
            plantId,
            type: PlantEventType.IDENTIFIED,
            source: EvidenceSource.PLANT_ANALYSIS,
            value: { species: input.species },
          },
        }),
      );
    }
    if (input.imageUrl) {
      operations.push(
        this.prisma.plantPhoto.create({
          data: { userId, plantId, url: input.imageUrl },
        }),
        this.prisma.plantEvent.create({
          data: {
            userId,
            plantId,
            type: PlantEventType.PHOTO_UPLOADED,
            source: EvidenceSource.USER_ACTION,
          },
        }),
      );
    }
    await this.prisma.$transaction(operations);
    await this.crossReference(userId, plantId);
  }

  async recordCareEvent(
    userId: string,
    plantId: string,
    careType: string,
    note?: string,
  ): Promise<void> {
    const typeByCare: Record<string, PlantEventType> = {
      WATER: PlantEventType.WATERED,
      FERTILIZE: PlantEventType.FERTILIZED,
      REPOT: PlantEventType.REPOTTED,
      NOTE: PlantEventType.USER_NOTE,
      PRUNE: PlantEventType.USER_NOTE,
    };
    await this.prisma.plantEvent.create({
      data: {
        userId,
        plantId,
        type: typeByCare[careType] ?? PlantEventType.USER_NOTE,
        note,
        source: EvidenceSource.USER_ACTION,
      },
    });
  }

  async learnFromConversation(
    userId: string,
    plantId: string | undefined,
    message: string,
  ): Promise<void> {
    if (!plantId) return;
    const plant = await this.assertPlant(userId, plantId);
    const text = message.trim();
    const moved = /\b(?:moved|shifted|placed)\s+(?:it|this plant|the plant)?\s*(?:to|near|in)\s+(?:the\s+)?([^.!?]{2,80})/i.exec(text)?.[1]?.trim();
    const soilWet = /\bsoil\s+(?:is|feels|stays|remains)\s+(?:still\s+)?(?:wet|moist)\b/i.test(text);
    const died = /\b(?:plant\s+)?(?:died|is dead|has died)\b/i.test(text);

    if (moved) {
      await this.prisma.$transaction(async (tx) => {
        await tx.gardenPlant.update({
          where: { id: plantId },
          data: {
            location: moved,
            lifecycleStatus: PlantLifecycleStatus.MOVED,
            statusUpdatedAt: new Date(),
          },
        });
        await tx.plantEvent.create({
          data: {
            userId,
            plantId,
            type: PlantEventType.MOVED,
            eventKey: 'location',
            value: { oldLocation: plant.location, newLocation: moved },
            note: text.slice(0, 500),
            source: EvidenceSource.USER_STATEMENT,
          },
        });
        const memoryKey = 'current_location';
        const scopeKey = `PLANT:${plantId}`;
        const previous = await tx.aiUserMemory.findUnique({
          where: {
            userId_scopeKey_memoryKey: {
              userId,
              scopeKey,
              memoryKey,
            },
          },
        });
        if (
          previous?.status === MemoryStatus.ACTIVE &&
          previous.memoryValue !== moved
        ) {
          await tx.aiUserMemory.update({
            where: { id: previous.id },
            data: {
              memoryKey: `${memoryKey}:superseded:${previous.id}`,
              status: MemoryStatus.SUPERSEDED,
              supersededAt: new Date(),
            },
          });
        }
        await tx.aiUserMemory.upsert({
          where: {
            userId_scopeKey_memoryKey: { userId, scopeKey, memoryKey },
          },
          create: {
            userId,
            plantId,
            scopeKey,
            memoryKey,
            memoryValue: moved,
            memoryType: AiMemoryType.ENVIRONMENT,
            confidence: 0.98,
            source: EvidenceSource.USER_STATEMENT,
            evidence: { statement: text.slice(0, 300) },
          },
          update: {
            memoryValue: moved,
            confidence: 0.98,
            source: EvidenceSource.USER_STATEMENT,
            evidence: { statement: text.slice(0, 300) },
            reinforcementCount: { increment: 1 },
            status: MemoryStatus.ACTIVE,
            supersededAt: null,
          },
        });
      });
    }

    if (soilWet) {
      await this.prisma.plantEvent.create({
        data: {
          userId,
          plantId,
          type: PlantEventType.SYMPTOM_REPORTED,
          eventKey: 'soil_wet',
          value: { observation: 'soil is still wet' },
          note: text.slice(0, 500),
          source: EvidenceSource.USER_STATEMENT,
        },
      });
    }

    if (died && plant.lifecycleStatus !== PlantLifecycleStatus.DIED) {
      const uncertain = /\b(?:think|maybe|may|might|possibly|probably)\b/i.test(text);
      const overwatered = /overwater/i.test(text);
      const reason = overwatered
        ? `${uncertain ? 'POSSIBLE_CAUSE: ' : ''}OVERWATERING`
        : undefined;
      await this.updateLifecycle(
        userId,
        plantId,
        { status: PlantLifecycleStatus.DIED, reason },
        {
          source: EvidenceSource.USER_STATEMENT,
          confidence: uncertain ? 0.75 : 1,
        },
      );
    }
  }

  async recordEvent(
    userId: string,
    plantId: string,
    dto: CreatePlantEventDto,
  ): Promise<PlantEvent> {
    await this.assertPlant(userId, plantId);
    return this.prisma.plantEvent.create({
      data: {
        userId,
        plantId,
        type: dto.type,
        eventKey: dto.eventKey?.trim(),
        value: dto.value as Prisma.InputJsonValue | undefined,
        note: dto.note?.trim(),
        source: dto.source ?? EvidenceSource.USER_STATEMENT,
        confidence: dto.confidence ?? 1,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      },
    });
  }

  async addPhoto(
    userId: string,
    plantId: string,
    dto: AddPlantPhotoDto,
  ): Promise<PlantPhoto> {
    await this.assertPlant(userId, plantId);
    return this.prisma.$transaction(async (tx) => {
      const photo = await tx.plantPhoto.create({
        data: {
          userId,
          plantId,
          url: dto.url,
          analysis: dto.analysis as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.plantEvent.create({
        data: {
          userId,
          plantId,
          type: PlantEventType.PHOTO_UPLOADED,
          source: EvidenceSource.USER_ACTION,
        },
      });
      await tx.gardenPlant.update({
        where: { id: plantId },
        data: { imageUrl: dto.url },
      });
      return photo;
    });
  }

  async updateLifecycle(
    userId: string,
    plantId: string,
    dto: UpdatePlantLifecycleDto,
    evidence: { source?: EvidenceSource; confidence?: number } = {},
  ): Promise<GardenPlant> {
    await this.assertPlant(userId, plantId);
    const outcomeByStatus: Partial<Record<PlantLifecycleStatus, PlantOutcomeType>> = {
      [PlantLifecycleStatus.DIED]: PlantOutcomeType.DIED,
      [PlantLifecycleStatus.GIFTED]: PlantOutcomeType.GIFTED,
      [PlantLifecycleStatus.REMOVED]: PlantOutcomeType.REMOVED,
    };
    return this.prisma.$transaction(async (tx) => {
      const plant = await tx.gardenPlant.update({
        where: { id: plantId },
        data: { lifecycleStatus: dto.status, statusUpdatedAt: new Date() },
      });
      await tx.careReminder.updateMany({
        where: { plantId },
        data: {
          enabled: new Set<PlantLifecycleStatus>([
            PlantLifecycleStatus.ACTIVE,
            PlantLifecycleStatus.MOVED,
          ]).has(dto.status),
        },
      });
      const outcome = outcomeByStatus[dto.status];
      if (outcome) {
        await tx.plantOutcomeRecord.create({
          data: {
            userId,
            plantId,
            outcome,
            reason: dto.reason,
            source: evidence.source ?? EvidenceSource.USER_STATEMENT,
            confidence: evidence.confidence ?? 1,
          },
        });
      }
      await tx.plantEvent.create({
        data: {
          userId,
          plantId,
          type: outcome
            ? PlantEventType.OUTCOME_RECORDED
            : PlantEventType.MOVED,
          eventKey: 'lifecycle_status',
          value: { status: dto.status },
          note: dto.reason,
          source: evidence.source ?? EvidenceSource.USER_STATEMENT,
          confidence: evidence.confidence ?? 1,
        },
      });
      return plant;
    });
  }

  async recordOutcome(
    userId: string,
    plantId: string,
    dto: RecordPlantOutcomeDto,
  ): Promise<PlantOutcomeRecord> {
    await this.assertPlant(userId, plantId);
    return this.prisma.$transaction(async (tx) => {
      const outcome = await tx.plantOutcomeRecord.create({
        data: {
          userId,
          plantId,
          outcome: dto.outcome,
          reason: dto.reason?.trim(),
          source: dto.source,
          confidence:
            dto.confidence ??
            (dto.source === EvidenceSource.AI_INFERENCE ? 0.6 : 1),
        },
      });
      await tx.plantEvent.create({
        data: {
          userId,
          plantId,
          type: PlantEventType.OUTCOME_RECORDED,
          eventKey: 'plant_outcome',
          value: { outcome: dto.outcome, reason: dto.reason ?? null },
          source: dto.source,
          confidence: outcome.confidence,
        },
      });
      return outcome;
    });
  }

  async respondToRecommendation(
    userId: string,
    recommendationId: string,
    dto: RecommendationResponseDto,
  ): Promise<PlantRecommendation> {
    const recommendation = await this.prisma.plantRecommendation.findFirst({
      where: { id: recommendationId, userId },
    });
    if (!recommendation) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'Recommendation not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const eventByStatus: Partial<Record<RecommendationStatus, PlantEventType>> = {
      [RecommendationStatus.ACCEPTED]: PlantEventType.RECOMMENDATION_ACCEPTED,
      [RecommendationStatus.REJECTED]: PlantEventType.RECOMMENDATION_REJECTED,
      [RecommendationStatus.SKIPPED]: PlantEventType.RECOMMENDATION_SKIPPED,
      [RecommendationStatus.DISMISSED]: PlantEventType.RECOMMENDATION_DISMISSED,
      [RecommendationStatus.COMPLETED]: PlantEventType.RECOMMENDATION_COMPLETED,
    };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.plantRecommendation.update({
        where: { id: recommendationId },
        data: {
          status: dto.status,
          respondedAt: new Date(),
          completedAt:
            dto.status === RecommendationStatus.COMPLETED
              ? new Date()
              : undefined,
          userResponseReason: dto.reason?.trim(),
          outcome: dto.outcome,
          outcomeNote: dto.outcomeNote?.trim(),
        },
      });
      await tx.plantEvent.create({
        data: {
          userId,
          plantId: recommendation.plantId,
          type:
            eventByStatus[dto.status as RecommendationStatus] ??
            PlantEventType.USER_NOTE,
          eventKey: 'recommendation_response',
          value: {
            recommendationId,
            action: recommendation.action,
            status: dto.status,
            outcome: dto.outcome ?? null,
          },
          note: dto.reason,
          source: EvidenceSource.USER_ACTION,
        },
      });
      if (
        dto.status === RecommendationStatus.SKIPPED &&
        dto.reason &&
        /soil.+(wet|moist)|(wet|moist).+soil/i.test(dto.reason)
      ) {
        await tx.aiUserMemory.upsert({
          where: {
            userId_scopeKey_memoryKey: {
              userId,
              scopeKey: `PLANT:${recommendation.plantId}`,
              memoryKey: 'soil_condition_current',
            },
          },
          create: {
            userId,
            plantId: recommendation.plantId,
            scopeKey: `PLANT:${recommendation.plantId}`,
            memoryKey: 'soil_condition_current',
            memoryValue: 'Soil remains wet when watering is scheduled',
            memoryType: AiMemoryType.PLANT_OBSERVATION,
            confidence: 0.98,
            source: EvidenceSource.USER_STATEMENT,
            evidence: { recommendationId, reason: dto.reason },
          },
          update: {
            memoryValue: 'Soil remains wet when watering is scheduled',
            confidence: 0.98,
            source: EvidenceSource.USER_STATEMENT,
            evidence: { recommendationId, reason: dto.reason },
            reinforcementCount: { increment: 1 },
            status: MemoryStatus.ACTIVE,
            supersededAt: null,
          },
        });
      }
      return updated;
    });
  }

  async feedback(userId: string, dto: AiFeedbackDto): Promise<AiFeedback> {
    if (dto.messageId) {
      const message = await this.prisma.aiMessage.findFirst({
        where: {
          id: dto.messageId,
          conversation: { userId },
        },
        select: { id: true },
      });
      if (!message) {
        throw new BusinessException(
          ErrorCode.NOT_FOUND,
          'AI message not found',
          HttpStatus.NOT_FOUND,
        );
      }
    }
    return this.prisma.aiFeedback.create({
      data: {
        userId,
        messageId: dto.messageId,
        helpful: dto.helpful,
        reason: dto.reason,
        note: dto.note?.trim(),
      },
    });
  }

  private async ensureRecommendation(
    userId: string,
    plantId: string,
    state: PlantState,
    environment?: { temperature?: number; humidity?: number },
    knownRelationships?: HistoricalRelationship[],
  ): Promise<PlantRecommendation> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await this.prisma.plantRecommendation.findFirst({
      where: {
        userId,
        plantId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      if (existing.status !== RecommendationStatus.GENERATED) return existing;
      return this.prisma.plantRecommendation.update({
        where: { id: existing.id },
        data: { status: RecommendationStatus.SHOWN, shownAt: new Date() },
      });
    }
    const relationships =
      knownRelationships ??
      (await this.prisma.plantRelationship.findMany({
        where: { userId, newPlantId: plantId },
        include: {
          previousPlant: {
            select: {
              id: true,
              name: true,
              species: true,
              lifecycleStatus: true,
              outcomes: { orderBy: { recordedAt: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: { confidence: 'desc' },
        take: 6,
      }));
    const historicalWarnings = relationships.flatMap((relationship) =>
      relationship.previousPlant.outcomes
        .filter(
          (outcome) =>
            outcome.reason &&
            new Set<PlantOutcomeType>([
              PlantOutcomeType.DECLINED,
              PlantOutcomeType.DIED,
            ]).has(outcome.outcome),
        )
        .map((outcome) => ({
          reason: outcome.reason!,
          confidence: Math.min(
            Number(relationship.confidence),
            Number(outcome.confidence),
          ),
          source: outcome.source,
        })),
    );
    const decision = this.actions.decide({
      health: state.health,
      lastWateredAt: state.lastWateredAt,
      nextWateringAt: state.nextWateringAt,
      wateringDays: state.wateringDays,
      learnedSignals: state.learnedSignals,
      historicalWarnings,
      environment,
    });
    return this.prisma.$transaction(async (tx) => {
      const recommendation = await tx.plantRecommendation.create({
        data: {
          userId,
          plantId,
          ...decision,
          status: RecommendationStatus.SHOWN,
          shownAt: new Date(),
        },
      });
      await tx.plantEvent.createMany({
        data: [
          {
            userId,
            plantId,
            type: PlantEventType.RECOMMENDATION_GENERATED,
            eventKey: 'next_best_action',
            value: {
              recommendationId: recommendation.id,
              action: recommendation.action,
              signals: recommendation.signals,
            },
            source: EvidenceSource.SYSTEM_EVENT,
            confidence: recommendation.confidence,
          },
          {
            userId,
            plantId,
            type: PlantEventType.RECOMMENDATION_SHOWN,
            eventKey: 'next_best_action',
            value: { recommendationId: recommendation.id },
            source: EvidenceSource.SYSTEM_EVENT,
            confidence: recommendation.confidence,
          },
        ],
      });
      return recommendation;
    });
  }

  private async crossReference(userId: string, newPlantId: string): Promise<void> {
    const plant = await this.assertPlant(userId, newPlantId);
    const identity = plant.species?.trim() || plant.name.trim();
    const previous = await this.prisma.gardenPlant.findMany({
      where: {
        userId,
        id: { not: newPlantId },
        OR: plant.species
          ? [
              { species: { equals: plant.species, mode: 'insensitive' } },
              { name: { equals: plant.name, mode: 'insensitive' } },
            ]
          : [{ name: { equals: plant.name, mode: 'insensitive' } }],
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    const previousIds = previous.map(({ id }) => id);
    const similar = plant.category
      ? await this.prisma.gardenPlant.findMany({
          where: {
            userId,
            id: { notIn: [newPlantId, ...previousIds] },
            category: { equals: plant.category, mode: 'insensitive' },
          },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
          take: 8,
        })
      : [];
    if (!previous.length && !similar.length) return;
    await this.prisma.plantRelationship.createMany({
      data: [
        ...previous.map((historicalPlant) => ({
          userId,
          newPlantId,
          previousPlantId: historicalPlant.id,
          type: PlantRelationshipType.SAME_SPECIES,
          reason: `Previous ${identity} in this user's garden`,
          confidence: 0.98,
        })),
        ...similar.map((historicalPlant) => ({
          userId,
          newPlantId,
          previousPlantId: historicalPlant.id,
          type: PlantRelationshipType.SIMILAR_SPECIES,
          reason: `Previous plant in the ${plant.category} category`,
          confidence: 0.78,
        })),
      ],
      skipDuplicates: true,
    });
  }

  private personalizedInsight(
    relationships: Array<{
      previousPlant: {
        name: string;
        outcomes: Array<{
          outcome: PlantOutcomeType;
          reason: string | null;
          source: EvidenceSource;
          confidence: Prisma.Decimal;
        }>;
      };
    }>,
  ): string | null {
    const historical = relationships.find(
      (relationship) => relationship.previousPlant.outcomes.length > 0,
    );
    if (!historical) return relationships.length
      ? `You've cared for this plant type before. Current conditions will remain the primary guide.`
      : null;
    const outcome = historical.previousPlant.outcomes[0];
    if (!outcome) return null;
    const cause = outcome.reason
      ? ` The recorded reason was ${outcome.reason.toLowerCase().replace(/_/g, ' ')}.`
      : '';
    const uncertainty =
      outcome.source === EvidenceSource.AI_INFERENCE ||
      Number(outcome.confidence) < 0.9
        ? ' Treat that cause as possible, not confirmed.'
        : '';
    const prevention = /overwater|root.?rot/i.test(outcome.reason ?? '')
      ? ' Check soil moisture and drainage before watering this plant.'
      : '';
    return `You've had ${historical.previousPlant.name} before. Its recorded outcome was ${outcome.outcome.toLowerCase()}.${cause}${uncertainty}${prevention} Current plant evidence will take priority.`;
  }

  private async assertPlant(userId: string, plantId: string): Promise<GardenPlant> {
    const plant = await this.prisma.gardenPlant.findFirst({
      where: { id: plantId, userId },
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

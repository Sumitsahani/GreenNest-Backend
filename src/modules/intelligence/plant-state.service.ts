import { HttpStatus, Injectable } from '@nestjs/common';
import {
  MemoryStatus,
  PlantEventType,
  RecommendationStatus,
  type CareEvent,
  type CareReminder,
  type PlantEvent,
  type PlantOutcomeRecord,
  type PlantPhoto,
  type PlantRecommendation,
  type Prisma,
} from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';

export interface PlantState {
  identity: {
    id: string;
    userId: string;
    name: string;
    species: string | null;
    category: string | null;
    source: string | null;
    dateAdded: Date;
  };
  lifecycleStatus: string;
  location: string;
  environment: { idealSunlight: string | null; placementAdvice: string | null };
  health: number;
  lastWateredAt: Date | null;
  nextWateringAt: Date;
  wateringDays: number;
  wateringHistory: CareEvent[];
  fertilizingHistory: CareEvent[];
  repottingHistory: CareEvent[];
  movementHistory: PlantEvent[];
  recentPhotos: PlantPhoto[];
  healthHistory: PlantEvent[];
  symptoms: PlantEvent[];
  treatments: PlantEvent[];
  activeReminders: CareReminder[];
  recommendations: PlantRecommendation[];
  activeRecommendations: PlantRecommendation[];
  userActions: PlantEvent[];
  outcomes: PlantOutcomeRecord[];
  learnedSignals: Array<{
    key: string;
    value: string;
    confidence: number;
    source: string;
    evidence: Prisma.JsonValue | null;
  }>;
}

@Injectable()
export class PlantStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlantState(plantId: string, userId: string): Promise<PlantState> {
    const plant = await this.prisma.gardenPlant.findFirst({
      where: { id: plantId, userId },
      include: {
        careEvents: { orderBy: { caredAt: 'desc' }, take: 100 },
        events: { orderBy: { occurredAt: 'desc' }, take: 100 },
        reminders: {
          where: { enabled: true },
          orderBy: { scheduledAt: 'asc' },
        },
        photos: { orderBy: { createdAt: 'desc' }, take: 8 },
        outcomes: { orderBy: { recordedAt: 'desc' }, take: 10 },
        recommendations: {
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
        memories: {
          where: { status: MemoryStatus.ACTIVE },
          orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
          take: 12,
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

    const eventTypes = (...types: PlantEventType[]): PlantEvent[] =>
      plant.events.filter((event) => types.includes(event.type));
    const wateringHistory = plant.careEvents.filter(
      (event) => event.type === 'WATER',
    );
    const lastWateredAt =
      wateringHistory[0]?.caredAt ?? plant.lastWateredAt ?? null;

    return {
      identity: {
        id: plant.id,
        userId: plant.userId,
        name: plant.name,
        species: plant.species,
        category: plant.category,
        source: plant.source,
        dateAdded: plant.createdAt,
      },
      lifecycleStatus: plant.lifecycleStatus,
      location: plant.location,
      environment: {
        idealSunlight: plant.idealSunlight,
        placementAdvice: plant.placementAdvice,
      },
      health: plant.health,
      lastWateredAt,
      nextWateringAt: plant.nextWateringAt,
      wateringDays: plant.wateringDays,
      wateringHistory,
      fertilizingHistory: plant.careEvents.filter(
        (event) => event.type === 'FERTILIZE',
      ),
      repottingHistory: plant.careEvents.filter(
        (event) => event.type === 'REPOT',
      ),
      movementHistory: eventTypes(PlantEventType.MOVED),
      recentPhotos: plant.photos,
      healthHistory: eventTypes(
        PlantEventType.HEALTH_ISSUE,
        PlantEventType.SYMPTOM_REPORTED,
      ),
      symptoms: eventTypes(PlantEventType.SYMPTOM_REPORTED),
      treatments: eventTypes(PlantEventType.TREATMENT_APPLIED),
      activeReminders: plant.reminders,
      recommendations: plant.recommendations,
      activeRecommendations: plant.recommendations.filter((recommendation) =>
        new Set<RecommendationStatus>([
          RecommendationStatus.GENERATED,
          RecommendationStatus.SHOWN,
          RecommendationStatus.ACCEPTED,
        ]).has(recommendation.status),
      ),
      userActions: eventTypes(
        PlantEventType.RECOMMENDATION_ACCEPTED,
        PlantEventType.RECOMMENDATION_REJECTED,
        PlantEventType.RECOMMENDATION_SKIPPED,
        PlantEventType.RECOMMENDATION_DISMISSED,
        PlantEventType.RECOMMENDATION_COMPLETED,
      ),
      outcomes: plant.outcomes,
      learnedSignals: plant.memories.map((memory) => ({
        key: memory.memoryKey,
        value: memory.memoryValue,
        confidence: Number(memory.confidence),
        source: memory.source,
        evidence: memory.evidence,
      })),
    };
  }
}

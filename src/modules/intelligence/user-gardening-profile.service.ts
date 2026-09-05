import { Injectable } from '@nestjs/common';
import {
  AiMemoryType,
  MemoryStatus,
  PlantOutcomeType,
  type EvidenceSource,
  type PlantLifecycleStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

interface GardeningOutcome {
  plantId: string;
  plantName: string;
  species: string | null;
  outcome: PlantOutcomeType;
  reason: string | null;
  confidence: number;
  source: EvidenceSource;
}

export interface UserGardeningProfile {
  experienceLevel: string;
  totalPlants: number;
  historicalPlants: Array<{
    id: string;
    name: string;
    species: string | null;
    location: string;
    lifecycleStatus: PlantLifecycleStatus;
    outcomes: Array<{
      outcome: PlantOutcomeType;
      reason: string | null;
      confidence: Prisma.Decimal;
      source: EvidenceSource;
    }>;
  }>;
  preferences: Array<{
    key: string;
    value: string;
    confidence: number;
    source: EvidenceSource;
  }>;
  carePatterns: Array<{
    key: string;
    value: string;
    confidence: number;
    evidence: Prisma.JsonValue | Record<string, number> | null;
  }>;
  commonProblems: GardeningOutcome[];
  successfulPatterns: GardeningOutcome[];
  learnedMistakes: GardeningOutcome[];
}

@Injectable()
export class UserGardeningProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async build(userId: string): Promise<UserGardeningProfile> {
    const [plants, memories, skippedRecommendations] = await Promise.all([
      this.prisma.gardenPlant.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          species: true,
          location: true,
          lifecycleStatus: true,
          outcomes: { orderBy: { recordedAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.aiUserMemory.findMany({
        where: { userId, status: MemoryStatus.ACTIVE },
        orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.plantRecommendation.count({
        where: { userId, status: 'SKIPPED' },
      }),
    ]);

    const preferences = memories
      .filter((memory) =>
        new Set<AiMemoryType>([
          AiMemoryType.PREFERENCE,
          AiMemoryType.PLANT_PREFERENCE,
          AiMemoryType.CARE_PREFERENCE,
          AiMemoryType.GARDEN_PREFERENCE,
        ]).has(memory.memoryType),
      )
      .map((memory) => ({
        key: memory.memoryKey,
        value: memory.memoryValue,
        confidence: Number(memory.confidence),
        source: memory.source,
      }));
    const explicitPatterns = memories
      .filter((memory) =>
        new Set<AiMemoryType>([
          AiMemoryType.USER_PATTERN,
          AiMemoryType.SUCCESSFUL_CARE_PATTERN,
        ]).has(memory.memoryType),
      )
      .map((memory) => ({
        key: memory.memoryKey,
        value: memory.memoryValue,
        confidence: Number(memory.confidence),
        evidence: memory.evidence,
      }));
    const outcomes = plants.flatMap((plant) =>
      plant.outcomes.map((outcome) => ({
        plantId: plant.id,
        plantName: plant.name,
        species: plant.species,
        outcome: outcome.outcome,
        reason: outcome.reason,
        confidence: Number(outcome.confidence),
        source: outcome.source,
      })),
    );
    const successfulPatterns = outcomes.filter((outcome) =>
      new Set<PlantOutcomeType>([PlantOutcomeType.HEALTHY, PlantOutcomeType.IMPROVED]).has(
        outcome.outcome,
      ),
    );
    const failedPatterns = outcomes.filter((outcome) =>
      new Set<PlantOutcomeType>([PlantOutcomeType.DECLINED, PlantOutcomeType.DIED]).has(
        outcome.outcome,
      ),
    );
    const behaviorPatterns = [...explicitPatterns];
    if (skippedRecommendations >= 2) {
      behaviorPatterns.push({
        key: 'frequently_skips_recommendations',
        value: `${skippedRecommendations} recommendations skipped`,
        confidence: Math.min(0.9, 0.55 + skippedRecommendations * 0.08),
        evidence: { recommendationCount: skippedRecommendations },
      });
    }

    return {
      experienceLevel:
        memories.find((memory) => memory.memoryKey === 'gardening_experience')
          ?.memoryValue ?? 'UNKNOWN',
      totalPlants: plants.length,
      historicalPlants: plants,
      preferences,
      carePatterns: behaviorPatterns,
      commonProblems: failedPatterns,
      successfulPatterns,
      learnedMistakes: failedPatterns.filter((outcome) => outcome.reason),
    };
  }
}

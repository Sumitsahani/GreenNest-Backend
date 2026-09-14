import { Injectable } from '@nestjs/common';
import { PlantLifecycleStatus, type AiUserMemory, type GardenPlant } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PlantStateService } from '../intelligence/plant-state.service';
import { UserGardeningProfileService } from '../intelligence/user-gardening-profile.service';
import { AiMemoryService } from './ai-memory.service';
import {
  QuestionUnderstandingService,
  type PlantQuestionIntent,
} from './question-understanding.service';

export interface AiContext {
  garden: Pick<GardenPlant, 'name' | 'species' | 'location' | 'health' | 'nextWateringAt'>[];
  memories: AiUserMemory[];
  intent: PlantQuestionIntent;
  plantId: string | null;
  sourcesUsed: string[];
  promptContext: string;
}

@Injectable()
export class AiContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: AiMemoryService,
    private readonly states: PlantStateService,
    private readonly profiles: UserGardeningProfileService,
    private readonly questions: QuestionUnderstandingService,
  ) {}

  async build(userId: string, question: string, plantId?: string): Promise<AiContext> {
    const intent = this.questions.classify(question);
    const [garden, memories, plantState, profile] = await Promise.all([
      this.prisma.gardenPlant.findMany({
        where: {
          userId,
          lifecycleStatus: { in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: { name: true, species: true, location: true, health: true, nextWateringAt: true },
      }),
      this.memory.relevant(userId, question, 8, plantId),
      plantId ? this.states.getPlantState(plantId, userId) : Promise.resolve(null),
      this.profiles.build(userId),
    ]);
    const historicalPlants = plantState
      ? profile.historicalPlants
          .filter(
            (plant) =>
              plant.id !== plantState.identity.id &&
              Boolean(plant.species) &&
              plant.species?.toLowerCase() === plantState.identity.species?.toLowerCase(),
          )
          .slice(0, 4)
      : [];
    const gardenLines = garden.map(
      (plant) =>
        `${plant.name}${plant.species ? ` (${plant.species})` : ''}: ${plant.location}, health ${plant.health}/100, scheduled soil check (not a watering instruction) ${plant.nextWateringAt.toISOString().slice(0, 10)}`,
    );
    const memoryLines = memories.map(
      (item) =>
        `${item.memoryKey}: ${item.memoryValue} [source=${item.source}, confidence=${Number(item.confidence).toFixed(2)}]`,
    );
    const currentPlantLines = plantState
      ? [
          `${plantState.identity.name}${plantState.identity.species ? ` (${plantState.identity.species})` : ''}`,
          `lifecycle=${plantState.lifecycleStatus}, location=${plantState.location}, health=${plantState.health}/100`,
          `dateAdded=${plantState.identity.dateAdded.toISOString()} (not plant age)`,
          `speciesPlacementGuidance=${JSON.stringify(plantState.environment)} (not measured light or environment)`,
          `recordedCare=${JSON.stringify(
            [
              ...plantState.wateringHistory.slice(0, 5),
              ...plantState.fertilizingHistory.slice(0, 3),
              ...plantState.repottingHistory.slice(0, 3),
            ].map(({ type, note, caredAt }) => ({ type, note, caredAt })),
          )}`,
          `recordedHealthAndTreatments=${JSON.stringify(
            [
              ...plantState.healthHistory.slice(0, 6),
              ...plantState.treatments.slice(0, 4),
              ...plantState.movementHistory.slice(0, 3),
            ].map(({ type, value, note, source, confidence, occurredAt }) => ({
              type,
              value,
              note,
              source,
              confidence,
              occurredAt,
            })),
          )}`,
          `photoAnalysisRecords=${JSON.stringify(
            plantState.recentPhotos
              .slice(0, 3)
              .map(({ analysis, source, createdAt }) => ({ analysis, source, createdAt })),
          )} (metadata only; photos are not attached here)`,
          `lastWatered=${plantState.lastWateredAt?.toISOString() ?? 'unknown'}, nextWatering=${plantState.nextWateringAt.toISOString()}`,
          `learnedSignals=${
            plantState.learnedSignals
              .slice(0, 5)
              .map(
                (signal) =>
                  `${signal.key}:${signal.value}[${signal.source},${signal.confidence.toFixed(2)}]`,
              )
              .join('; ') || 'none'
          }`,
          `recentRecommendations=${
            plantState.recommendations
              .slice(0, 3)
              .map((recommendation) =>
                JSON.stringify({
                  action: recommendation.action,
                  status: recommendation.status,
                  reason: recommendation.reason,
                  createdAt: recommendation.createdAt,
                  completedAt: recommendation.completedAt,
                  outcome: recommendation.outcome,
                  outcomeNote: recommendation.outcomeNote,
                }),
              )
              .join('; ') || 'none'
          }`,
          `recentOutcomes=${
            plantState.outcomes
              .slice(0, 3)
              .map(
                (outcome) =>
                  `${outcome.recordedAt.toISOString()}: ${outcome.outcome}${outcome.reason ? `:${outcome.reason}` : ''}[${outcome.source},${Number(outcome.confidence).toFixed(2)}]`,
              )
              .join('; ') || 'none'
          }`,
        ]
      : ['No explicit current plant was supplied.'];
    const historyLines = historicalPlants.flatMap((plant) =>
      plant.outcomes.length
        ? plant.outcomes.map(
            (outcome) =>
              `${plant.name}: ${outcome.outcome}${outcome.reason ? `, reason=${outcome.reason}` : ''}, source=${outcome.source}, confidence=${Number(outcome.confidence).toFixed(2)}`,
          )
        : [`${plant.name}: previous same-species plant; no recorded outcome`],
    );
    const patternLines = profile.carePatterns
      .slice(0, 5)
      .map(
        (pattern) =>
          `${pattern.key}: ${pattern.value} [confidence=${pattern.confidence.toFixed(2)}]`,
      );
    const sourcesUsed = [
      ...(plantState ? ['current_plant_state', 'watering_history'] : []),
      ...(plantState?.recommendations.length ? ['recent_recommendations'] : []),
      ...(plantState?.outcomes.length ? ['plant_outcomes'] : []),
      ...(plantState?.healthHistory.length ? ['plant_health_history'] : []),
      ...(plantState?.treatments.length ? ['plant_treatments'] : []),
      ...(plantState?.recentPhotos.length ? ['photo_analysis_records'] : []),
      ...(memories.length ? ['relevant_memory'] : []),
      ...(historicalPlants.length ? ['same_species_history'] : []),
      ...(patternLines.length ? ['user_patterns'] : []),
      ...(garden.length ? ['current_garden'] : []),
    ];
    return {
      garden,
      memories,
      intent,
      plantId: plantId ?? null,
      sourcesUsed,
      promptContext: [
        `CURRENT TIME (UTC): ${new Date().toISOString()}`,
        'Weather, soil moisture, pot details, and actual light are unknown unless explicitly recorded below or supplied by the user. Schedule dates alone do not justify watering.',
        `QUESTION INTENT: ${intent}`,
        'CURRENT PLANT STATE (primary evidence):',
        currentPlantLines.join('\n'),
        'AUTHORITATIVE CURRENT GARDEN DATA:',
        gardenLines.length ? gardenLines.join('\n') : 'No structured garden records.',
        'RELEVANT STRUCTURED MEMORY:',
        memoryLines.length ? memoryLines.join('\n') : 'No relevant saved memory.',
        'RELEVANT SAME-SPECIES HISTORY (supporting evidence, never overrides current state):',
        historyLines.length ? historyLines.join('\n') : 'No relevant historical plant outcome.',
        'EVIDENCE-BASED USER PATTERNS:',
        patternLines.length ? patternLines.join('\n') : 'No repeated pattern has enough evidence.',
      ].join('\n'),
    };
  }
}

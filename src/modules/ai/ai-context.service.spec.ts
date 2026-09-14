import { AiContextService } from './ai-context.service';

describe('AiContextService Plant Doctor evidence', () => {
  it('includes dated care, symptoms and treatment outcomes without inventing photo or weather evidence', async () => {
    const date = new Date('2026-09-10T08:00:00Z');
    const state = {
      identity: {
        id: 'plant-a',
        name: 'Money Plant',
        species: 'Epipremnum aureum',
        dateAdded: date,
      },
      lifecycleStatus: 'ACTIVE',
      location: 'Balcony',
      health: 65,
      environment: { idealSunlight: 'Indirect', placementAdvice: null },
      lastWateredAt: date,
      nextWateringAt: date,
      wateringHistory: [{ type: 'WATER', note: 'Soil still wet', caredAt: date }],
      fertilizingHistory: [],
      repottingHistory: [],
      movementHistory: [],
      healthHistory: [
        {
          type: 'SYMPTOM_REPORTED',
          note: 'Yellow lower leaves',
          source: 'USER_STATEMENT',
          confidence: 1,
          occurredAt: date,
        },
      ],
      treatments: [
        {
          type: 'TREATMENT_APPLIED',
          note: 'Reduced watering',
          source: 'USER_STATEMENT',
          confidence: 1,
          occurredAt: date,
        },
      ],
      recentPhotos: [
        { analysis: { symptoms: ['yellowing'] }, source: 'AI_INFERENCE', createdAt: date },
      ],
      recommendations: [
        {
          action: 'CHECK_SOIL',
          status: 'COMPLETED',
          outcome: 'IMPROVED',
          outcomeNote: 'New growth healthy',
          createdAt: date,
          completedAt: date,
        },
      ],
      outcomes: [
        {
          outcome: 'RECOVERED',
          reason: 'Less watering helped',
          source: 'USER_STATEMENT',
          confidence: 1,
          recordedAt: date,
        },
      ],
      learnedSignals: [],
    };
    const prisma = { gardenPlant: { findMany: jest.fn().mockResolvedValue([]) } };
    const memory = { relevant: jest.fn().mockResolvedValue([]) };
    const states = { getPlantState: jest.fn().mockResolvedValue(state) };
    const profiles = {
      build: jest.fn().mockResolvedValue({ historicalPlants: [], carePatterns: [] }),
    };
    const questions = { classify: jest.fn().mockReturnValue('OTHER') };
    const dependencies = [
      prisma,
      memory,
      states,
      profiles,
      questions,
    ] as unknown as ConstructorParameters<typeof AiContextService>;
    const result = await new AiContextService(...dependencies).build(
      'owner',
      'Yellow leaves again',
      'plant-a',
    );
    expect(states.getPlantState).toHaveBeenCalledWith('plant-a', 'owner');
    for (const evidence of [
      'Soil still wet',
      'Yellow lower leaves',
      'Reduced watering',
      'New growth healthy',
      'Less watering helped',
      date.toISOString(),
    ]) {
      expect(result.promptContext).toContain(evidence);
    }
    expect(result.promptContext).toContain('metadata only; photos are not attached here');
    expect(result.promptContext).toContain(
      'Weather, soil moisture, pot details, and actual light are unknown unless explicitly recorded',
    );
    expect(result.promptContext).toContain('not plant age');
    expect(result.sourcesUsed).toEqual(
      expect.arrayContaining([
        'plant_health_history',
        'plant_treatments',
        'photo_analysis_records',
      ]),
    );
  });
});

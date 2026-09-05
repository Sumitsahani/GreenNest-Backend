import { RecommendationAction, RecommendationPriority } from '@prisma/client';
import { NextBestActionService, type DecisionInput } from './next-best-action.service';

describe('NextBestActionService', () => {
  const service = new NextBestActionService();
  const now = new Date('2026-09-05T06:00:00.000Z');
  const due = new Date('2026-09-05T05:00:00.000Z');
  const base: DecisionInput = {
    health: 90,
    lastWateredAt: new Date('2026-08-29T06:00:00.000Z'),
    nextWateringAt: due,
    wateringDays: 7,
    learnedSignals: [],
    now,
  };

  it('asks for inspection before care changes when current health is poor', () => {
    const result = service.decide({ ...base, health: 45 });

    expect(result.action).toBe(RecommendationAction.INSPECT);
    expect(result.priority).toBe(RecommendationPriority.HIGH);
    expect(result.signals).toContain('current_health');
  });

  it('lets a strong current wet-soil observation override the due schedule', () => {
    const result = service.decide({
      ...base,
      learnedSignals: [
        {
          key: 'soil_condition_current',
          value: 'soil is still wet',
          confidence: 0.98,
          source: 'USER_STATEMENT',
        },
      ],
    });

    expect(result.action).toBe(RecommendationAction.SKIP_WATERING);
    expect(result.signals).toContain('user_observation');
  });

  it('does not overlearn from low-confidence conflicting evidence', () => {
    const result = service.decide({
      ...base,
      learnedSignals: [
        {
          key: 'soil_condition_current',
          value: 'soil is wet',
          confidence: 0.4,
          source: 'AI_INFERENCE',
        },
      ],
    });

    expect(result.action).toBe(RecommendationAction.WATER);
  });

  it('handles missing watering history with an explainable schedule decision', () => {
    const result = service.decide({ ...base, lastWateredAt: null });

    expect(result.action).toBe(RecommendationAction.WATER);
    expect(result.reason).toContain('care interval is due');
  });

  it('uses a supported historical failure as a warning without overriding current state', () => {
    const result = service.decide({
      ...base,
      historicalWarnings: [
        {
          reason: 'ROOT_ROT_AFTER_OVERWATERING',
          confidence: 0.84,
          source: 'USER_STATEMENT',
        },
      ],
    });

    expect(result.action).toBe(RecommendationAction.WATER);
    expect(result.signals).toContain('same_species_history');
    expect(result.reason).toContain('check current soil moisture');
  });

  it('ignores a low-confidence historical warning', () => {
    const result = service.decide({
      ...base,
      historicalWarnings: [
        {
          reason: 'POSSIBLE_ROOT_ROT',
          confidence: 0.35,
          source: 'AI_INFERENCE',
        },
      ],
    });

    expect(result.action).toBe(RecommendationAction.WATER);
    expect(result.signals).not.toContain('same_species_history');
  });

  it('avoids duplicate watering shortly after a recorded action', () => {
    const result = service.decide({
      ...base,
      lastWateredAt: new Date('2026-09-04T06:00:00.000Z'),
    });

    expect(result.action).toBe(RecommendationAction.SKIP_WATERING);
    expect(result.signals).toContain('recent_watering');
  });
});

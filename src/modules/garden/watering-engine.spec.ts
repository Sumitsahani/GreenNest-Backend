import { calculateWatering, type WateringInput } from './watering-engine';

const DAY = 86_400_000;
const now = new Date('2026-09-18T06:00:00Z');
function plant(gap = 5, extra: Partial<WateringInput> = {}): WateringInput {
  return {
    id: 'a',
    wateringDays: 7,
    lastWateredAt: now,
    environment: 'INDOOR',
    health: 95,
    careEvents: Array.from({ length: 7 }, (_, i) => ({
      type: 'WATER',
      caredAt: new Date(now.getTime() - i * gap * DAY),
    })),
    ...extra,
  };
}
const observation = (value: Record<string, unknown>, occurredAt = now) => ({
  eventKey: 'watering_context',
  value,
  occurredAt,
  source: 'USER_CORRECTION',
});

describe('individual watering engine', () => {
  it('uses different repeated histories after the same garden watering', () => {
    const fast = calculateWatering(plant(4), now);
    const slow = calculateWatering(plant(9), now);
    expect(fast.lastWateredAt).toEqual(slow.lastWateredAt);
    expect(fast.nextWateringWindowStart! < slow.nextWateringWindowStart!).toBe(true);
    expect(fast.nextWateringWindowEnd! < slow.nextWateringWindowEnd!).toBe(true);
    expect(fast.reasons.join(' ')).toContain('4 days');
    expect(slow.reasons.join(' ')).toContain('9 days');
  });
  it('does not learn a drying interval from one interval', () => {
    const state = calculateWatering(
      plant(2, { careEvents: plant(2).careEvents!.slice(0, 2) }),
      now,
    );
    expect(state.observedDryingIntervalDays).toBeNull();
    expect(state.currentEstimatedIntervalDays).toBe(7);
    expect(state.wateringNeedConfidence).toBeLessThan(0.5);
  });
  it('does not claim unknown watering took place at creation time', () => {
    const state = calculateWatering(plant(7, { careEvents: [], lastWateredAt: null }), now);
    expect(state.wateringStatus).toBe('UNCERTAIN');
    expect(state.nextWateringWindowStart).toBeNull();
  });
  it('uses actual pot and light context, not the room label', () => {
    const low = calculateWatering(
      plant(5, { events: [observation({ light: 'LOW', soilMix: 'RETAINING' })] }),
      now,
    );
    const high = calculateWatering(
      plant(5, { events: [observation({ light: 'HIGH', soilMix: 'FAST_DRAINING' })] }),
      now,
    );
    expect(low.currentEstimatedIntervalDays).toBeGreaterThan(high.currentEstimatedIntervalDays);
  });
  it('does not use outdoor rain or humidity to move an indoor window', () => {
    const input = plant();
    const rain = {
      maxTemperature: 25,
      humidity: 95,
      precipitationSum: 30,
      precipitationProbability: 100,
    };
    expect(calculateWatering(input, now, rain).nextWateringWindowStart).toEqual(
      calculateWatering(input, now).nextWateringWindowStart,
    );
    const exposed = {
      ...input,
      environment: 'OUTDOOR',
      events: [observation({ rainExposed: true })],
    };
    expect(calculateWatering(exposed, now, rain).weatherAdjustment).toBe(2);
  });
  it('uses a recent local indoor humidity observation', () => {
    expect(
      calculateWatering(plant(5, { events: [observation({ humidity: 90 })] }), now)
        .weatherAdjustment,
    ).toBe(1);
  });
  it('wet soil blocks an overdue watering and old wet evidence expires', () => {
    const old = plant(5, { lastWateredAt: new Date(now.getTime() - 20 * DAY), careEvents: [] });
    expect(
      calculateWatering({ ...old, events: [observation({ soilState: 'WET' })] }, now)
        .wateringStatus,
    ).toBe('SKIP');
    expect(
      calculateWatering(
        { ...old, events: [observation({ soilState: 'WET' }, new Date(now.getTime() - 3 * DAY))] },
        now,
      ).wateringStatus,
    ).toBe('OVERDUE');
  });
  it('uses this plant’s root risk and never tells a wet pot to water', () => {
    const input = plant(5, {
      careEvents: [],
      lastWateredAt: new Date(now.getTime() - 20 * DAY),
      outcomes: [{ reason: 'Overwatering and root rot', recordedAt: now }],
    });
    expect(calculateWatering(input, now).wateringStatus).toBe('INSPECT_FIRST');
    expect(
      calculateWatering({ ...input, events: [observation({ soilState: 'WET' })] }, now)
        .wateringStatus,
    ).toBe('SKIP');
  });
  it('incorporates a correction but allows later observations to revise it', () => {
    const input = plant(4, { events: [observation({ dryingDays: 9 })] });
    expect(calculateWatering(input, now).currentEstimatedIntervalDays).toBeGreaterThan(
      calculateWatering(plant(4), now).currentEstimatedIntervalDays,
    );
    const future = new Date(now.getTime() + 120 * DAY);
    expect(calculateWatering(input, future).currentEstimatedIntervalDays).toBeLessThan(
      calculateWatering(input, now).currentEstimatedIntervalDays,
    );
  });
  it('healthy recently watered plants have no watering action', () => {
    expect(calculateWatering(plant(), now).wateringStatus).toBe('NOT_DUE');
  });
  it('deduplicates timestamps and is deterministic across identical contexts', () => {
    const input = plant();
    expect(
      calculateWatering({ ...input, careEvents: [...input.careEvents!, ...input.careEvents!] }, now)
        .currentEstimatedIntervalDays,
    ).toBe(calculateWatering(input, now).currentEstimatedIntervalDays);
    expect(calculateWatering(input, now)).toEqual(calculateWatering(input, now));
  });
  it.each([30, 57, 500])(
    'evaluates a realistic %i-pot garden independently without AI',
    (count) => {
      const states = Array.from({ length: count }, (_, i) =>
        calculateWatering(
          plant([3, 5, 8, 12, 18][i % 5]!, {
            id: `plant-${i}`,
            environment: i % 3 === 0 ? 'OUTDOOR' : 'INDOOR',
            events: [
              observation({
                light: i % 2 === 0 ? 'HIGH' : 'LOW',
                ...(i % 7 === 0 ? { soilState: 'WET' } : {}),
              }),
            ],
            outcomes: i % 11 === 0 ? [{ reason: 'Previous overwatering', recordedAt: now }] : [],
          }),
          now,
        ),
      );
      expect(states).toHaveLength(count);
      expect(
        new Set(states.map((s) => s.nextWateringWindowStart?.toISOString())).size,
      ).toBeGreaterThan(4);
      expect(
        states.every((s) => s.reasons.length > 0 && s.lastWateredAt?.getTime() === now.getTime()),
      ).toBe(true);
      expect(states.some((s) => s.wateringStatus === 'SKIP')).toBe(true);
      expect(states.some((s) => s.wateringStatus === 'NOT_DUE')).toBe(true);
    },
  );
  it('uses the newest soil evidence including a skipped wet pot in a batch', () => {
    const input = plant(5, {
      events: [
        observation({ soilState: 'DRY' }),
        {
          eventKey: 'batch_care_exception',
          value: { reason: 'SOIL_WET' },
          occurredAt: new Date(now.getTime() + 60000),
        },
      ],
    });
    const state = calculateWatering(input, new Date(now.getTime() + 120000));
    expect(state.wateringStatus).toBe('SKIP');
    expect(state.soilState).toBe('WET');
  });
});

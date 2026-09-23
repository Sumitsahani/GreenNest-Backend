import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

const DAY = 86_400_000;
const logger = new Logger('WateringEngine');
// Bounded relation reads, shared by list, summary, reminders and writes.
export const wateringEvidence = {
  careEvents: { orderBy: { caredAt: 'desc' }, take: 80 },
  events: { orderBy: { occurredAt: 'desc' }, take: 40 },
  memories: { where: { status: 'ACTIVE' }, orderBy: { updatedAt: 'desc' }, take: 20 },
  outcomes: { orderBy: { recordedAt: 'desc' }, take: 8 },
} satisfies Prisma.GardenPlantInclude;

export interface WateringInput {
  id?: string;
  wateringDays: number;
  lastWateredAt: Date | null;
  environment?: string;
  location?: string;
  health?: number;
  careEvents?: { type: string; caredAt: Date; note?: string | null }[];
  events?: {
    eventKey?: string | null;
    value?: unknown;
    note?: string | null;
    source?: string;
    occurredAt: Date;
  }[];
  memories?: {
    memoryKey: string;
    memoryValue: string;
    source: string;
    confidence: unknown;
    updatedAt: Date;
  }[];
  outcomes?: { reason?: string | null; recordedAt: Date }[];
}
export type WateringStatus =
  'NOT_DUE' | 'APPROACHING' | 'DUE' | 'OVERDUE' | 'UNCERTAIN' | 'SKIP' | 'INSPECT_FIRST';
export interface WateringState {
  plantId: string | null;
  lastWateredAt: Date | null;
  lastWateringSource: string;
  wateringHistoryCount: number;
  observedDryingIntervalDays: number | null;
  observedDryingMinDays: number | null;
  observedDryingMaxDays: number | null;
  baselineIntervalDays: number;
  currentEstimatedIntervalDays: number;
  nextWateringWindowStart: Date | null;
  nextWateringWindowEnd: Date | null;
  wateringStatus: WateringStatus;
  wateringNeedConfidence: number;
  soilState: string;
  environmentAdjustment: number;
  weatherAdjustment: number;
  previousOverwateringRisk: boolean;
  title: string;
  reasons: string[];
  lastCalculatedAt: Date;
  calculationVersion: string;
}
type Weather = {
  maxTemperature: number;
  humidity: number;
  precipitationSum: number;
  precipitationProbability: number;
};
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2
  );
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function calculateWatering(
  input: WateringInput,
  now = new Date(),
  weather?: Weather | null,
): WateringState {
  const baseline = Math.max(1, Math.min(60, input.wateringDays || 7));
  const history = (input.careEvents ?? [])
    .filter((e) => e.type === 'WATER' && e.caredAt <= now)
    .sort((a, b) => b.caredAt.getTime() - a.caredAt.getTime());
  const times = [
    ...new Set([
      ...history.map((e) => e.caredAt.getTime()),
      ...(input.lastWateredAt && input.lastWateredAt <= now ? [input.lastWateredAt.getTime()] : []),
    ]),
  ].sort((a, b) => b - a);
  // Multiple applications within 18h are one watering episode, not drying evidence.
  const episodes = times.filter((t, i) => i === 0 || times[i - 1]! - t >= 0.75 * DAY);
  const intervals = episodes
    .slice(1)
    .map((t, i) => (episodes[i]! - t) / DAY)
    .filter((d) => d >= 1 && d <= 60)
    .slice(0, 12);
  const observed = intervals.length >= 2 ? median(intervals) : null;
  const weight =
    intervals.length >= 5 ? 0.75 : intervals.length >= 4 ? 0.6 : intervals.length >= 2 ? 0.35 : 0;
  let estimate = observed === null ? baseline : baseline * (1 - weight) + observed * weight;
  let confidence = observed === null ? 0.35 : intervals.length >= 5 ? 0.7 : 0.5;
  const reasons = [
    observed === null
      ? 'Starting from the care baseline; more watering history is needed.'
      : `Recorded watering gaps are usually about ${Math.round(observed)} days. These are care habits, not measured soil drying.`,
  ];
  const events = (input.events ?? [])
    .filter((e) => e.occurredAt <= now)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const correction = events.find(
    (e) => e.eventKey === 'watering_context' && Number(object(e.value).dryingDays) >= 1,
  );
  const memory = (input.memories ?? []).find(
    (m) =>
      /soil_drying|watering_interval/.test(m.memoryKey) &&
      m.source === 'USER_CORRECTION' &&
      Number(m.confidence) >= 0.7,
  );
  const corrected = correction
    ? Number(object(correction.value).dryingDays)
    : memory
      ? Number(/\d+(?:\.\d+)?/.exec(memory.memoryValue)?.[0])
      : NaN;
  const correctionAt = correction?.occurredAt ?? memory?.updatedAt;
  if (corrected >= 1 && corrected <= 60 && correctionAt) {
    const age = (now.getTime() - correctionAt.getTime()) / DAY;
    const strength = age <= 90 ? 0.7 : 0.3;
    estimate = estimate * (1 - strength) + corrected * strength;
    confidence = Math.max(confidence, age <= 90 ? 0.65 : 0.45);
    reasons.push(
      `You reported that this pot usually dries in ${corrected} days; newer evidence can revise this estimate.`,
    );
  }
  const latest = episodes[0] ? new Date(episodes[0]) : null;
  const contextEvents = events.filter((e) => e.eventKey === 'watering_context');
  const context: Record<string, unknown> = {};
  for (const e of [...contextEvents].reverse()) Object.assign(context, object(e.value));
  let environmentAdjustment = 0;
  // Conservative one-day check-window shifts, not claims of physical drying rates.
  if (context.light === 'LOW') {
    environmentAdjustment += 1;
    reasons.push('Reported low light can slow drying.');
  }
  if (context.light === 'HIGH') {
    environmentAdjustment -= 1;
    reasons.push('Reported strong light can speed drying.');
  }
  if (context.soilMix === 'RETAINING' || context.potMaterial === 'PLASTIC') {
    environmentAdjustment += 1;
    reasons.push('Reported pot or soil retains moisture.');
  }
  if (context.soilMix === 'FAST_DRAINING' || context.potMaterial === 'TERRACOTTA') {
    environmentAdjustment -= 1;
    reasons.push('Reported pot or soil dries more freely.');
  }
  environmentAdjustment = Math.max(-2, Math.min(2, environmentAdjustment));
  const local = contextEvents.find(
    (e) =>
      now.getTime() - e.occurredAt.getTime() <= 2 * DAY &&
      (object(e.value).humidity !== undefined || object(e.value).temperature !== undefined),
  );
  const localData = object(local?.value);
  let weatherAdjustment = 0;
  const outdoor = input.environment === 'OUTDOOR';
  const humidity =
    typeof localData.humidity === 'number'
      ? localData.humidity
      : outdoor
        ? weather?.humidity
        : undefined;
  const temperature =
    typeof localData.temperature === 'number'
      ? localData.temperature
      : outdoor
        ? weather?.maxTemperature
        : undefined;
  if (humidity !== undefined && humidity >= 80) {
    weatherAdjustment += 1;
    reasons.push('Relevant high humidity may slow drying.');
  }
  if (temperature !== undefined && temperature >= 34 && humidity !== undefined && humidity <= 55) {
    weatherAdjustment -= 1;
    reasons.push('Relevant heat and low humidity may speed drying.');
  }
  if (outdoor && context.rainExposed === true && weather && weather.precipitationSum >= 5) {
    weatherAdjustment += 1;
    reasons.push(
      'Rain forecast at this exposed outdoor pot: inspect for retained moisture; rainfall is not recorded as watering.',
    );
  }
  const risk =
    (input.outcomes ?? []).some(
      (o) =>
        now.getTime() - o.recordedAt.getTime() <= 180 * DAY &&
        /overwater|root.?rot/i.test(o.reason ?? ''),
    ) ||
    events.some(
      (e) =>
        now.getTime() - e.occurredAt.getTime() <= 180 * DAY &&
        /overwater|root.?rot/i.test(e.note ?? ''),
    );
  const soilObservations = [
    ...contextEvents
      .filter((e) => object(e.value).soilState)
      .map((e) => ({ at: e.occurredAt, state: String(object(e.value).soilState) })),
    ...events
      .filter((e) => e.eventKey === 'batch_care_exception' && object(e.value).reason === 'SOIL_WET')
      .map((e) => ({ at: e.occurredAt, state: 'WET' })),
    ...(input.careEvents ?? [])
      .filter((e) => e.type === 'NOTE' && /SOIL_WET/.test(e.note ?? ''))
      .map((e) => ({ at: e.caredAt, state: 'WET' })),
    ...(input.memories ?? [])
      .filter(
        (m) =>
          /soil_(condition|wet)/i.test(m.memoryKey) &&
          Number(m.confidence) >= 0.8 &&
          /wet|moist/i.test(m.memoryValue),
      )
      .map((m) => ({ at: m.updatedAt, state: 'WET' })),
  ]
    .filter(
      (e) =>
        e.at <= now && now.getTime() - e.at.getTime() <= 2 * DAY && (!latest || e.at >= latest),
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const soil = soilObservations[0]?.state ?? 'UNKNOWN';
  estimate = Math.max(1, Math.min(60, estimate + environmentAdjustment + weatherAdjustment));
  const spread = Math.max(1, Math.ceil(estimate * (confidence >= 0.65 ? 0.15 : 0.25)));
  const start = latest
    ? new Date(latest.getTime() + Math.max(1, Math.floor(estimate - spread)) * DAY)
    : null;
  const end = latest ? new Date(latest.getTime() + Math.ceil(estimate + spread) * DAY) : null;
  let status: WateringStatus = !latest
    ? 'UNCERTAIN'
    : now > end!
      ? 'OVERDUE'
      : now >= start!
        ? 'DUE'
        : start!.getTime() - now.getTime() <= DAY
          ? 'APPROACHING'
          : 'NOT_DUE';
  if (soil === 'DRY') {
    status = risk ? 'INSPECT_FIRST' : 'DUE';
    confidence = 0.8;
    reasons.push('You recently reported dry soil.');
  }
  if (soil === 'WET' || soil === 'MOIST') {
    status = 'SKIP';
    reasons.push('Soil was recently reported wet or moist. Do not water yet.');
  }
  if (risk) {
    reasons.push(
      'This plant has a recorded overwatering or root problem. Check moisture and drainage first.',
    );
    if (['DUE', 'OVERDUE'].includes(status)) status = 'INSPECT_FIRST';
  }
  if ((input.health ?? 100) < 60) {
    status = 'INSPECT_FIRST';
    reasons.push('Inspect the current health problem before changing watering.');
  }
  const titles: Record<WateringStatus, string> = {
    NOT_DUE: 'Not needed yet',
    APPROACHING: 'Approaching soil-check window',
    DUE: 'Check soil before watering',
    OVERDUE: 'Soil check overdue',
    UNCERTAIN: 'Check soil; last watering unknown',
    SKIP: 'Do not water yet',
    INSPECT_FIRST: 'Inspect before watering',
  };
  const result: WateringState = {
    plantId: input.id ?? null,
    lastWateredAt: latest,
    lastWateringSource: history[0]?.note?.includes('batch')
      ? 'USER_STATEMENT'
      : latest
        ? 'USER_REPORTED'
        : 'UNKNOWN',
    wateringHistoryCount: history.length,
    observedDryingIntervalDays: observed,
    observedDryingMinDays: observed === null ? null : Math.min(...intervals),
    observedDryingMaxDays: observed === null ? null : Math.max(...intervals),
    baselineIntervalDays: baseline,
    currentEstimatedIntervalDays: Math.round(estimate * 10) / 10,
    nextWateringWindowStart: start,
    nextWateringWindowEnd: end,
    wateringStatus: status,
    wateringNeedConfidence: confidence,
    soilState: soil,
    environmentAdjustment,
    weatherAdjustment,
    previousOverwateringRisk: risk,
    title: titles[status],
    reasons,
    lastCalculatedAt: now,
    calculationVersion: 'watering-v1',
  };
  if (process.env.WATERING_DEBUG === 'true')
    logger.debug(
      JSON.stringify({
        plantId: result.plantId,
        baseline,
        observed,
        intervals: intervals.length,
        environmentAdjustment,
        weatherAdjustment,
        risk,
        soil,
        status,
        confidence,
        start,
        end,
        version: result.calculationVersion,
      }),
    );
  return result;
}

/** Legacy timestamp remains a soil-check hint. Unknown history never becomes confirmed watering. */
export function wateringCheckAt(state: WateringState, now = new Date()): Date {
  if (state.wateringStatus === 'SKIP') return new Date(now.getTime() + DAY);
  if (['UNCERTAIN', 'INSPECT_FIRST'].includes(state.wateringStatus)) return now;
  return state.nextWateringWindowStart ?? new Date(now.getTime() + DAY);
}

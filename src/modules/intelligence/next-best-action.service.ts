import { Injectable } from '@nestjs/common';
import {
  RecommendationAction,
  RecommendationPriority,
} from '@prisma/client';

export interface DecisionInput {
  health: number;
  lastWateredAt: Date | null;
  nextWateringAt: Date;
  wateringDays: number;
  learnedSignals: Array<{
    key: string;
    value: string;
    confidence: number;
    source: string;
  }>;
  historicalWarnings?: Array<{
    reason: string;
    confidence: number;
    source: string;
  }>;
  environment?: { temperature?: number; humidity?: number };
  now?: Date;
}

export interface NextBestAction {
  action: RecommendationAction;
  priority: RecommendationPriority;
  confidence: number;
  reason: string;
  signals: string[];
}

@Injectable()
export class NextBestActionService {
  decide(input: DecisionInput): NextBestAction {
    const now = input.now ?? new Date();
    const daysSinceWatering = input.lastWateredAt
      ? Math.max(
          0,
          (now.getTime() - input.lastWateredAt.getTime()) / 86_400_000,
        )
      : null;
    const soilWet = input.learnedSignals.find(
      (signal) =>
        /soil_(condition|wet)|soil_drying/i.test(signal.key) &&
        /wet|moist|day/i.test(signal.value) &&
        signal.confidence >= 0.8,
    );
    const wateringWarning = input.historicalWarnings?.find(
      (warning) =>
        /overwater|root.?rot/i.test(warning.reason) &&
        warning.confidence >= 0.7,
    );

    if (input.health < 60) {
      return {
        action: RecommendationAction.INSPECT,
        priority: RecommendationPriority.HIGH,
        confidence: 0.9,
        reason:
          'The current health score is low, so inspect leaves, stems, soil and roots before changing the care routine.',
        signals: ['current_health'],
      };
    }

    if (soilWet && input.nextWateringAt <= now) {
      return {
        action: RecommendationAction.SKIP_WATERING,
        priority: RecommendationPriority.MEDIUM,
        confidence: Math.min(0.96, soilWet.confidence),
        reason:
          'Watering is scheduled, but the latest verified soil information says moisture lasts longer. Check the soil and wait while it is still wet.',
        signals: ['watering_schedule', soilWet.key, 'user_observation'],
      };
    }

    if (
      daysSinceWatering !== null &&
      daysSinceWatering < Math.max(1, input.wateringDays * 0.5)
    ) {
      return {
        action: RecommendationAction.SKIP_WATERING,
        priority: RecommendationPriority.LOW,
        confidence: 0.92,
        reason:
          'This plant was watered recently. Let the soil condition guide the next watering rather than watering again now.',
        signals: ['recent_watering', 'watering_interval'],
      };
    }

    if (input.nextWateringAt <= now) {
      const hot = (input.environment?.temperature ?? 0) >= 32;
      return {
        action: RecommendationAction.WATER,
        priority: RecommendationPriority.MEDIUM,
        confidence: wateringWarning ? 0.84 : hot ? 0.86 : 0.82,
        reason: wateringWarning
          ? 'The care interval is due. A previous related plant had a recorded watering or root-risk outcome, so treat that history as a warning: check current soil moisture and drainage before watering.'
          : hot
          ? 'The care interval is due and current heat may dry the pot faster. Check the topsoil, then water if it feels dry.'
          : 'The recorded care interval is due. Check the topsoil, then water only if it feels dry.',
        signals: wateringWarning
          ? ['watering_schedule', 'same_species_history']
          : hot
          ? ['watering_schedule', 'temperature']
          : ['watering_schedule'],
      };
    }

    return {
      action: RecommendationAction.MONITOR,
      priority: RecommendationPriority.LOW,
      confidence: 0.8,
      reason:
        'The plant is currently on schedule with no strong warning signal. Continue observing soil and leaf condition.',
      signals: ['watering_schedule', 'current_health'],
    };
  }
}

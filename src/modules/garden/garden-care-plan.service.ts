import { Injectable, Logger } from '@nestjs/common';
import { PlantEnvironment } from '@prisma/client';

export interface GardenCarePlan {
  wateringDays: number;
  idealSunlight: string;
  placementAdvice: string;
  carePlan: string;
  summerWatering: string;
  normalWatering: string;
  winterWatering: string;
  recommendedEnvironment: PlantEnvironment;
  environmentReason: string;
  indoorRisks: string;
  indoorAdaptationAdvice: string;
}

@Injectable()
export class GardenCarePlanService {
  private readonly logger = new Logger(GardenCarePlanService.name);

  async create(input: {
    name: string;
    species?: string;
    location: string;
    environment?: PlantEnvironment;
    notes?: string;
  }): Promise<GardenCarePlan> {
    const identity = `${input.name} ${input.species ?? ''}`.toLowerCase();
    const outdoorPreferred =
      /rose|rosa|hibiscus|bougainvillea|sunflower|tomato|marigold|jasmine|citrus/.test(identity);
    const environmentPlan = outdoorPreferred
      ? {
          recommendedEnvironment: PlantEnvironment.OUTDOOR,
          environmentReason: 'This plant normally needs stronger direct sunlight and outdoor airflow to grow and flower well.',
          indoorRisks: 'Indoors it may become leggy, flower less, stay damp for longer, or attract pests when light and airflow are too low.',
          indoorAdaptationAdvice: 'Use the sunniest window or balcony door, provide 6+ hours of strong light or a grow light, keep airflow gentle, and water only after checking the soil.',
        }
      : {
          recommendedEnvironment: PlantEnvironment.INDOOR,
          environmentReason: 'This plant adapts well to protected indoor conditions with suitable light and ventilation.',
          indoorRisks: 'Low light and overwatering can cause weak growth, yellow leaves, or root problems.',
          indoorAdaptationAdvice: 'Keep it near suitable natural light, rotate the pot weekly, provide drainage and airflow, and check the soil before watering.',
        };
    const fallback: GardenCarePlan = /jade|crassula/.test(identity) ? {
      wateringDays: 17,
      idealSunlight: '4-6 hours of bright light; gentle morning sun is ideal',
      placementAdvice: `Keep it near a bright south or east-facing window in ${input.location}, with excellent drainage.`,
      carePlan: 'Let the potting mix dry completely before watering again. Soak thoroughly, then drain all excess water to prevent root rot.',
      summerWatering: 'Every 10-14 days, only after soil dries completely',
      normalWatering: 'Every 14-20 days, only after soil dries completely',
      winterWatering: 'Every 20-30+ days, only after soil dries completely',
      ...environmentPlan,
    } : /spider|chlorophytum/.test(identity) ? {
      wateringDays: 7,
      idealSunlight: '4-6 hours of bright indirect light',
      placementAdvice: `Keep it near an east or north-facing window in ${input.location}, away from harsh direct afternoon sun.`,
      carePlan: 'Water when the top 2-3 cm of soil feels dry, but do not let the whole root ball stay dry for long. Ensure the pot drains freely.',
      summerWatering: 'Every 4-7 days, after checking topsoil',
      normalWatering: 'Every 7-10 days, after checking topsoil',
      winterWatering: 'Every 10-14 days, after checking topsoil',
      ...environmentPlan,
    } : /money|pothos|epipremnum/.test(identity) ? {
      wateringDays: 8,
      idealSunlight: '4-6 hours of bright indirect light',
      placementAdvice: `Keep it near a bright filtered-light window in ${input.location}; avoid strong midday sun.`,
      carePlan: 'Water when the top 3-5 cm of soil is dry. Water thoroughly and discard standing water from the tray.',
      summerWatering: 'Every 5-7 days, after checking topsoil',
      normalWatering: 'Every 7-10 days, after checking topsoil',
      winterWatering: 'Every 10-14 days, after checking topsoil',
      ...environmentPlan,
    } : {
      wateringDays: 7,
      idealSunlight: 'Bright indirect light, around 4-6 hours daily',
      placementAdvice: `Keep it near a bright window in ${input.location}, away from harsh afternoon sun.`,
      carePlan: 'Check the top 2-3 cm of soil before watering. Water thoroughly only when it feels dry and ensure drainage.',
      summerWatering: 'Every 7-10 days, after checking the soil',
      normalWatering: 'Every 10-14 days, after checking the soil',
      winterWatering: 'Every 14-21 days, after checking the soil',
      ...environmentPlan,
    };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return fallback;
    try {
      const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create a conservative gardening care plan. Plant name: ${input.name}. Species: ${input.species ?? 'unknown'}. User-selected environment: ${input.environment ?? 'unknown'}. Current placement: ${input.location}. Notes: ${input.notes ?? 'none'}. Return JSON only with wateringDays (integer 1-30), idealSunlight, placementAdvice, carePlan (include how dry the soil should be), summerWatering, normalWatering, winterWatering (short intervals like "Every 10-14 days"), recommendedEnvironment (INDOOR or OUTDOOR), environmentReason, indoorRisks, and indoorAdaptationAdvice. If outdoor is preferred, explain realistic indoor risks and practical changes that can help. Do not claim certainty when species is unknown.` }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 650 },
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response');
      const plan = JSON.parse(text) as Partial<GardenCarePlan>;
      return {
        wateringDays: this.parseWateringDays(plan.wateringDays, plan.normalWatering, fallback.wateringDays),
        idealSunlight: String(plan.idealSunlight || fallback.idealSunlight).slice(0, 200),
        placementAdvice: String(plan.placementAdvice || fallback.placementAdvice).slice(0, 300),
        carePlan: String(plan.carePlan || fallback.carePlan).slice(0, 700),
        summerWatering: String(plan.summerWatering || fallback.summerWatering).slice(0, 100),
        normalWatering: String(plan.normalWatering || fallback.normalWatering).slice(0, 100),
        winterWatering: String(plan.winterWatering || fallback.winterWatering).slice(0, 100),
        recommendedEnvironment:
          plan.recommendedEnvironment === PlantEnvironment.OUTDOOR
            ? PlantEnvironment.OUTDOOR
            : plan.recommendedEnvironment === PlantEnvironment.INDOOR
              ? PlantEnvironment.INDOOR
              : fallback.recommendedEnvironment,
        environmentReason: String(plan.environmentReason || fallback.environmentReason).slice(0, 400),
        indoorRisks: String(plan.indoorRisks || fallback.indoorRisks).slice(0, 500),
        indoorAdaptationAdvice: String(
          plan.indoorAdaptationAdvice || fallback.indoorAdaptationAdvice,
        ).slice(0, 600),
      };
    } catch (error) {
      this.logger.warn(`Care plan generation failed; using fallback: ${error instanceof Error ? error.message : 'unknown error'}`);
      return fallback;
    }
  }

  private parseWateringDays(value: unknown, schedule: unknown, fallback: number): number {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.max(1, Math.min(30, Math.round(numeric)));
    const scheduleText = typeof schedule === 'string' ? schedule : '';
    const match = /(?:every\s+)?(\d+)(?:\s*[-–]\s*(\d+))?\s*(day|week|month)/i.exec(scheduleText);
    if (!match?.[1]) return fallback;
    const average = (Number(match[1]) + Number(match[2] ?? match[1])) / 2;
    const multiplier = match[3]?.toLowerCase() === 'week' ? 7 : match[3]?.toLowerCase() === 'month' ? 30 : 1;
    return Math.max(1, Math.min(30, Math.round(average * multiplier)));
  }
}

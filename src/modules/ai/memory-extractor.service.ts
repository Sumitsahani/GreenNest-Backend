import { Injectable } from '@nestjs/common';
import { AiMemoryType, EvidenceSource, Prisma } from '@prisma/client';

export interface ExtractedMemory {
  key: string;
  value: string;
  type: AiMemoryType;
  confidence: number;
  operation: 'upsert' | 'delete';
  plantId?: string;
  source?: EvidenceSource;
  evidence?: Prisma.InputJsonValue;
}

@Injectable()
export class MemoryExtractorService {
  extract(message: string, plantId?: string): ExtractedMemory[] {
    const text = message.trim();
    if (text.length < 12 || /^(hi|hello|thanks|thank you|ok|okay)[!. ]*$/i.test(text)) return [];

    const found = new Map<string, ExtractedMemory>();
    const add = (memory: ExtractedMemory): void => void found.set(memory.key, memory);
    const capture = (pattern: RegExp): string | undefined => pattern.exec(text)?.[1]?.trim();

    const experience = capture(/\b(?:i am|i'm)\s+(?:a\s+)?(beginner|newbie|novice|intermediate|experienced|expert)(?:\s+gardener)?\b/i);
    if (experience) add(this.upsert('gardening_experience', experience.toLowerCase(), AiMemoryType.EXPERIENCE));

    const home = capture(/\b(?:i live in|my home is|i have)\s+(?:an?\s+)?(apartment|flat|house|studio)\b/i);
    if (home) add(this.upsert('home_type', home.toLowerCase(), AiMemoryType.ENVIRONMENT));

    const space = capture(/\b(?:i have|my|use my)\s+(?:an?\s+)?(balcony|terrace|patio|rooftop|indoor garden|backyard|garden)\b/i);
    if (space) add(this.upsert('growing_space', space.toLowerCase(), AiMemoryType.ENVIRONMENT));

    const sunlight = capture(/\b(?:get|gets|receive|receives|have|has)\s+(\d+(?:\.\d+)?(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?)\s*hours?\s+(?:of\s+)?(?:direct\s+)?sunlight\b/i);
    if (sunlight) add(this.upsert('daily_sunlight_hours', sunlight.replace(/\s+/g, ' '), AiMemoryType.ENVIRONMENT));

    const goal = capture(/\b(?:my goal is to|i want to|i would like to)\s+([^.!?]{4,120})/i);
    if (goal && /grow|garden|plant|harvest|green|balcony|herb|vegetable|flower/i.test(goal)) {
      add(this.upsert('gardening_goal', goal, AiMemoryType.GOAL));
    }

    const prefer = capture(/\b(?:i prefer|i like|my preference is)\s+([^.!?]{2,100})/i);
    if (prefer && /plant|flower|herb|vegetable|maintenance|organic|native|indoor|outdoor/i.test(prefer)) {
      const type = /maintenance|watering|care/i.test(prefer) ? AiMemoryType.CARE_PREFERENCE : AiMemoryType.PLANT_PREFERENCE;
      add(this.upsert(type === AiMemoryType.CARE_PREFERENCE ? 'care_preference' : 'plant_preference', prefer, type));
    }

    if (/\b(?:low[- ]maintenance|easy[- ]care)\b/i.test(text)) {
      add(this.upsert('care_preference', 'low-maintenance plants', AiMemoryType.CARE_PREFERENCE));
    }

    const soilDryingDays = capture(/\bsoil\s+(?:stays|remains|is still)\s+(?:wet|moist)\s+(?:for\s+)?(?:around\s+)?(\d{1,2})\s*days?\b/i);
    if (soilDryingDays && plantId) {
      add({
        ...this.upsert(
          'soil_drying_days',
          `${soilDryingDays} days`,
          AiMemoryType.USER_CORRECTION,
        ),
        plantId,
        confidence: 0.98,
        source: EvidenceSource.USER_CORRECTION,
        evidence: { statement: text.slice(0, 300) },
      });
    } else if (/\bsoil\s+(?:is|feels|stays|remains)\s+(?:still\s+)?(?:wet|moist)\b/i.test(text) && plantId) {
      add({
        ...this.upsert(
          'soil_condition_current',
          'soil is still wet',
          AiMemoryType.PLANT_OBSERVATION,
        ),
        plantId,
        source: EvidenceSource.USER_STATEMENT,
        evidence: { statement: text.slice(0, 300) },
      });
    }

    const budget = capture(/\b(?:my budget is|budget of|spend up to)\s*(?:₹|rs\.?|inr|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (budget) add(this.upsert('shopping_budget', budget.replace(/,/g, ''), AiMemoryType.SHOPPING_PREFERENCE));

    const removalRules: Array<[string, RegExp]> = [
      ['care_preference', /\b(?:forget|remove|delete).{0,25}(?:care preference|low[- ]maintenance)\b/i],
      ['plant_preference', /\b(?:forget|remove|delete).{0,25}(?:plant preference|plants? i like)\b/i],
      ['shopping_budget', /\b(?:forget|remove|delete).{0,25}(?:budget|shopping preference)\b/i],
      ['gardening_goal', /\b(?:forget|remove|delete).{0,25}(?:goal|gardening goal)\b/i],
    ];
    for (const [key, pattern] of removalRules) {
      if (pattern.test(text)) add({ key, value: '', type: AiMemoryType.PREFERENCE, confidence: 1, operation: 'delete' });
    }
    return [...found.values()];
  }

  private upsert(key: string, value: string, type: AiMemoryType): ExtractedMemory {
    return {
      key,
      value: value.trim(),
      type,
      confidence: 0.95,
      operation: 'upsert',
      source: EvidenceSource.USER_STATEMENT,
    };
  }
}

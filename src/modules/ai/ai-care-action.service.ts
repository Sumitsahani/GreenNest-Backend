import { Injectable } from '@nestjs/common';
import { PlantLifecycleStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { GardenService } from '../garden/garden.service';
import { detectResponseLanguage, type ResponseLanguage } from './ai-response.service';

export interface AiCareUpdate {
  type: 'WATERED' | 'WATERING_RESCHEDULED';
  plantId: string;
  plantName: string;
  occurredAt?: string;
  nextWateringAt: string;
}

export interface AiCareActionResult {
  reply: string;
  update?: AiCareUpdate;
}

const monthByName: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function validDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day, 9, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
}

export function parseCareDate(
  message: string,
  mode: 'PAST' | 'FUTURE',
  now = new Date(),
): Date | null {
  const lower = message.toLowerCase();
  if (/\b(?:today|aaj)\b/.test(lower)) return new Date(now);
  if (/\byesterday\b/.test(lower) || (mode === 'PAST' && /\bkal\b/.test(lower))) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return date;
  }
  if (/\btomorrow\b/.test(lower) || (mode === 'FUTURE' && /\bkal\b/.test(lower))) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return date;
  }

  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(lower);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(lower);
  if (numeric) {
    const rawYear = numeric[3] ? Number(numeric[3]) : now.getFullYear();
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return validDate(year, Number(numeric[2]) - 1, Number(numeric[1]));
  }

  const names = Object.keys(monthByName).join('|');
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${names})(?:\\s+(20\\d{2}))?\\b`,
  ).exec(lower);
  const monthFirst = new RegExp(
    `\\b(${names})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`,
  ).exec(lower);
  const parts = dayFirst
    ? {
        day: Number(dayFirst[1]),
        month: monthByName[dayFirst[2] ?? ''],
        year: dayFirst[3],
      }
    : monthFirst
      ? {
          day: Number(monthFirst[2]),
          month: monthByName[monthFirst[1] ?? ''],
          year: monthFirst[3],
        }
      : null;
  if (!parts || parts.month === undefined) return null;
  let year = parts.year ? Number(parts.year) : now.getFullYear();
  let date = validDate(year, parts.month, parts.day);
  if (!date) return null;
  if (!parts.year && mode === 'FUTURE' && date.getTime() < now.getTime() - 86_400_000) {
    year += 1;
    date = validDate(year, parts.month, parts.day);
  }
  return date;
}

function directWateringStatement(message: string): boolean {
  return /\b(?:i\s+(?:just\s+|have\s+)?watered|watered\s+(?:it|this|my|the)|maine\b.{0,50}\b(?:pani|paani|water)\b.{0,30}\b(?:diya|dia|de diya)|(?:pani|paani|water)\b.{0,30}\b(?:diya|dia|de diya))\b/i.test(
    message,
  );
}

function directRescheduleRequest(message: string): boolean {
  return /(?:\b(?:set|change|update|move|reschedule)\b.{0,40}\b(?:next\s+)?(?:watering|water\s+date)\b|\b(?:next\s+)?(?:watering|water\s+date)\b.{0,40}\b(?:set|change|update|move|reschedule|kar\s*do)\b)/i.test(
    message,
  );
}

function dateLabel(value: Date, language: ResponseLanguage): string {
  return value.toLocaleDateString(language === 'HINDI' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

@Injectable()
export class AiCareActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly garden: GardenService,
  ) {}

  async apply(
    userId: string,
    explicitPlantId: string | undefined,
    message: string,
  ): Promise<AiCareActionResult | null> {
    const watered = directWateringStatement(message);
    const reschedule = directRescheduleRequest(message);
    if (!watered && !reschedule) return null;

    const language = detectResponseLanguage(message);
    const plants = await this.prisma.gardenPlant.findMany({
      where: {
        userId,
        lifecycleStatus: {
          in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED],
        },
      },
      select: { id: true, name: true },
    });
    const plant = explicitPlantId
      ? plants.find((item) => item.id === explicitPlantId)
      : (plants.find((item) => message.toLowerCase().includes(item.name.trim().toLowerCase())) ??
        (plants.length === 1 ? plants[0] : undefined));

    if (!plant) {
      const names = plants
        .slice(0, 4)
        .map((item) => item.name)
        .join(', ');
      return {
        reply:
          language === 'HINGLISH'
            ? `Kaunsa plant update karna hai?${names ? ` ${names} mein se naam bata do.` : ' Pehle garden mein plant add kar do.'}`
            : `Which plant should I update?${names ? ` Choose from: ${names}.` : ' Add a plant to your garden first.'}`,
      };
    }

    if (watered) {
      const caredAt = parseCareDate(message, 'PAST') ?? new Date();
      if (caredAt.getTime() > Date.now() + 5 * 60_000) {
        return {
          reply:
            language === 'HINGLISH'
              ? 'Future watering ko completed mark nahi kar sakta. Agar date schedule karni hai toh bolo: next watering date 10 September kar do.'
              : 'I cannot mark a future watering as completed. Ask me to reschedule the next watering date instead.',
        };
      }
      const updated = await this.garden.recordWateringAt(
        userId,
        plant.id,
        caredAt,
        'Watering recorded from Plant Buddy chat',
      );
      const next = new Date(updated.nextWateringAt);
      return {
        reply:
          language === 'HINGLISH'
            ? `Done! ${plant.name} ka watering ${dateLabel(caredAt, language)} ke liye record ho gaya. Next soil check ${dateLabel(next, language)} ko hai. Garden, reminder calendar aur care history sync ho gaye hain.`
            : `Done! I recorded ${plant.name} as watered on ${dateLabel(caredAt, language)}. Its next soil check is ${dateLabel(next, language)}. Your garden, reminder calendar, and care history are synced.`,
        update: {
          type: 'WATERED',
          plantId: plant.id,
          plantName: plant.name,
          occurredAt: caredAt.toISOString(),
          nextWateringAt: next.toISOString(),
        },
      };
    }

    const scheduledAt = parseCareDate(message, 'FUTURE');
    if (!scheduledAt) {
      return {
        reply:
          language === 'HINGLISH'
            ? `Bilkul - ${plant.name} ki next watering kis date par set karni hai?`
            : `Sure - what date should I set for ${plant.name}'s next watering?`,
      };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (scheduledAt.getTime() < today.getTime()) {
      return {
        reply:
          language === 'HINGLISH'
            ? 'Next watering ke liye aaj ya future ki date batao.'
            : 'Please choose today or a future date for the next watering.',
      };
    }
    const updated = await this.garden.rescheduleWatering(
      userId,
      plant.id,
      scheduledAt,
      'Watering date changed from Plant Buddy chat',
    );
    const next = new Date(updated.nextWateringAt);
    return {
      reply:
        language === 'HINGLISH'
          ? `Done! ${plant.name} ki next watering ${dateLabel(next, language)} par set ho gayi. Garden aur reminder calendar dono update ho gaye hain.`
          : `Done! ${plant.name}'s next watering is set for ${dateLabel(next, language)}. Your garden and reminder calendar are updated.`,
      update: {
        type: 'WATERING_RESCHEDULED',
        plantId: plant.id,
        plantName: plant.name,
        nextWateringAt: next.toISOString(),
      },
    };
  }
}

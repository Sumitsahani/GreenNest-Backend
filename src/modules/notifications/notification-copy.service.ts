import { Injectable, Logger } from '@nestjs/common';
import { NotificationAgeGroup, NotificationTone } from '@prisma/client';

export interface WeatherNotificationFacts {
  location: string;
  plantNames: string[];
  probability: number;
  precipitationMm: number;
  windGustKmh: number;
  recentlyWatered: boolean;
  rainSensitive: boolean;
}

export interface NotificationContent {
  title: string;
  body: string;
}

const unsafeContentPattern =
  /\b(?:adult|sexual|nude|naked|porn|dating|hookup|romance|alcohol|drunk|drug|gambling|abuse|abusive)\b/i;

export function resolveNotificationTone(
  ageGroup: NotificationAgeGroup,
  preference: NotificationTone,
): Exclude<NotificationTone, 'AUTO'> {
  if (preference !== NotificationTone.AUTO) return preference;
  return ageGroup === NotificationAgeGroup.AGE_18_35
    ? NotificationTone.PLAYFUL
    : NotificationTone.CALM;
}

export function isSafeNotificationContent(
  content: NotificationContent,
  facts: WeatherNotificationFacts,
): boolean {
  const combined = `${content.title} ${content.body}`;
  const rainAmount = String(Math.round(facts.precipitationMm));
  return (
    content.title.length > 0 &&
    content.title.length <= 65 &&
    content.body.length > 0 &&
    content.body.length <= 240 &&
    !unsafeContentPattern.test(combined) &&
    !/https?:\/\/|www\.|@\w+/i.test(combined) &&
    content.body.includes(String(facts.probability)) &&
    content.body.includes(rainAmount)
  );
}

export function buildFallbackWeatherNotification(
  facts: WeatherNotificationFacts,
  tone: Exclude<NotificationTone, 'AUTO'>,
): NotificationContent {
  const plants = facts.plantNames.slice(0, 2).join(' & ') || 'Outdoor plants';
  const rain = Math.round(facts.precipitationMm);
  const action =
    facts.recentlyWatered || facts.rainSensitive
      ? `${plants} ko cover me rakhein; unhe abhi extra paani ki zarurat nahi hai.`
      : `${plants} ke pots ko cover me rakhein aur drainage check kar lein.`;
  const wind = facts.windGustKmh >= 40 ? ' Tez hawa ke liye pots ko secure bhi kar lein.' : '';

  if (tone === NotificationTone.PLAYFUL) {
    return {
      title: '⛈️ Rain alert, plant fam!',
      body: `${facts.location} me next 3 hours ${facts.probability}% chance aur lagbhag ${rain} mm heavy rain hai. Rain party pause—${action}${wind}`,
    };
  }
  if (tone === NotificationTone.MINIMAL) {
    return {
      title: '⛈️ Heavy rain in next 3 hours',
      body: `${facts.location}: ${facts.probability}% chance, around ${rain} mm rain. ${action}${wind}`,
    };
  }
  return {
    title: '⛈️ अगले 3 घंटों में तेज बारिश',
    body: `${facts.location} में ${facts.probability}% संभावना और लगभग ${rain} mm बारिश का अनुमान है। ${action}${wind}`,
  };
}

@Injectable()
export class NotificationCopyService {
  private readonly logger = new Logger(NotificationCopyService.name);

  async weatherAlert(
    facts: WeatherNotificationFacts,
    ageGroup: NotificationAgeGroup,
    preference: NotificationTone,
  ): Promise<NotificationContent> {
    const tone = resolveNotificationTone(ageGroup, preference);
    const fallback = buildFallbackWeatherNotification(facts, tone);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return fallback;

    try {
      const generated = await this.generateWithGemini(apiKey, facts, ageGroup, tone);
      return isSafeNotificationContent(generated, facts) ? generated : fallback;
    } catch (error) {
      this.logger.debug(
        `AI notification copy unavailable; safe fallback used: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return fallback;
    }
  }

  private async generateWithGemini(
    apiKey: string,
    facts: WeatherNotificationFacts,
    ageGroup: NotificationAgeGroup,
    tone: Exclude<NotificationTone, 'AUTO'>,
  ): Promise<NotificationContent> {
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: [
                  'You write short GreenNest weather notifications for an all-ages audience.',
                  'Use only the supplied facts and required action. Never invent weather, timing, plant state, or risk.',
                  'Never use adult, sexual, romantic, dating, abusive, insulting, discriminatory, violent, substance-related, or double-meaning language.',
                  'Do not shame or frighten the user. Do not advise watering blindly. Keep jokes gentle and plant-related.',
                  'The title must be at most 65 characters and the body at most 240 characters.',
                  'The body must include the exact rain probability number and rounded rainfall millimetres.',
                ].join(' '),
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: JSON.stringify({
                    task: 'Rewrite this important three-hour heavy-rain alert',
                    audienceAgeGroup: ageGroup,
                    tone,
                    facts: {
                      ...facts,
                      precipitationMm: Math.round(facts.precipitationMm),
                    },
                  }),
                },
              ],
            },
          ],
          safetySettings: [
            'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            'HARM_CATEGORY_HARASSMENT',
            'HARM_CATEGORY_HATE_SPEECH',
            'HARM_CATEGORY_DANGEROUS_CONTENT',
          ].map((category) => ({
            category,
            threshold: 'BLOCK_LOW_AND_ABOVE',
          })),
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              required: ['title', 'body'],
              properties: {
                title: { type: 'STRING' },
                body: { type: 'STRING' },
              },
            },
            temperature: 0.65,
            maxOutputTokens: 160,
          },
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty AI notification response');
    const parsed = JSON.parse(text) as Partial<NotificationContent>;
    return {
      title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
      body: typeof parsed.body === 'string' ? parsed.body.trim() : '',
    };
  }
}

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AiContext } from './ai-context.service';

export interface ConversationTurn {
  role: 'USER' | 'ASSISTANT';
  content: string;
}

export type ResponseLanguage = 'ENGLISH' | 'HINGLISH' | 'HINDI';

export function detectResponseLanguage(question: string): ResponseLanguage {
  if (/[ऀ-ॿ]/u.test(question)) return 'HINDI';
  const romanHindiMarkers = question.match(
    /\b(?:kya|kyu|kyon|kaise|kab|kahan|mera|meri|mere|isko|usko|mujhe|paani|pani|mitti|patta|patte|dhoop|nahi|nahin|karu|karna|hoga|raha|rahi|hai|hain|wala|wali|aur|par|pe|ko)\b/gi,
  );
  return romanHindiMarkers?.length ? 'HINGLISH' : 'ENGLISH';
}

function languageInstruction(language: ResponseLanguage): string {
  if (language === 'HINDI') {
    return 'Reply only in natural Hindi using Devanagari script. Keep plant names understandable.';
  }
  if (language === 'HINGLISH') {
    return 'Reply only in natural Roman-script Hinglish, mixing simple Hindi and English the way the user did. Do not switch to Devanagari Hindi or full English.';
  }
  return 'Reply only in natural English. Do not switch to Hindi or Hinglish.';
}

export interface PlantIdentificationResult {
  containsRealPlant: boolean;
  imageCategory:
    | 'LIVE_PLANT'
    | 'PLANT_IMAGE_OR_PRINT'
    | 'BOOK_OR_DOCUMENT'
    | 'POSTER_OR_ARTWORK'
    | 'SCREEN'
    | 'ARTIFICIAL_PLANT'
    | 'OTHER'
    | 'UNCLEAR';
  classificationConfidence: number;
  rejectionReason: string | null;
  name: string;
  species: string;
  confidence: number;
  suggestedLocation: string;
  notes: string;
}

type PlantImagePart = { inlineData: { mimeType: string; data: string } };

const identificationPrompt =
  'First verify whether this is a direct photo of a real living plant. A plant picture printed on a book, document, poster, package, painting, phone, TV, or computer screen is NOT a real plant. Artificial/plastic plants are also NOT real plants. Classify the image medium before identifying species. Set containsRealPlant=true only when a physical living plant is clearly visible. If false or unclear, use Unknown for name/species, keep species confidence below 0.3, and explain the rejection briefly. For a real plant, return a concise common name, scientific species, suitable placement, and one care note.';

const defaultGeminiIdentificationModels = [
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const defaultOpenAiVisionModels = ['gpt-5.6-luna', 'gpt-5.6-terra'];

function configuredModels(value: string | undefined, defaults: string[]): string[] {
  const configured = value
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return configured?.length ? [...new Set(configured)] : defaults;
}

function normalizePlantIdentification(result: Record<string, unknown>): PlantIdentificationResult {
  const textValue = (value: unknown, fallback: string): string =>
    typeof value === 'string' ? value : fallback;
  const confidenceValue = (value: unknown): number => Math.max(0, Math.min(1, Number(value) || 0));
  const allowedCategories = new Set<PlantIdentificationResult['imageCategory']>([
    'LIVE_PLANT',
    'PLANT_IMAGE_OR_PRINT',
    'BOOK_OR_DOCUMENT',
    'POSTER_OR_ARTWORK',
    'SCREEN',
    'ARTIFICIAL_PLANT',
    'OTHER',
    'UNCLEAR',
  ]);
  const requestedCategory = textValue(result.imageCategory, 'UNCLEAR');
  const imageCategory = allowedCategories.has(
    requestedCategory as PlantIdentificationResult['imageCategory'],
  )
    ? (requestedCategory as PlantIdentificationResult['imageCategory'])
    : 'UNCLEAR';
  const classificationConfidence = confidenceValue(result.classificationConfidence);
  const containsRealPlant =
    result.containsRealPlant === true &&
    imageCategory === 'LIVE_PLANT' &&
    classificationConfidence >= 0.65;
  const identificationConfidence = confidenceValue(result.confidence);
  return {
    containsRealPlant,
    imageCategory,
    classificationConfidence,
    rejectionReason: containsRealPlant
      ? null
      : textValue(
          result.rejectionReason,
          'This does not appear to be a direct photo of a real living plant.',
        ).slice(0, 240),
    name: containsRealPlant
      ? textValue(result.name, 'Unknown plant').slice(0, 100)
      : 'Unknown plant',
    species: containsRealPlant ? textValue(result.species, 'Unknown').slice(0, 140) : 'Unknown',
    confidence: containsRealPlant
      ? identificationConfidence
      : Math.min(0.29, identificationConfidence),
    suggestedLocation: containsRealPlant
      ? textValue(result.suggestedLocation, 'Bright indirect light').slice(0, 200)
      : '',
    notes: containsRealPlant ? textValue(result.notes, '').slice(0, 500) : '',
  };
}

@Injectable()
export class AiResponseService {
  private readonly logger = new Logger(AiResponseService.name);

  async identifyPlant(imageUrl: string): Promise<PlantIdentificationResult> {
    try {
      const imagePart = await this.loadImage(imageUrl);
      return await this.identifyPlantAcrossProviders(imagePart);
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Plant identification failed: ${message}`);
      if (/not configured/i.test(message)) {
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Plant recognition is not configured yet.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (/HTTP (429|500|502|503|504)/i.test(message)) {
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Plant recognition is busy right now. Please wait a moment and try again.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (/timeout|abort/i.test(message)) {
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Plant recognition took too long. Please try again with a clear photo and a stable connection.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (/too large/i.test(message)) {
        throw new BusinessException(
          ErrorCode.AI_ANALYSIS_FAILED,
          'This photo is too large. Please retake it or choose a photo smaller than 15 MB.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      if (/image|photo|unsupported|load/i.test(message)) {
        throw new BusinessException(
          ErrorCode.AI_ANALYSIS_FAILED,
          'The uploaded photo could not be read. Please use a clear JPG, PNG, WEBP, HEIC, or HEIF image.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw new BusinessException(
        ErrorCode.AI_ANALYSIS_FAILED,
        'I could not recognize this plant. Please try a closer photo in good light.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async identifyPlantAcrossProviders(
    imagePart: PlantImagePart,
  ): Promise<PlantIdentificationResult> {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!geminiKey && !openAiKey) throw new Error('Plant recognition is not configured');

    const failures: string[] = [];
    if (geminiKey) {
      const models = configuredModels(
        process.env.GEMINI_IDENTIFICATION_MODELS,
        defaultGeminiIdentificationModels,
      );
      for (const model of models) {
        try {
          return await this.identifyPlantWithGemini(imagePart, model, geminiKey);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          failures.push(`Gemini ${model}: ${message}`);
          this.logger.warn(`Plant identification provider failed: Gemini ${model}: ${message}`);
        }
      }
    }

    if (openAiKey) {
      const models = configuredModels(process.env.OPENAI_VISION_MODELS, defaultOpenAiVisionModels);
      for (const model of models) {
        try {
          return await this.identifyPlantWithOpenAi(imagePart, model, openAiKey);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          failures.push(`OpenAI ${model}: ${message}`);
          this.logger.warn(`Plant identification provider failed: OpenAI ${model}: ${message}`);
        }
      }
    }

    throw new Error(
      failures.length
        ? `All plant recognition providers failed: ${failures.join(' | ')}`
        : 'Plant recognition is not configured',
    );
  }

  private async identifyPlantWithGemini(
    imagePart: PlantImagePart,
    model: string,
    apiKey: string,
  ): Promise<PlantIdentificationResult> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: identificationPrompt,
                },
                imagePart,
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              required: [
                'name',
                'species',
                'confidence',
                'suggestedLocation',
                'notes',
                'containsRealPlant',
                'imageCategory',
                'classificationConfidence',
                'rejectionReason',
              ],
              properties: {
                containsRealPlant: { type: 'BOOLEAN' },
                imageCategory: {
                  type: 'STRING',
                  enum: [
                    'LIVE_PLANT',
                    'PLANT_IMAGE_OR_PRINT',
                    'BOOK_OR_DOCUMENT',
                    'POSTER_OR_ARTWORK',
                    'SCREEN',
                    'ARTIFICIAL_PLANT',
                    'OTHER',
                    'UNCLEAR',
                  ],
                },
                classificationConfidence: {
                  type: 'NUMBER',
                  minimum: 0,
                  maximum: 1,
                },
                rejectionReason: { type: 'STRING' },
                name: { type: 'STRING' },
                species: { type: 'STRING' },
                confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
                suggestedLocation: { type: 'STRING' },
                notes: { type: 'STRING' },
              },
            },
            maxOutputTokens: 600,
          },
        }),
        signal: AbortSignal.timeout(35_000),
      },
    );
    if (!response.ok) throw new Error(`Gemini identification failed: HTTP ${response.status}`);
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) throw new Error('Empty identification response');
    const normalized = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const result = JSON.parse(normalized) as Record<string, unknown>;
    return normalizePlantIdentification(result);
  }

  private async identifyPlantWithOpenAi(
    imagePart: PlantImagePart,
    model: string,
    apiKey: string,
  ): Promise<PlantIdentificationResult> {
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
        imagePart.inlineData.mimeType,
      )
    ) {
      throw new Error(`Unsupported image type ${imagePart.inlineData.mimeType}`);
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: identificationPrompt },
              {
                type: 'input_image',
                image_url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
                detail: 'high',
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'plant_identification',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: [
                'name',
                'species',
                'confidence',
                'suggestedLocation',
                'notes',
                'containsRealPlant',
                'imageCategory',
                'classificationConfidence',
                'rejectionReason',
              ],
              properties: {
                containsRealPlant: { type: 'boolean' },
                imageCategory: {
                  type: 'string',
                  enum: [
                    'LIVE_PLANT',
                    'PLANT_IMAGE_OR_PRINT',
                    'BOOK_OR_DOCUMENT',
                    'POSTER_OR_ARTWORK',
                    'SCREEN',
                    'ARTIFICIAL_PLANT',
                    'OTHER',
                    'UNCLEAR',
                  ],
                },
                classificationConfidence: { type: 'number', minimum: 0, maximum: 1 },
                rejectionReason: { type: ['string', 'null'] },
                name: { type: 'string' },
                species: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                suggestedLocation: { type: 'string' },
                notes: { type: 'string' },
              },
            },
          },
        },
        max_output_tokens: 600,
      }),
      signal: AbortSignal.timeout(35_000),
    });
    if (!response.ok) throw new Error(`OpenAI identification failed: HTTP ${response.status}`);
    const body = (await response.json()) as {
      output_text?: string;
      output?: { content?: { type?: string; text?: string }[] }[];
    };
    const text =
      body.output_text?.trim() ||
      body.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === 'output_text')
        .map((item) => item.text ?? '')
        .join('')
        .trim();
    if (!text) throw new Error('OpenAI returned an empty identification response');
    return normalizePlantIdentification(JSON.parse(text) as Record<string, unknown>);
  }

  async generate(
    question: string,
    context: AiContext,
    imageUrl?: string,
    history: ConversationTurn[] = [],
  ): Promise<string> {
    const language = detectResponseLanguage(question);
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        return await this.generateWithGemini(
          apiKey,
          question,
          context,
          language,
          imageUrl,
          history,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(`Gemini request failed; using local fallback: ${message}`);
      }
    }
    return this.generateFallback(question, context, language);
  }

  private async generateWithGemini(
    apiKey: string,
    question: string,
    context: AiContext,
    language: ResponseLanguage,
    imageUrl?: string,
    history: ConversationTurn[] = [],
  ): Promise<string> {
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    const imagePart = imageUrl ? await this.loadImage(imageUrl) : undefined;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `You are GreenNest Plant Coach, a concise and practical gardening assistant. ${languageInstruction(language)} Always follow the CURRENT QUESTION language, even if conversation history uses another language. Use current verified plant data and current plant history before generic knowledge. Direct user statements and corrections outrank AI inference. Historical outcomes and repeated user patterns are supporting evidence only and must never override conflicting current evidence. Never invent plant history, preferences, events, causes, or sources. Distinguish user-reported causes from AI inferences and never present uncertainty as fact. Give a direct answer first, then short practical steps when useful. Use simple headings or bullets for multi-step advice. If evidence is insufficient, state what is unknown. Never mention the underlying model or provider. Never claim that the model was retrained. For photos, describe visible symptoms, offer possible causes with uncertainty, practical next steps, and ask for missing details. Include safety warnings for pesticides, toxic plants, or consumption.`,
              },
            ],
          },
          contents: [
            ...history.map((turn) => ({
              role: turn.role === 'ASSISTANT' ? 'model' : 'user',
              parts: [{ text: turn.content }],
            })),
            {
              role: 'user',
              parts: [
                { text: `${context.promptContext}\n\nCURRENT QUESTION:\n${question}` },
                ...(imagePart ? [imagePart] : []),
              ],
            },
          ],
          generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) throw new Error('Gemini returned an empty response');
    return text;
  }

  private async loadImage(
    imageUrl: string,
  ): Promise<{ inlineData: { mimeType: string; data: string } }> {
    const url = new URL(imageUrl);
    const supabaseHost = new URL(process.env.SUPABASE_URL ?? '').hostname;
    if (
      url.protocol !== 'https:' ||
      url.hostname !== supabaseHost ||
      !url.pathname.includes('/storage/v1/object/public/user-photos/')
    ) {
      throw new Error('Unsupported image URL');
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Unable to load image: HTTP ${response.status}`);
    const responseMimeType = response.headers.get('content-type')?.split(';')[0];
    const extension = url.pathname.split('.').pop()?.toLowerCase();
    const mimeByExtension: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
    };
    const mimeType = responseMimeType?.startsWith('image/')
      ? responseMimeType
      : (mimeByExtension[extension ?? ''] ?? 'image/jpeg');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType))
      throw new Error('Unsupported image type');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('Image is too large');
    return { inlineData: { mimeType, data: bytes.toString('base64') } };
  }

  private generateFallback(
    question: string,
    context: AiContext,
    language: ResponseLanguage,
  ): string {
    const lower = question.toLowerCase();
    const facts = new Map(context.memories.map((item) => [item.memoryKey, item.memoryValue]));
    const personalization = [facts.get('gardening_experience'), facts.get('growing_space')]
      .filter(Boolean)
      .join(', ');
    if (/water|watering|paani|pani|jal|पानी|सिंचाई/.test(lower) && context.garden.length) {
      const next = [...context.garden].sort(
        (a, b) => a.nextWateringAt.getTime() - b.nextWateringAt.getTime(),
      )[0];
      if (next) {
        const date = next.nextWateringAt.toLocaleDateString(
          language === 'HINDI' ? 'hi-IN' : 'en-IN',
          { day: 'numeric', month: 'short' },
        );
        if (language === 'HINGLISH') {
          return `${next.name} ka next soil check ${date} ko hai. Pehle upar ki 2–3 cm mitti touch karke dekho; dry lage tabhi paani do.`;
        }
        if (language === 'HINDI') {
          return `${next.name} की मिट्टी जाँचने की अगली तारीख ${date} है। पहले ऊपर की 2–3 सेमी मिट्टी छूकर देखें; सूखी लगे तभी पानी दें।`;
        }
        return `${next.name} is next for a soil check on ${date}. Touch the top 2–3 cm first and water only if it feels dry.`;
      }
    }
    if (language === 'HINGLISH') {
      const known = context.garden.length
        ? `Main aapke ${context.garden.length} saved plants ka data use kar sakta hoon`
        : 'Abhi koi saved plant nahi mila';
      return `${known}${personalization ? ` aur saved context (${personalization})` : ''}. Accurate answer ke liye plant ka naam, light aur soil condition bata do.`;
    }
    if (language === 'HINDI') {
      const known = context.garden.length
        ? `मैं आपके ${context.garden.length} सहेजे गए पौधों की जानकारी इस्तेमाल कर सकता हूँ`
        : 'अभी कोई सहेजा गया पौधा नहीं मिला';
      return `${known}। सटीक जवाब के लिए पौधे का नाम, रोशनी और मिट्टी की स्थिति बताएँ।`;
    }
    const known = context.garden.length
      ? `I can use your ${context.garden.length} saved garden plants`
      : 'I do not have a saved garden plant yet';
    return `${known}${personalization ? ` and your saved context (${personalization})` : ''}. For "${question.trim()}", share the plant name and light/soil condition for a precise answer.`;
  }
}

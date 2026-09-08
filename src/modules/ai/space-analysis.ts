export const spaceTypes = [
  'LIVING_ROOM',
  'BEDROOM',
  'BALCONY',
  'OFFICE',
  'TERRACE',
  'KITCHEN',
  'CAFE',
  'RESTAURANT',
  'RECEPTION',
  'SHOP',
  'STUDIO',
  'OTHER',
  'UNKNOWN',
] as const;

export type AnalyzedSpaceType = (typeof spaceTypes)[number];
export type AnalyzedEnvironment = 'INDOOR' | 'OUTDOOR' | 'UNKNOWN';
export type LightLevel = 'LOW' | 'MEDIUM' | 'BRIGHT_INDIRECT' | 'DIRECT_SUN' | 'UNKNOWN';

export interface SpaceAnalysisResult {
  spaceType: AnalyzedSpaceType;
  environment: AnalyzedEnvironment;
  proportions: {
    shape: 'COMPACT' | 'BALANCED' | 'WIDE' | 'TALL' | 'UNKNOWN';
    description: string;
    confidence: number;
  };
  objects: Array<{
    type: string;
    location: string;
    boundingBox: [number, number, number, number] | null;
    confidence: number;
  }>;
  surfaces: Array<{
    type: string;
    location: string;
    boundingBox: [number, number, number, number] | null;
    available: boolean;
    confidence: number;
  }>;
  environmentEstimate: {
    naturalLight: LightLevel;
    directSunlightPossible: boolean;
    indirectLight: LightLevel;
    ventilation: 'LOW' | 'MEDIUM' | 'GOOD' | 'UNKNOWN';
    windowProximity: 'NEAR' | 'MODERATE' | 'FAR' | 'UNKNOWN';
    basis: string;
    confidence: number;
  };
  placementZones: Array<{
    zoneId: string;
    type: 'FLOOR' | 'TABLE' | 'DESK' | 'SHELF' | 'WINDOW_SIDE' | 'CORNER';
    location: string;
    boundingBox: [number, number, number, number] | null;
    approximateSize: 'SMALL' | 'MEDIUM' | 'LARGE' | 'UNKNOWN';
    light: LightLevel;
    visibility: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
    accessibility: 'EASY' | 'MODERATE' | 'DIFFICULT' | 'UNKNOWN';
    safetyConsiderations: string[];
    available: boolean;
    confidence: number;
  }>;
  confidence: number;
  warnings: string[];
  analysisModel: string;
}

export const spaceAnalysisPrompt = (
  declaredType?: string,
  language: 'ENGLISH' | 'HINDI' = 'ENGLISH',
): string =>
  `Analyze this real space photo for practical plant placement. ${declaredType ? `The user describes it as ${declaredType}. Treat that as a hint, not verified fact.` : ''}
Return one JSON object with exactly these top-level fields:
- spaceType: one of ${spaceTypes.join(', ')}
- environment: INDOOR, OUTDOOR, or UNKNOWN
- proportions: {shape, description, confidence}; shape is COMPACT, BALANCED, WIDE, TALL, or UNKNOWN
- objects: [{type, location, boundingBox, confidence}]
- surfaces: [{type, location, boundingBox, available, confidence}]
- environmentEstimate: {naturalLight, directSunlightPossible, indirectLight, ventilation, windowProximity, basis, confidence}
- placementZones: [{type, location, boundingBox, approximateSize, light, visibility, accessibility, safetyConsiderations, available, confidence}]
- confidence: number from 0 to 1
- warnings: string array
Light values must be LOW, MEDIUM, BRIGHT_INDIRECT, DIRECT_SUN, or UNKNOWN. Ventilation must be LOW, MEDIUM, GOOD, or UNKNOWN. Window proximity must be NEAR, MODERATE, FAR, or UNKNOWN. Zone type must be FLOOR, TABLE, DESK, SHELF, WINDOW_SIDE, or CORNER. approximateSize must be SMALL, MEDIUM, LARGE, or UNKNOWN. visibility must be LOW, MEDIUM, HIGH, or UNKNOWN. accessibility must be EASY, MODERATE, DIFFICULT, or UNKNOWN.
Detect only clearly visible major objects and usable surfaces. Bounding boxes are normalized [x,y,width,height] values from 0 to 1; use [0,0,0,0] if unavailable. Never invent exact dimensions, lux, temperature, or humidity. Use UNKNOWN when evidence is weak. Placement zones must be physically plausible, accessible, and must not block doors, walkways, screens, cooking areas, or unsafe ledges. Light is an estimate from this single image. Return at most 12 objects, 10 surfaces, and 8 placement zones. Write all descriptive text fields in ${language === 'HINDI' ? 'simple Hindi that an everyday app user can understand' : 'simple English'}. Keep enum values exactly as specified. Return JSON only, without markdown.`;

export const spaceAnalysisResponseSchema = {
  type: 'OBJECT',
  required: [
    'spaceType',
    'environment',
    'proportions',
    'objects',
    'surfaces',
    'environmentEstimate',
    'placementZones',
    'confidence',
    'warnings',
  ],
  properties: {
    spaceType: { type: 'STRING', enum: [...spaceTypes] },
    environment: { type: 'STRING', enum: ['INDOOR', 'OUTDOOR', 'UNKNOWN'] },
    proportions: {
      type: 'OBJECT',
      required: ['shape', 'description', 'confidence'],
      properties: {
        shape: { type: 'STRING', enum: ['COMPACT', 'BALANCED', 'WIDE', 'TALL', 'UNKNOWN'] },
        description: { type: 'STRING' },
        confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
      },
    },
    objects: {
      type: 'ARRAY',
      maxItems: 12,
      items: {
        type: 'OBJECT',
        required: ['type', 'location', 'boundingBox', 'confidence'],
        properties: {
          type: { type: 'STRING' },
          location: { type: 'STRING' },
          boundingBox: { type: 'ARRAY', minItems: 4, maxItems: 4, items: { type: 'NUMBER' } },
          confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
        },
      },
    },
    surfaces: {
      type: 'ARRAY',
      maxItems: 10,
      items: {
        type: 'OBJECT',
        required: ['type', 'location', 'boundingBox', 'available', 'confidence'],
        properties: {
          type: { type: 'STRING' },
          location: { type: 'STRING' },
          boundingBox: { type: 'ARRAY', minItems: 4, maxItems: 4, items: { type: 'NUMBER' } },
          available: { type: 'BOOLEAN' },
          confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
        },
      },
    },
    environmentEstimate: {
      type: 'OBJECT',
      required: [
        'naturalLight',
        'directSunlightPossible',
        'indirectLight',
        'ventilation',
        'windowProximity',
        'basis',
        'confidence',
      ],
      properties: {
        naturalLight: {
          type: 'STRING',
          enum: ['LOW', 'MEDIUM', 'BRIGHT_INDIRECT', 'DIRECT_SUN', 'UNKNOWN'],
        },
        directSunlightPossible: { type: 'BOOLEAN' },
        indirectLight: {
          type: 'STRING',
          enum: ['LOW', 'MEDIUM', 'BRIGHT_INDIRECT', 'DIRECT_SUN', 'UNKNOWN'],
        },
        ventilation: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'GOOD', 'UNKNOWN'] },
        windowProximity: { type: 'STRING', enum: ['NEAR', 'MODERATE', 'FAR', 'UNKNOWN'] },
        basis: { type: 'STRING' },
        confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
      },
    },
    placementZones: {
      type: 'ARRAY',
      maxItems: 8,
      items: {
        type: 'OBJECT',
        required: [
          'type',
          'location',
          'boundingBox',
          'approximateSize',
          'light',
          'visibility',
          'accessibility',
          'safetyConsiderations',
          'available',
          'confidence',
        ],
        properties: {
          type: {
            type: 'STRING',
            enum: ['FLOOR', 'TABLE', 'DESK', 'SHELF', 'WINDOW_SIDE', 'CORNER'],
          },
          location: { type: 'STRING' },
          boundingBox: { type: 'ARRAY', minItems: 4, maxItems: 4, items: { type: 'NUMBER' } },
          approximateSize: { type: 'STRING', enum: ['SMALL', 'MEDIUM', 'LARGE', 'UNKNOWN'] },
          light: {
            type: 'STRING',
            enum: ['LOW', 'MEDIUM', 'BRIGHT_INDIRECT', 'DIRECT_SUN', 'UNKNOWN'],
          },
          visibility: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'] },
          accessibility: { type: 'STRING', enum: ['EASY', 'MODERATE', 'DIFFICULT', 'UNKNOWN'] },
          safetyConsiderations: { type: 'ARRAY', items: { type: 'STRING' } },
          available: { type: 'BOOLEAN' },
          confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
        },
      },
    },
    confidence: { type: 'NUMBER', minimum: 0, maximum: 1 },
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  },
} as const;

function toOpenAiSchema(value: unknown, propertyName?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => toOpenAiSchema(item));
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const converted = Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      key === 'type' && typeof item === 'string' ? item.toLowerCase() : toOpenAiSchema(item, key),
    ]),
  ) as Record<string, unknown>;
  if (source.type === 'OBJECT') converted.additionalProperties = false;
  return propertyName === 'boundingBox' ? { anyOf: [converted, { type: 'null' }] } : converted;
}

export const openAiSpaceAnalysisSchema = toOpenAiSchema(spaceAnalysisResponseSchema);

const clampConfidence = (value: unknown): number => Math.max(0, Math.min(1, Number(value) || 0));
const text = (value: unknown, fallback = 'UNKNOWN', max = 180): string =>
  (typeof value === 'string' && value.trim() ? value.trim() : fallback).slice(0, max);
const member = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback;
const box = (value: unknown): [number, number, number, number] | null => {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const numbers = value.map(Number);
  if (numbers.some((item) => !Number.isFinite(item))) return null;
  if (numbers.every((item) => item === 0)) return null;
  return numbers.map((item) => Math.max(0, Math.min(1, item))) as [number, number, number, number];
};
const records = (value: unknown, limit: number): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value
        .filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
        )
        .slice(0, limit)
    : [];

export function normalizeSpaceAnalysis(
  raw: Record<string, unknown>,
  analysisModel: string,
): SpaceAnalysisResult {
  const proportions = (raw.proportions ?? {}) as Record<string, unknown>;
  const estimate = (raw.environmentEstimate ?? {}) as Record<string, unknown>;
  const lightLevels = ['LOW', 'MEDIUM', 'BRIGHT_INDIRECT', 'DIRECT_SUN', 'UNKNOWN'] as const;
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.slice(0, 240))
        .slice(0, 8)
    : [];
  const measurementWarning =
    'Light and size are estimates from one photo, not sensor measurements.';

  return {
    spaceType: member(raw.spaceType, spaceTypes, 'UNKNOWN'),
    environment: member(raw.environment, ['INDOOR', 'OUTDOOR', 'UNKNOWN'] as const, 'UNKNOWN'),
    proportions: {
      shape: member(
        proportions.shape,
        ['COMPACT', 'BALANCED', 'WIDE', 'TALL', 'UNKNOWN'] as const,
        'UNKNOWN',
      ),
      description: text(
        proportions.description,
        'Proportions could not be estimated confidently.',
        300,
      ),
      confidence: clampConfidence(proportions.confidence),
    },
    objects: records(raw.objects, 12).map((item) => ({
      type: text(item.type, 'OTHER', 60).toUpperCase().replace(/\s+/g, '_'),
      location: text(item.location, 'UNKNOWN', 100),
      boundingBox: box(item.boundingBox),
      confidence: clampConfidence(item.confidence),
    })),
    surfaces: records(raw.surfaces, 10).map((item) => ({
      type: text(item.type, 'OTHER', 60).toUpperCase().replace(/\s+/g, '_'),
      location: text(item.location, 'UNKNOWN', 100),
      boundingBox: box(item.boundingBox),
      available: item.available === true,
      confidence: clampConfidence(item.confidence),
    })),
    environmentEstimate: {
      naturalLight: member(estimate.naturalLight, lightLevels, 'UNKNOWN'),
      directSunlightPossible: estimate.directSunlightPossible === true,
      indirectLight: member(estimate.indirectLight, lightLevels, 'UNKNOWN'),
      ventilation: member(
        estimate.ventilation,
        ['LOW', 'MEDIUM', 'GOOD', 'UNKNOWN'] as const,
        'UNKNOWN',
      ),
      windowProximity: member(
        estimate.windowProximity,
        ['NEAR', 'MODERATE', 'FAR', 'UNKNOWN'] as const,
        'UNKNOWN',
      ),
      basis: text(estimate.basis, 'Not enough visible evidence.', 400),
      confidence: clampConfidence(estimate.confidence),
    },
    placementZones: records(raw.placementZones, 8).map((item, index) => ({
      zoneId: `zone_${String(index + 1).padStart(2, '0')}`,
      type: member(
        item.type,
        ['FLOOR', 'TABLE', 'DESK', 'SHELF', 'WINDOW_SIDE', 'CORNER'] as const,
        'FLOOR',
      ),
      location: text(item.location, 'UNKNOWN', 100),
      boundingBox: box(item.boundingBox),
      approximateSize: member(
        item.approximateSize,
        ['SMALL', 'MEDIUM', 'LARGE', 'UNKNOWN'] as const,
        'UNKNOWN',
      ),
      light: member(item.light, lightLevels, 'UNKNOWN'),
      visibility: member(item.visibility, ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'] as const, 'UNKNOWN'),
      accessibility: member(
        item.accessibility,
        ['EASY', 'MODERATE', 'DIFFICULT', 'UNKNOWN'] as const,
        'UNKNOWN',
      ),
      safetyConsiderations: Array.isArray(item.safetyConsiderations)
        ? item.safetyConsiderations
            .filter((warning): warning is string => typeof warning === 'string')
            .map((warning) => warning.slice(0, 180))
            .slice(0, 5)
        : [],
      available: item.available === true,
      confidence: clampConfidence(item.confidence),
    })),
    confidence: clampConfidence(raw.confidence),
    warnings: [...new Set([...warnings, measurementWarning])],
    analysisModel,
  };
}

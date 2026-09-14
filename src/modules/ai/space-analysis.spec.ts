import { normalizeSpaceAnalysis, openAiSpaceAnalysisSchema } from './space-analysis';

describe('normalizeSpaceAnalysis', () => {
  it('clamps uncertain AI values and assigns stable zone IDs', () => {
    const result = normalizeSpaceAnalysis(
      {
        spaceType: 'BEDROOM',
        environment: 'INDOOR',
        proportions: { shape: 'WIDE', description: 'A wide room', confidence: 4 },
        objects: [
          {
            type: 'window',
            location: 'back right',
            boundingBox: [-1, 0.2, 2, 0.5],
            confidence: 0.9,
          },
        ],
        surfaces: [],
        environmentEstimate: {
          naturalLight: 'BRIGHT_INDIRECT',
          directSunlightPossible: false,
          indirectLight: 'BRIGHT_INDIRECT',
          ventilation: 'GOOD',
          windowProximity: 'NEAR',
          basis: 'A visible window suggests daylight.',
          confidence: 0.82,
        },
        placementZones: [
          {
            type: 'CORNER',
            location: 'left corner',
            boundingBox: [0.05, 0.4, 0.2, 0.5],
            approximateSize: 'MEDIUM',
            light: 'MEDIUM',
            visibility: 'HIGH',
            accessibility: 'EASY',
            safetyConsiderations: ['Keep the walkway clear'],
            available: true,
            confidence: 0.88,
          },
        ],
        confidence: 0.8,
        warnings: [],
      },
      'gemini-test',
    );

    expect(result.proportions.confidence).toBe(1);
    expect(result.objects[0]?.boundingBox).toEqual([0, 0.2, 1, 0.5]);
    expect(result.placementZones[0]?.zoneId).toBe('zone_01');
    expect(result.warnings).toContain(
      'Light and size are estimates from one photo, not sensor measurements.',
    );
  });

  it('treats the schema-safe empty bounding box as unavailable', () => {
    const result = normalizeSpaceAnalysis(
      {
        objects: [
          { type: 'WINDOW', location: 'UNKNOWN', boundingBox: [0, 0, 0, 0], confidence: 0 },
        ],
      },
      'gemini-test',
    );
    expect(result.objects[0]?.boundingBox).toBeNull();
  });

  it('uses UNKNOWN categories rather than accepting invented values', () => {
    const result = normalizeSpaceAnalysis(
      {
        spaceType: 'PALACE',
        environment: 'MARS',
        proportions: {},
        environmentEstimate: {},
        objects: [],
        surfaces: [],
        placementZones: [],
      },
      'gemini-test',
    );

    expect(result.spaceType).toBe('UNKNOWN');
    expect(result.environment).toBe('UNKNOWN');
    expect(result.environmentEstimate.naturalLight).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
  });

  it('converts the provider schema to strict OpenAI JSON schema', () => {
    const schema = openAiSpaceAnalysisSchema as {
      type: string;
      additionalProperties: boolean;
      properties: {
        objects: {
          items: {
            properties: { boundingBox: { anyOf: { type?: string }[] } };
          };
        };
      };
    };
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.objects.items.properties.boundingBox.anyOf).toContainEqual({
      type: 'null',
    });
  });
});

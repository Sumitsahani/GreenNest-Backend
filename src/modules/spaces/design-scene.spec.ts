import type { Product, SpacePlantRecommendation, SpaceScene } from '@prisma/client';
import { buildDesignScene, readBox } from './design-scene';

export const sourceScene = {
  id: 'scene-1',
  analyzedAt: new Date('2026-09-08T10:00:00Z'),
  proportions: {},
  objects: [],
  surfaces: [],
  environment: {},
  warnings: [],
  placementZones: [
    {
      zoneId: 'left',
      type: 'FLOOR',
      location: 'LEFT',
      available: true,
      boundingBox: [0.1, 0.2, 0.3, 0.4],
    },
  ],
} as unknown as SpaceScene;
export const plantMatch = {
  id: 'match-1',
  productId: 'product-1',
  zoneId: 'left',
  style: 'MINIMAL',
  carePreference: 'EASY',
  lightScore: 90,
  spaceScore: 90,
  environmentScore: 90,
  confidence: 'HIGH',
  reasonEnglish: 'Good fit',
  reasonHindi: 'सही पौधा',
  cautionEnglish: null,
  cautionHindi: null,
  product: {
    id: 'product-1',
    active: true,
    name: 'Pothos',
    scientificName: 'Epipremnum aureum',
    images: [],
    petSafe: false,
  },
} as unknown as SpacePlantRecommendation & { product: Product };

describe('DesignScene placement', () => {
  it.each([
    null,
    [0, 0, 0, 0],
    [-0.1, 0, 0.4, 0.3],
    [0.8, 0, 0.3, 0.4],
    [0, 0, NaN, 1],
    ['0', 0, 1, 1],
  ])('does not invent coordinates for invalid box %p', (box) => {
    expect(readBox(box)).toBeNull();
  });
  it('keeps photo coordinates and bilingual plant snapshots, without fabricated world sizes', () => {
    const scene = buildDesignScene(sourceScene, [plantMatch]);
    expect(scene.coordinateSystem).toBe('PHOTO_NORMALIZED');
    expect(scene.plants[0]).toMatchObject({
      position: { x: 0.25, y: 0.6000000000000001 },
      reasonHindi: 'सही पौधा',
      pot: { color: '#E9E6DD' },
    });
    expect(scene.plants[0]).not.toHaveProperty('heightCm');
  });
  it('keeps a plant unpositioned when the photo has no usable bounding box', () => {
    const source = {
      ...sourceScene,
      placementZones: [{ zoneId: 'left', available: true, boundingBox: null }],
    };
    expect(buildDesignScene(source, [plantMatch]).plants[0]?.position).toBeNull();
  });
  it('rejects competing plants for the same zone', () => {
    expect(() =>
      buildDesignScene(sourceScene, [plantMatch, { ...plantMatch, id: 'match-2' }]),
    ).toThrow('Choose only one plant');
  });
  it.each(['lightScore', 'spaceScore', 'environmentScore'] as const)(
    'rejects an unsuitable %s despite a high overall match',
    (key) => {
      expect(() => buildDesignScene(sourceScene, [{ ...plantMatch, [key]: 35 }])).toThrow(
        'more suitable',
      );
    },
  );
  it('rejects unavailable zones and inactive products', () => {
    expect(() => buildDesignScene({ ...sourceScene, placementZones: [] }, [plantMatch])).toThrow(
      'no longer available',
    );
    expect(() =>
      buildDesignScene(sourceScene, [
        { ...plantMatch, product: { ...plantMatch.product, active: false } },
      ]),
    ).toThrow('more suitable');
  });
  it('uses different conceptual planters for styles without changing detected room geometry', () => {
    const scene = buildDesignScene(sourceScene, [{ ...plantMatch, style: 'PREMIUM' }]);
    expect(scene.plants[0]?.pot).toEqual({ color: '#333F38', shape: 'SQUARE' });
    expect(scene.room.placementZones).toEqual(sourceScene.placementZones);
  });
});

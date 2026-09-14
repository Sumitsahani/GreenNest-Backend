import { HttpStatus } from '@nestjs/common';
import type { Prisma, Product, SpacePlantRecommendation, SpaceScene } from '@prisma/client';
import { ErrorCode } from '../../common/constants/error-code';
import { BusinessException } from '../../common/exceptions/business.exception';

export function designError(message: string): never {
  throw new BusinessException(ErrorCode.VALIDATION_ERROR, message, HttpStatus.CONFLICT);
}

/** Photo coordinates only: [left, top, width, height], never world dimensions. */
export function readBox(value: unknown): [number, number, number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
  )
    return null;
  const [x, y, w, h] = value as [number, number, number, number];
  return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1 ? [x, y, w, h] : null;
}

export type DesignScene = {
  schemaVersion: number;
  coordinateSystem: string;
  sourceSceneId: string;
  sourceAnalyzedAt: string;
  style: string;
  carePreference: string;
  room: {
    proportions: Prisma.JsonValue;
    objects: Prisma.JsonValue;
    surfaces: Prisma.JsonValue;
    environment: Prisma.JsonValue;
    placementZones: Prisma.JsonValue;
    warnings: string[];
  };
  plants: {
    id: string;
    number: number;
    productId: string;
    name: string;
    species: string | null;
    image: string | null;
    petSafe: boolean;
    zoneId: string;
    zoneType: string;
    location: string;
    boundingBox: [number, number, number, number] | null;
    position: { x: number; y: number } | null;
    rotation: number;
    scale: number;
    pot: { color: string; shape: string };
    confidence: string;
    reasonEnglish: string;
    reasonHindi: string;
    cautionEnglish: string | null;
    cautionHindi: string | null;
  }[];
};

export function buildDesignScene(
  source: SpaceScene,
  matches: (SpacePlantRecommendation & { product: Product })[],
): DesignScene {
  const first = matches[0];
  if (!first) designError('Choose at least one plant.');
  const zones = Array.isArray(source.placementZones) ? source.placementZones : [];
  const occupied = new Set<string>();
  const plants = matches.map((match, index) => {
    const zone = zones.find(
      (item) =>
        item && typeof item === 'object' && !Array.isArray(item) && item.zoneId === match.zoneId,
    );
    if (!zone || typeof zone !== 'object' || Array.isArray(zone) || zone.available !== true) {
      return designError('This plant placement is no longer available. Refresh plant suggestions.');
    }
    if (occupied.has(match.zoneId)) designError('Choose only one plant for each place.');
    occupied.add(match.zoneId);
    if (
      !match.product.active ||
      Math.min(match.lightScore, match.spaceScore, match.environmentScore) < 60
    ) {
      designError('This plant needs a more suitable place. Choose another suggestion.');
    }
    const box = readBox(zone.boundingBox);
    const palette = {
      MINIMAL: { color: '#E9E6DD', shape: 'ROUND' },
      JUNGLE: { color: '#B6754B', shape: 'ROUND' },
      PREMIUM: { color: '#333F38', shape: 'SQUARE' },
      LOW_MAINTENANCE: { color: '#B6C6B5', shape: 'ROUND' },
    }[match.style];
    return {
      id: match.id,
      number: index + 1,
      productId: match.productId,
      name: match.product.name,
      species: match.product.scientificName,
      image: match.product.images[0] ?? null,
      petSafe: match.product.petSafe,
      zoneId: match.zoneId,
      zoneType: typeof zone.type === 'string' ? zone.type : 'UNKNOWN',
      location: typeof zone.location === 'string' ? zone.location : 'UNKNOWN',
      boundingBox: box,
      position: box ? { x: box[0] + box[2] / 2, y: box[1] + box[3] } : null,
      rotation: 0,
      scale: 1,
      pot: palette,
      confidence: match.confidence,
      reasonEnglish: match.reasonEnglish,
      reasonHindi: match.reasonHindi,
      cautionEnglish: match.cautionEnglish,
      cautionHindi: match.cautionHindi,
    };
  });
  return {
    schemaVersion: 1,
    coordinateSystem: 'PHOTO_NORMALIZED',
    sourceSceneId: source.id,
    sourceAnalyzedAt: source.analyzedAt.toISOString(),
    style: first.style,
    carePreference: first.carePreference,
    room: {
      proportions: source.proportions,
      objects: source.objects,
      surfaces: source.surfaces,
      environment: source.environment,
      placementZones: source.placementZones,
      warnings: source.warnings,
    },
    plants,
  };
}

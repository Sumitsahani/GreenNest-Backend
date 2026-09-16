import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TrackingService } from './tracking.service';

interface RoutePoint { latitude: number; longitude: number }
export interface VisitRoute { coordinates: RoutePoint[]; distanceMeters: number; durationSeconds: number; attribution: string }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function point(value: unknown): value is RoutePoint {
  return record(value) && typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}
export function parseRoute(value: unknown): VisitRoute {
  if (!record(value) || value.code !== 'Ok' || !Array.isArray(value.routes)) throw new Error('No road route found.');
  const route: unknown = value.routes[0];
  if (!record(route) || !record(route.geometry) || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 || route.geometry.coordinates.length > 20000 ||
    typeof route.distance !== 'number' || !Number.isFinite(route.distance) || route.distance < 0 ||
    typeof route.duration !== 'number' || !Number.isFinite(route.duration) || route.duration < 0) throw new Error('Invalid road route.');
  const coordinates = route.geometry.coordinates.map((pair: unknown) => {
    if (!Array.isArray(pair)) throw new Error('Invalid road point.');
    const coordinate = { longitude: pair[0] as unknown, latitude: pair[1] as unknown };
    if (!point(coordinate)) throw new Error('Invalid road point.');
    return coordinate;
  });
  return { coordinates, distanceMeters: route.distance, durationSeconds: route.duration, attribution: 'OpenStreetMap / OSRM - estimate without live traffic' };
}
@Injectable()
export class VisitRouteService {
  private readonly cache = new Map<string, { until: number; route: VisitRoute }>();
  constructor(private readonly tracking: TrackingService) {}
  async route(userId: string, id: string, gardener = false): Promise<VisitRoute | null> {
    const visit = await this.tracking.read(userId, id, gardener);
    if (!visit.live || !point(visit.location) || !point(visit.destination)) return null;
    const key = `${id}:${visit.destination.latitude}:${visit.destination.longitude}`;
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return cached.route;
    const base = process.env.OSRM_BASE_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'https://router.project-osrm.org');
    if (!base) throw new ServiceUnavailableException('Road routing is not configured.');
    const from = visit.location;
    const to = visit.destination;
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Routing unavailable');
      const route = parseRoute(await response.json() as unknown);
      if (this.cache.size >= 100) this.cache.clear();
      this.cache.set(key, { until: Date.now() + 30000, route });
      return route;
    } catch { throw new ServiceUnavailableException('Road route unavailable. Live GPS remains available.'); }
  }
}

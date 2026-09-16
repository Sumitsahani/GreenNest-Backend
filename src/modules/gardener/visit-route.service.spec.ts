import { parseRoute, VisitRouteService } from './visit-route.service';
import { TrackingService } from './tracking.service';

describe('road routes', () => {
  it('converts road geometry and returns real distance and duration', () => {
    expect(parseRoute({ code: 'Ok', routes: [{ geometry: { coordinates: [[77.2, 28.6], [77.21, 28.61]] }, distance: 1800, duration: 400 }] })).toMatchObject({
      coordinates: [{ longitude: 77.2, latitude: 28.6 }, { longitude: 77.21, latitude: 28.61 }], distanceMeters: 1800, durationSeconds: 400,
    });
  });
  it('rejects no-route and invalid coordinate responses', () => {
    expect(() => parseRoute({ code: 'NoRoute' })).toThrow();
    expect(() => parseRoute({ code: 'Ok', routes: [{ geometry: { coordinates: [[999, 28.6], [77, 28]] }, distance: 1, duration: 1 }] })).toThrow();
  });
  it('checks ownership before calling a routing provider', async () => {
    const tracking = { read: jest.fn().mockRejectedValue(new Error('Forbidden')) };
    const routes = new VisitRouteService(tracking as unknown as TrackingService);
    await expect(routes.route('stranger', 'booking')).rejects.toThrow('Forbidden');
  });
  it('does not return a route without fresh shared GPS and a confirmed destination', async () => {
    const tracking = { read: jest.fn().mockResolvedValue({ live: false, location: null, destination: null }) };
    const routes = new VisitRouteService(tracking as unknown as TrackingService);
    await expect(routes.route('customer', 'booking')).resolves.toBeNull();
  });
});

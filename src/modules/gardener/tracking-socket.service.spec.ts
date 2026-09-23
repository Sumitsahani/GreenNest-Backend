import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { WebSocket } from 'ws';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { TrackingEvents } from './tracking-events.service';
import { TrackingService } from './tracking.service';
import { TrackingSocket } from './tracking-socket.service';

describe('live tracking WebSocket transport', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const point = { latitude: 28.6, longitude: 77.3 };
  const config = new ConfigService({ corsOrigins: ['https://app.example.com'] });
  let server: Server;
  let gateway: TrackingSocket;
  let events: TrackingEvents;
  let clients: WebSocket[];
  let status: string;
  let rows: { actorId: string; kind: string; createdAt: Date; data: typeof point }[];
  let active: boolean;
  beforeEach(async () => {
    status = 'ON_THE_WAY';
    active = true;
    rows = [];
    clients = [];
    const db = {
      serviceBooking: {
        findUnique: ({ where }: { where: { id: string } }): Promise<object | null> =>
          Promise.resolve(
            where.id === id
              ? {
                  id,
                  userId: 'customer',
                  status,
                  scheduledAt: new Date(0),
                  gardener: { userId: 'gardener', active, name: 'Sam' },
                  service: { title: 'Care' },
                }
              : null,
          ),
      },
      address: {
        findFirst: (): Promise<object> =>
          Promise.resolve({ fullAddress: 'Private address', postalCode: '110001' }),
      },
      bookingActivity: { findMany: (): Promise<typeof rows> => Promise.resolve(rows) },
    };
    events = new TrackingEvents(config);
    const tracking = new TrackingService(db as unknown as PrismaService, events);
    const auth = {
      authenticate: jest.fn((token: string): Promise<{ id: string }> => {
        if (token === 'invalid') return Promise.reject(new Error('Invalid token'));
        return Promise.resolve({ id: token });
      }),
    };
    server = createServer();
    gateway = new TrackingSocket(
      { httpAdapter: { getHttpServer: () => server } } as HttpAdapterHost,
      auth as unknown as SupabaseAuthGuard,
      tracking,
      events,
      config,
    );
    gateway.onApplicationBootstrap();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });
  afterEach(async () => {
    clients.forEach((client) => client.terminate());
    gateway.onModuleDestroy();
    events.onModuleDestroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function subscribe(token = 'customer', gardener = false): Promise<WebSocket> {
    const client = new WebSocket(
      `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/tracking/live`,
    );
    clients.push(client);
    await once(client, 'open');
    client.send(JSON.stringify({ type: 'subscribe', bookingId: id, gardener, token }));
    return client;
  }
  async function snapshot(client: WebSocket): Promise<{
    type: string;
    revision: number;
    data: { live: boolean; location: unknown; status: string };
  }> {
    const [raw] = (await once(client, 'message')) as [Buffer];
    return JSON.parse(raw.toString()) as {
      type: string;
      revision: number;
      data: { live: boolean; location: unknown; status: string };
    };
  }
  it('pushes movement and stop without any customer HTTP request', async () => {
    const client = await subscribe();
    expect((await snapshot(client)).data.live).toBe(false);
    const moving = snapshot(client);
    rows = [{ actorId: 'gardener', kind: 'TRACKING_LOCATION', createdAt: new Date(), data: point }];
    events.publish(id);
    expect((await moving).data.location).toEqual(point);
    const stopped = snapshot(client);
    rows = [];
    events.publish(id);
    expect((await stopped).data.location).toBeNull();
  });
  it('accepts the native API origin and rejects an unrelated browser origin', async () => {
    const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    const native = new WebSocket(`ws://${host}/api/v1/tracking/live`, { origin: `http://${host}` });
    clients.push(native);
    await once(native, 'open');
    native.send(
      JSON.stringify({ type: 'subscribe', bookingId: id, gardener: false, token: 'customer' }),
    );
    expect((await snapshot(native)).type).toBe('snapshot');
    const browser = new WebSocket(`ws://${host}/api/v1/tracking/live`, {
      origin: 'https://unrelated.example.com',
    });
    clients.push(browser);
    browser.on('error', () => undefined);
    const [, response] = (await once(browser, 'unexpected-response')) as [
      unknown,
      { statusCode: number },
    ];
    expect(response.statusCode).toBe(403);
  });
  it('removes location immediately on arrival and resyncs on reconnect', async () => {
    rows = [{ actorId: 'gardener', kind: 'TRACKING_LOCATION', createdAt: new Date(), data: point }];
    const client = await subscribe();
    expect((await snapshot(client)).data.live).toBe(true);
    const arrived = snapshot(client);
    status = 'ARRIVED';
    events.publish(id);
    expect((await arrived).data).toMatchObject({ status: 'ARRIVED', location: null, live: false });
    const reconnect = await subscribe();
    expect((await snapshot(reconnect)).data.status).toBe('ARRIVED');
  });
  it('denies unrelated users and customer attempts to use the gardener view', async () => {
    const stranger = await subscribe('stranger');
    expect((await once(stranger, 'close'))[0]).toBe(4003);
    const impersonator = await subscribe('customer', true);
    expect((await once(impersonator, 'close'))[0]).toBe(4003);
  });
  it('rejects invalid credentials and revokes inactive gardener access', async () => {
    const invalid = await subscribe('invalid');
    expect((await once(invalid, 'close'))[0]).toBe(4001);
    const gardener = await subscribe('gardener', true);
    await snapshot(gardener);
    const closed = once(gardener, 'close');
    active = false;
    events.publish(id);
    expect((await closed)[0]).toBe(4003);
  });
  it('expires a stationary location without a new GPS write', async () => {
    rows = [
      {
        actorId: 'gardener',
        kind: 'TRACKING_LOCATION',
        createdAt: new Date(Date.now() - 44_500),
        data: point,
      },
    ];
    const client = await subscribe();
    expect((await snapshot(client)).data.live).toBe(true);
    expect((await snapshot(client)).data).toMatchObject({ location: null, live: false });
  });
});

import { HttpException, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { Subscription } from 'rxjs';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { TrackingService } from './tracking.service';
import { TrackingEvents } from './tracking-events.service';

@Injectable()
export class TrackingSocket implements OnApplicationBootstrap, OnModuleDestroy {
  private server?: Server;
  private sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 8192,
    perMessageDeflate: false,
  });
  private readonly userConnections = new Map<string, number>();
  private upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (request.url?.split('?')[0] !== '/api/v1/tracking/live') return;
    const origin = request.headers.origin;
    const allowed = this.config.get<string[]>('corsOrigins', []);
    // React Native may send the API's own origin, unlike browser clients.
    const sameOrigin =
      origin === `https://${request.headers.host}` || origin === `http://${request.headers.host}`;
    if ((origin && !sameOrigin && !allowed.includes(origin)) || this.sockets.clients.size >= 2048) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    this.sockets.handleUpgrade(request, socket, head, (client) => this.connect(client));
  };

  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly auth: SupabaseAuthGuard,
    private readonly tracking: TrackingService,
    private readonly events: TrackingEvents,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    this.server = this.adapter.httpAdapter?.getHttpServer() as Server | undefined;
    this.server?.on('upgrade', this.upgrade);
  }

  // Public for transport integration tests; the upgrade path enforces origin and connection limits.
  connect(socket: WebSocket): void {
    let subscription: Subscription | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let stale: ReturnType<typeof setTimeout> | undefined;
    let authenticated = false;
    let countedUser = '';
    let alive = true;
    let refreshing = false;
    let dirty = false;
    let userId = '';
    let bookingId = '';
    let gardener = false;
    let revision = 0;
    let lastPayload = '';
    let messageCount = 0;
    const deadline = setTimeout(() => socket.close(1008, 'Authentication required'), 15_000);
    const send = (value: unknown): void => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 256_000) {
        socket.close(1013, 'Slow connection');
        return;
      }
      socket.send(JSON.stringify(value));
    };
    const refresh = async (): Promise<void> => {
      dirty = true;
      if (refreshing || !authenticated) return;
      refreshing = true;
      try {
        while (dirty && socket.readyState === WebSocket.OPEN) {
          dirty = false;
          const data = await this.tracking.read(userId, bookingId, gardener);
          if (socket.readyState !== WebSocket.OPEN) return;
          // Coalesce changes received while the snapshot was being read.
          if (dirty) continue;
          const payload = JSON.stringify(data);
          if (payload !== lastPayload) {
            send({ type: 'snapshot', revision: ++revision, data });
            lastPayload = payload;
          }
          clearTimeout(stale);
          if (data.live && data.locationUpdatedAt) {
            stale = setTimeout(
              () => void refresh(),
              Math.max(1, 45_000 - (Date.now() - data.locationUpdatedAt.getTime())),
            );
          }
        }
      } catch (error) {
        socket.close(
          error instanceof HttpException && error.getStatus() === 403 ? 4003 : 1011,
          'Tracking unavailable',
        );
      } finally {
        refreshing = false;
      }
    };
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
      send({ type: 'heartbeat' });
      // Recheck authorization/status even if a relay event was lost.
      if (authenticated) void refresh();
    }, 20_000);
    socket.on('pong', () => {
      alive = true;
    });
    socket.on('error', () => socket.terminate());
    socket.once('close', () => {
      clearTimeout(deadline);
      clearTimeout(expiry);
      clearTimeout(stale);
      clearInterval(heartbeat);
      subscription?.unsubscribe();
      if (countedUser) {
        const count = (this.userConnections.get(countedUser) ?? 1) - 1;
        if (count > 0) this.userConnections.set(countedUser, count);
        else this.userConnections.delete(countedUser);
      }
    });
    socket.on('message', (raw, binary) => {
      if (++messageCount > 1) {
        socket.close(1008, 'Only one subscription is allowed');
        return;
      }
      void (async (): Promise<void> => {
        const buffer = Array.isArray(raw)
          ? Buffer.concat(raw)
          : Buffer.isBuffer(raw)
            ? raw
            : Buffer.from(raw);
        const message = JSON.parse(buffer.toString()) as Record<string, unknown>;
        if (
          binary ||
          message.type !== 'subscribe' ||
          typeof message.token !== 'string' ||
          typeof message.bookingId !== 'string' ||
          !isUUID(message.bookingId) ||
          typeof message.gardener !== 'boolean'
        ) {
          socket.close(1008, 'Invalid subscription');
          return;
        }
        const user = await this.auth.authenticate(message.token);
        if (socket.readyState !== WebSocket.OPEN) return;
        const count = this.userConnections.get(user.id) ?? 0;
        if (count >= 8) {
          socket.close(1013, 'Connection limit');
          return;
        }
        this.userConnections.set(user.id, count + 1);
        countedUser = user.id;
        userId = user.id;
        bookingId = message.bookingId;
        gardener = message.gardener;
        authenticated = true;
        clearTimeout(deadline);
        // Short sessions force token validation and refresh on reconnect. Never put tokens in URLs.
        let lifetime = 5 * 60_000;
        try {
          const claims = JSON.parse(
            Buffer.from(message.token.split('.')[1] ?? '', 'base64url').toString(),
          ) as { exp?: number };
          if (typeof claims.exp === 'number')
            lifetime = Math.min(lifetime, claims.exp * 1000 - Date.now());
        } catch {
          /* Opaque tokens still have the five-minute connection limit. */
        }
        if (lifetime <= 0) {
          socket.close(4001, 'Session expired');
          return;
        }
        expiry = setTimeout(() => socket.close(4001, 'Renew session'), lifetime);
        subscription = this.events.changes.subscribe((id) => {
          if (id === bookingId) void refresh();
        });
        await refresh();
      })().catch(() => socket.close(4001, 'Authentication failed'));
    });
  }

  onModuleDestroy(): void {
    this.server?.off('upgrade', this.upgrade);
    for (const client of this.sockets.clients) client.terminate();
    this.sockets.close();
  }
}

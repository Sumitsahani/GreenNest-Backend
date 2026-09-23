import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { Subject } from 'rxjs';

/** Only booking IDs cross the relay. Each recipient is authorized again before receiving data. */
@Injectable()
export class TrackingEvents implements OnModuleInit, OnModuleDestroy {
  readonly changes = new Subject<string>();
  private readonly logger = new Logger(TrackingEvents.name);
  private readonly instance = randomUUID();
  private publisher?: Redis;
  private subscriber?: Redis;
  private readonly channel = 'vanya:tracking:changed:v1';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('TRACKING_REDIS_URL');
    if (!url) return;
    const options = {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 5000,
    };
    this.publisher = new Redis(url, options);
    this.subscriber = new Redis(url, options);
    for (const client of [this.publisher, this.subscriber]) {
      client.on('error', () =>
        this.logger.warn('Tracking relay unavailable; local updates remain active.'),
      );
    }
    this.subscriber.on('message', (_channel: string, raw: string) => {
      try {
        const event = JSON.parse(raw) as { source?: string; id?: string };
        if (event.source !== this.instance && typeof event.id === 'string')
          this.changes.next(event.id);
      } catch {
        /* Ignore malformed relay messages. */
      }
    });
    try {
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      await this.subscriber.subscribe(this.channel);
    } catch {
      this.publisher.disconnect();
      this.subscriber.disconnect();
      throw new Error('Tracking relay startup failed. Check TRACKING_REDIS_URL and connectivity.');
    }
  }

  publish(id: string): void {
    this.changes.next(id);
    if (this.publisher) {
      void this.publisher
        .publish(this.channel, JSON.stringify({ id, source: this.instance }))
        .catch(() =>
          this.logger.warn(
            'Tracking relay publish failed; reconnect snapshots recover current state.',
          ),
        );
    }
  }

  onModuleDestroy(): void {
    this.publisher?.disconnect();
    this.subscriber?.disconnect();
    this.changes.complete();
  }
}

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  NotificationAgeGroup,
  NotificationTone,
  PlantEnvironment,
  PlantLifecycleStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ExpoPushService } from './expo-push.service';
import {
  NotificationCopyService,
  type WeatherNotificationFacts,
} from './notification-copy.service';

const checkIntervalMs = 15 * 60_000;
const alertCooldownMs = 8 * 60 * 60_000;
const outdoorPattern = /balcony|terrace|outdoor|garden|patio|roof|veranda/i;
const rainSensitivePattern = /cactus|succulent|aloe|jade|snake plant/i;

interface HourlyForecast {
  time: Array<string | number>;
  precipitation_probability: number[];
  precipitation: number[];
  weather_code: number[];
  wind_gusts_10m: number[];
}

interface ForecastResponse {
  hourly: HourlyForecast;
}

export interface HeavyRainRisk {
  eventStartsAt: Date;
  probability: number;
  precipitationMm: number;
  peakHourlyMm: number;
  windGustKmh: number;
  severity: 'HEAVY' | 'SEVERE';
}

interface AlertPlant {
  id: string;
  userId: string;
  name: string;
  species: string | null;
  category: string | null;
  location: string;
  environment: PlantEnvironment;
  weatherLocation: string | null;
  latitude: number | null;
  longitude: number | null;
  lastWateredAt: Date | null;
}

interface AlertLocationGroup {
  userId: string;
  location: string;
  latitude: number;
  longitude: number;
  plants: AlertPlant[];
}

export function evaluateThreeHourRain(
  hourly: HourlyForecast,
  now = new Date(),
): HeavyRainRisk | null {
  const slots = hourly.time
    .map((time, index) => ({
      time: new Date(typeof time === 'number' ? time * 1000 : time),
      index,
    }))
    .filter(({ time }) => time.getTime() >= now.getTime() - 30 * 60_000)
    .slice(0, 3);
  const firstSlot = slots[0];
  if (!firstSlot) return null;

  const values = slots.map(({ index }) => ({
    probability: hourly.precipitation_probability[index] ?? 0,
    precipitation: hourly.precipitation[index] ?? 0,
    weatherCode: hourly.weather_code[index] ?? 0,
    windGust: hourly.wind_gusts_10m[index] ?? 0,
  }));
  const probability = Math.max(...values.map((value) => value.probability));
  const precipitationMm = values.reduce((total, value) => total + value.precipitation, 0);
  const peakHourlyMm = Math.max(...values.map((value) => value.precipitation));
  const windGustKmh = Math.max(...values.map((value) => value.windGust));
  const thunderstorm = values.some((value) => value.weatherCode >= 95);
  const important =
    (probability >= 80 && (precipitationMm >= 8 || peakHourlyMm >= 4)) ||
    (thunderstorm && probability >= 60);
  if (!important) return null;

  return {
    eventStartsAt: firstSlot.time,
    probability,
    precipitationMm,
    peakHourlyMm,
    windGustKmh,
    severity: thunderstorm || precipitationMm >= 15 || peakHourlyMm >= 8 ? 'SEVERE' : 'HEAVY',
  };
}

@Injectable()
export class WeatherAlertDispatcherService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WeatherAlertDispatcherService.name);
  private timer?: ReturnType<typeof setInterval>;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: ExpoPushService,
    private readonly copy: NotificationCopyService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.dispatchImportantWeatherAlerts();
    this.timer = setInterval(() => void this.dispatchImportantWeatherAlerts(), checkIntervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatchImportantWeatherAlerts(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      await this.dispatchBatch();
    } catch (error) {
      this.logger.error(
        `Weather alert dispatch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.dispatching = false;
    }
  }

  private async dispatchBatch(): Promise<void> {
    const plants = await this.prisma.gardenPlant.findMany({
      where: {
        lifecycleStatus: {
          in: [PlantLifecycleStatus.ACTIVE, PlantLifecycleStatus.MOVED],
        },
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        userId: true,
        name: true,
        species: true,
        category: true,
        location: true,
        environment: true,
        weatherLocation: true,
        latitude: true,
        longitude: true,
        lastWateredAt: true,
      },
    });
    const devices = await this.prisma.pushDevice.findMany({
      where: {
        active: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        userId: true,
        locationLabel: true,
        latitude: true,
        longitude: true,
      },
    });
    const groups = this.groupAlertLocations(plants, devices);
    for (const group of groups.values()) await this.processLocation(group);
  }

  private groupAlertLocations(
    plants: AlertPlant[],
    devices: Array<{
      userId: string;
      locationLabel: string | null;
      latitude: number | null;
      longitude: number | null;
    }>,
  ): Map<string, AlertLocationGroup> {
    const groups = new Map<string, AlertLocationGroup>();
    for (const plant of plants) {
      if (
        plant.environment !== PlantEnvironment.OUTDOOR &&
        !outdoorPattern.test(plant.location) ||
        plant.latitude === null ||
        plant.longitude === null
      ) {
        continue;
      }
      const locationKey = `${plant.latitude.toFixed(2)},${plant.longitude.toFixed(2)}`;
      const key = `${plant.userId}:${locationKey}`;
      const existing = groups.get(key);
      groups.set(key, {
        userId: plant.userId,
        location: plant.weatherLocation ?? plant.location,
        latitude: plant.latitude,
        longitude: plant.longitude,
        plants: [...(existing?.plants ?? []), plant],
      });
    }
    for (const device of devices) {
      if (device.latitude === null || device.longitude === null) continue;
      const locationKey = `${device.latitude.toFixed(2)},${device.longitude.toFixed(2)}`;
      const key = `${device.userId}:${locationKey}`;
      if (!groups.has(key)) {
        groups.set(key, {
          userId: device.userId,
          location: device.locationLabel ?? 'your current area',
          latitude: device.latitude,
          longitude: device.longitude,
          plants: [],
        });
      }
    }
    return groups;
  }

  private async processLocation(group: AlertLocationGroup): Promise<void> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: group.userId },
    });
    if (settings && !settings.pushEnabled) return;

    const locationKey = `${group.latitude.toFixed(2)},${group.longitude.toFixed(2)}`;
    const recent = await this.prisma.weatherAlertDelivery.findFirst({
      where: {
        userId: group.userId,
        locationKey,
        sentAt: { gte: new Date(Date.now() - alertCooldownMs) },
      },
    });
    if (recent) return;

    const risk = await this.fetchThreeHourRisk(group.latitude, group.longitude);
    if (!risk) return;
    const eventKey = `${group.userId}:${locationKey}:${risk.eventStartsAt.toISOString()}`;
    const alreadySent = await this.prisma.weatherAlertDelivery.findUnique({
      where: { eventKey },
    });
    if (alreadySent) return;

    const facts = this.createFacts(group, risk);
    const content = await this.copy.weatherAlert(
      facts,
      settings?.notificationAgeGroup ?? NotificationAgeGroup.UNSPECIFIED,
      settings?.notificationTone ?? NotificationTone.AUTO,
    );
    const delivery = await this.push.sendToUser(group.userId, {
      ...content,
      url: group.plants.length ? '/(tabs)/garden' : '/(tabs)/home',
      data: { kind: 'IMPORTANT_WEATHER_ALERT', severity: risk.severity },
    });
    if (!delivery.delivered && delivery.deviceCount > 0) return;

    await this.prisma.$transaction([
      this.prisma.notification.create({
        data: {
          userId: group.userId,
          title: content.title,
          message: content.body,
          type: 'WEATHER_ALERT',
        },
      }),
      this.prisma.weatherAlertDelivery.create({
        data: {
          userId: group.userId,
          locationKey,
          eventKey,
          severity: risk.severity,
          forecastStartsAt: risk.eventStartsAt,
        },
      }),
    ]);
  }

  private async fetchThreeHourRisk(
    latitude: number,
    longitude: number,
  ): Promise<HeavyRainRisk | null> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      hourly: 'precipitation_probability,precipitation,weather_code,wind_gusts_10m',
      forecast_hours: '4',
      timeformat: 'unixtime',
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return evaluateThreeHourRain(((await response.json()) as ForecastResponse).hourly);
  }

  private createFacts(
    group: AlertLocationGroup,
    risk: HeavyRainRisk,
  ): WeatherNotificationFacts {
    const names = group.plants.slice(0, 2).map((plant) => plant.name);
    const recentlyWatered = group.plants.some(
      (plant) =>
        plant.lastWateredAt && plant.lastWateredAt.getTime() >= Date.now() - 2 * 86_400_000,
    );
    const rainSensitive = group.plants.some((plant) =>
      rainSensitivePattern.test(`${plant.name} ${plant.species ?? ''} ${plant.category ?? ''}`),
    );
    return {
      location: group.location,
      plantNames: names,
      probability: risk.probability,
      precipitationMm: risk.precipitationMm,
      windGustKmh: risk.windGustKmh,
      recentlyWatered: Boolean(recentlyWatered),
      rainSensitive,
    };
  }
}

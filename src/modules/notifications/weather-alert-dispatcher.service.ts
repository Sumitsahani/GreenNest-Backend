import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PlantLifecycleStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ExpoPushService } from './expo-push.service';

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
  weatherLocation: string | null;
  latitude: number | null;
  longitude: number | null;
  lastWateredAt: Date | null;
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
        weatherLocation: true,
        latitude: true,
        longitude: true,
        lastWateredAt: true,
      },
    });
    const groups = this.groupOutdoorPlants(plants);
    for (const group of groups.values()) await this.processLocation(group);
  }

  private groupOutdoorPlants(plants: AlertPlant[]): Map<string, AlertPlant[]> {
    const groups = new Map<string, AlertPlant[]>();
    for (const plant of plants) {
      if (
        !outdoorPattern.test(plant.location) ||
        plant.latitude === null ||
        plant.longitude === null
      ) {
        continue;
      }
      const locationKey = `${plant.latitude.toFixed(2)},${plant.longitude.toFixed(2)}`;
      const key = `${plant.userId}:${locationKey}`;
      groups.set(key, [...(groups.get(key) ?? []), plant]);
    }
    return groups;
  }

  private async processLocation(plants: AlertPlant[]): Promise<void> {
    const first = plants[0];
    if (!first || first.latitude === null || first.longitude === null) return;
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: first.userId },
    });
    if (settings && (!settings.pushEnabled || !settings.careReminders)) return;

    const locationKey = `${first.latitude.toFixed(2)},${first.longitude.toFixed(2)}`;
    const recent = await this.prisma.weatherAlertDelivery.findFirst({
      where: {
        userId: first.userId,
        locationKey,
        sentAt: { gte: new Date(Date.now() - alertCooldownMs) },
      },
    });
    if (recent) return;

    const risk = await this.fetchThreeHourRisk(first.latitude, first.longitude);
    if (!risk) return;
    const eventKey = `${first.userId}:${locationKey}:${risk.eventStartsAt.toISOString()}`;
    const alreadySent = await this.prisma.weatherAlertDelivery.findUnique({
      where: { eventKey },
    });
    if (alreadySent) return;

    const content = this.createContent(plants, risk);
    const delivery = await this.push.sendToUser(first.userId, {
      ...content,
      url: '/(tabs)/garden',
      data: { kind: 'IMPORTANT_WEATHER_ALERT', severity: risk.severity },
    });
    if (!delivery.delivered && delivery.deviceCount > 0) return;

    await this.prisma.$transaction([
      this.prisma.notification.create({
        data: {
          userId: first.userId,
          title: content.title,
          message: content.body,
          type: 'WEATHER_ALERT',
        },
      }),
      this.prisma.weatherAlertDelivery.create({
        data: {
          userId: first.userId,
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

  private createContent(
    plants: AlertPlant[],
    risk: HeavyRainRisk,
  ): { title: string; body: string } {
    const location = plants[0]?.weatherLocation ?? plants[0]?.location ?? 'your garden';
    const names = plants
      .slice(0, 2)
      .map((plant) => plant.name)
      .join(' & ');
    const recentlyWatered = plants.some(
      (plant) =>
        plant.lastWateredAt && plant.lastWateredAt.getTime() >= Date.now() - 2 * 86_400_000,
    );
    const rainSensitive = plants.some((plant) =>
      rainSensitivePattern.test(`${plant.name} ${plant.species ?? ''} ${plant.category ?? ''}`),
    );
    const protection =
      recentlyWatered || rainSensitive
        ? `${names} ko rain party se break do—ye pehle hi hydrated hain.`
        : `${names} ke pots ko cover ke neeche rakho aur drainage check kar lo.`;
    const wind = risk.windGustKmh >= 40 ? ' Hawa tez hogi, pots ko secure bhi kar dena.' : '';
    return {
      title: '⛈️ Important: next 3 hours heavy rain',
      body: `${location} me ${risk.probability}% chance aur lagbhag ${Math.round(risk.precipitationMm)} mm rain forecast hai. ${protection}${wind}`,
    };
  }
}

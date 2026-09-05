import { Injectable } from '@nestjs/common';

export type SmartWateringStatus =
  'CHECK_NOW' | 'CHECK_EARLIER' | 'DELAY_WATERING' | 'ON_SCHEDULE' | 'LOCATION_NEEDED';

export interface PlantWeatherInput {
  id: string;
  name: string;
  location: string;
  weatherLocation: string | null;
  latitude: number | null;
  longitude: number | null;
  wateringDays: number;
  lastWateredAt: Date | null;
  nextWateringAt: Date;
  reminder?: { id: string; enabled: boolean } | null;
}

export interface ResolvedWeatherLocation {
  label: string;
  latitude: number;
  longitude: number;
}

export interface WeatherSnapshot {
  temperature: number;
  humidity: number;
  weatherCode: number;
  condition: string;
  maxTemperature: number;
  precipitationSum: number;
  precipitationProbability: number;
}

export interface SmartCareReminder {
  id: string;
  plantId: string;
  plantName: string;
  placement: string;
  weatherLocation: string | null;
  type: 'WATER';
  enabled: boolean;
  virtual: boolean;
  lastWateredAt: Date | null;
  baseScheduledAt: Date;
  scheduledAt: Date;
  adjustmentDays: number;
  status: SmartWateringStatus;
  title: string;
  reason: string;
  signals: string[];
  weather: WeatherSnapshot | null;
}

interface OpenMeteoForecast {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
  };
  daily: {
    temperature_2m_max: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
  };
}

interface OpenMeteoGeocoding {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    admin1?: string;
    country?: string;
  }>;
}

@Injectable()
export class WeatherCareService {
  private readonly forecastCache = new Map<string, { expiresAt: number; value: WeatherSnapshot }>();

  async resolveLocation(input: {
    label?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<ResolvedWeatherLocation | null> {
    const label = input.label?.trim();
    if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
      return {
        label: label || `${input.latitude.toFixed(4)}, ${input.longitude.toFixed(4)}`,
        latitude: input.latitude,
        longitude: input.longitude,
      };
    }
    if (!label) return null;
    try {
      const params = new URLSearchParams({ name: label, count: '1', language: 'en' });
      const response = await this.fetchWithTimeout(
        `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
      );
      if (!response.ok) return null;
      const result = ((await response.json()) as OpenMeteoGeocoding).results?.[0];
      if (!result) return null;
      return {
        label: [result.name, result.admin1, result.country]
          .filter((part, index, all): part is string =>
            Boolean(part && all.indexOf(part) === index),
          )
          .join(', '),
        latitude: result.latitude,
        longitude: result.longitude,
      };
    } catch {
      return null;
    }
  }

  async createReminder(input: PlantWeatherInput): Promise<SmartCareReminder> {
    if (input.latitude === null || input.longitude === null) {
      return this.evaluate(input, null, true);
    }
    try {
      const weather = await this.getForecast(input.latitude, input.longitude);
      return this.evaluate(input, weather, false);
    } catch {
      return this.evaluate(input, null, false);
    }
  }

  evaluate(
    input: PlantWeatherInput,
    weather: WeatherSnapshot | null,
    locationMissing = false,
    now = new Date(),
  ): SmartCareReminder {
    const base = input.lastWateredAt
      ? new Date(input.lastWateredAt.getTime() + input.wateringDays * 86_400_000)
      : new Date(input.nextWateringAt);
    const daysUntilBase = (base.getTime() - now.getTime()) / 86_400_000;
    const outdoor = /balcony|terrace|outdoor|garden|patio|roof|veranda/i.test(input.location);
    let adjustmentDays = 0;
    const signals = ['watering_interval', 'last_watered'];
    let weatherReason = '';

    if (weather && daysUntilBase <= 7) {
      const hotAndDry = weather.maxTemperature >= 34 && weather.humidity <= 55;
      const veryHumid = weather.humidity >= 82;
      const meaningfulRain =
        weather.precipitationSum >= 5 || weather.precipitationProbability >= 70;
      if (hotAndDry) {
        adjustmentDays = -Math.min(2, Math.max(1, Math.round(input.wateringDays * 0.2)));
        weatherReason = `${Math.round(weather.maxTemperature)}°C heat and ${Math.round(weather.humidity)}% humidity can dry the pot faster.`;
        signals.push('high_temperature', 'low_humidity');
      } else if (outdoor && meaningfulRain) {
        adjustmentDays = 2;
        weatherReason = `${weather.precipitationSum.toFixed(1)} mm rain is forecast near this outdoor plant, so the soil may stay wet longer.`;
        signals.push('outdoor_placement', 'rain_forecast');
      } else if (veryHumid || (meaningfulRain && weather.humidity >= 72)) {
        adjustmentDays = veryHumid ? 2 : 1;
        weatherReason = `${Math.round(weather.humidity)}% humidity can slow soil drying${outdoor ? '' : ' even though this plant is sheltered indoors'}.`;
        signals.push('high_humidity');
      }
    }

    const scheduledAt = new Date(base);
    scheduledAt.setDate(scheduledAt.getDate() + adjustmentDays);
    const dueNow = scheduledAt <= now;
    let status: SmartWateringStatus = 'ON_SCHEDULE';
    let title = `Check soil on ${scheduledAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    if (locationMissing) {
      status = 'LOCATION_NEEDED';
      title = `Scheduled soil check: ${base.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    } else if (dueNow) {
      status = 'CHECK_NOW';
      title = 'Check the soil today';
    } else if (adjustmentDays < 0) {
      status = 'CHECK_EARLIER';
      title = `Check soil earlier: ${scheduledAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    } else if (adjustmentDays > 0) {
      status = 'DELAY_WATERING';
      title = `Delay soil check to ${scheduledAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    }

    const fallbackReason = locationMissing
      ? 'Add this plant’s city or coordinates to enable weather-aware timing. The normal watering interval is being used.'
      : weather
        ? 'Local weather does not currently justify changing the normal interval.'
        : 'Weather is temporarily unavailable, so the normal watering interval is being used.';
    const timingReason = dueNow
      ? 'The adjusted care date is due. Check the topsoil and water only if it feels dry.'
      : 'This is a soil-check date, not an instruction to water blindly.';

    return {
      id: input.reminder?.id ?? `smart-${input.id}`,
      plantId: input.id,
      plantName: input.name,
      placement: input.location,
      weatherLocation: input.weatherLocation,
      type: 'WATER',
      enabled: input.reminder?.enabled ?? true,
      virtual: !input.reminder,
      lastWateredAt: input.lastWateredAt,
      baseScheduledAt: base,
      scheduledAt,
      adjustmentDays,
      status,
      title,
      reason: `${weatherReason || fallbackReason} ${timingReason}`,
      signals,
      weather,
    };
  }

  private async getForecast(latitude: number, longitude: number): Promise<WeatherSnapshot> {
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const cached = this.forecastCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,relative_humidity_2m,weather_code',
      daily: 'temperature_2m_max,precipitation_sum,precipitation_probability_max',
      forecast_days: '7',
      timezone: 'auto',
    });
    const response = await this.fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
    );
    if (!response.ok) throw new Error('Weather provider unavailable');
    const data = (await response.json()) as OpenMeteoForecast;
    const firstThree = (values: number[]): number[] => values.slice(0, 3);
    const value: WeatherSnapshot = {
      temperature: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      weatherCode: data.current.weather_code,
      condition: this.describeWeather(data.current.weather_code),
      maxTemperature: Math.max(...firstThree(data.daily.temperature_2m_max)),
      precipitationSum: firstThree(data.daily.precipitation_sum).reduce(
        (total, amount) => total + amount,
        0,
      ),
      precipitationProbability: Math.max(...firstThree(data.daily.precipitation_probability_max)),
    };
    this.forecastCache.set(key, { expiresAt: Date.now() + 15 * 60_000, value });
    return value;
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private describeWeather(code: number): string {
    if (code === 0) return 'Clear';
    if (code <= 3) return 'Partly cloudy';
    if (code <= 48) return 'Misty';
    if (code <= 67) return 'Rain or drizzle';
    if (code <= 82) return 'Rain showers';
    if (code <= 86) return 'Snow showers';
    return 'Thunderstorms';
  }
}

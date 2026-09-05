import {
  WeatherCareService,
  type PlantWeatherInput,
  type WeatherSnapshot,
} from './weather-care.service';

describe('WeatherCareService', () => {
  const service = new WeatherCareService();
  const now = new Date('2026-09-05T06:00:00.000Z');
  const plant = (overrides: Partial<PlantWeatherInput> = {}): PlantWeatherInput => ({
    id: 'plant-1',
    name: 'Rose',
    location: 'Balcony',
    weatherLocation: 'Delhi, India',
    latitude: 28.6139,
    longitude: 77.209,
    wateringDays: 10,
    lastWateredAt: new Date('2026-08-28T06:00:00.000Z'),
    nextWateringAt: new Date('2026-09-07T06:00:00.000Z'),
    reminder: { id: 'reminder-1', enabled: true },
    ...overrides,
  });
  const weather = (overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot => ({
    temperature: 33,
    humidity: 48,
    weatherCode: 1,
    condition: 'Partly cloudy',
    maxTemperature: 36,
    precipitationSum: 0,
    precipitationProbability: 5,
    ...overrides,
  });

  it('moves a soil check earlier for hot and dry weather', () => {
    const result = service.evaluate(plant(), weather(), false, now);

    expect(result.status).toBe('CHECK_NOW');
    expect(result.adjustmentDays).toBe(-2);
    expect(result.scheduledAt).toEqual(new Date('2026-09-05T06:00:00.000Z'));
    expect(result.reason).toContain('dry the pot faster');
    expect(result.signals).toEqual(
      expect.arrayContaining(['last_watered', 'high_temperature', 'low_humidity']),
    );
  });

  it('delays an outdoor reminder when meaningful rain is forecast', () => {
    const result = service.evaluate(
      plant({ weatherLocation: 'Panaji, Goa, India' }),
      weather({
        humidity: 76,
        maxTemperature: 29,
        precipitationSum: 18,
        precipitationProbability: 90,
      }),
      false,
      now,
    );

    expect(result.status).toBe('DELAY_WATERING');
    expect(result.adjustmentDays).toBe(2);
    expect(result.scheduledAt).toEqual(new Date('2026-09-09T06:00:00.000Z'));
    expect(result.reason).toContain('outdoor plant');
  });

  it('does not claim rain directly watered an indoor plant', () => {
    const result = service.evaluate(
      plant({ location: 'Living Room' }),
      weather({
        humidity: 78,
        maxTemperature: 28,
        precipitationSum: 12,
        precipitationProbability: 85,
      }),
      false,
      now,
    );

    expect(result.adjustmentDays).toBe(1);
    expect(result.reason).toContain('sheltered indoors');
    expect(result.reason).not.toContain('rain may water');
  });

  it('falls back to the last-watered interval when location is missing', () => {
    const result = service.evaluate(
      plant({ weatherLocation: null, latitude: null, longitude: null }),
      null,
      true,
      now,
    );

    expect(result.status).toBe('LOCATION_NEEDED');
    expect(result.baseScheduledAt).toEqual(new Date('2026-09-07T06:00:00.000Z'));
    expect(result.reason).toContain('normal watering interval');
  });
});

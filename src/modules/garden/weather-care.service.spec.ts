import {
  WeatherCareService,
  type PlantWeatherInput,
  type WeatherSnapshot,
} from './weather-care.service';

describe('WeatherCareService', () => {
  afterEach(() => jest.restoreAllMocks());

  const forecast = {
    current: { temperature_2m: 30, relative_humidity_2m: 65, weather_code: 1 },
    daily: {
      temperature_2m_max: [32],
      precipitation_sum: [0],
      precipitation_probability_max: [10],
    },
  };
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

  it('honors wet-soil snooze despite hot weather and an older watering date', () => {
    const until = new Date('2026-09-08T12:00:00Z');
    const result = service.evaluate(
      plant({
        reminder: { id: 'r', enabled: true, snoozedUntil: until, responseReason: 'SOIL_WET' },
      }),
      weather(),
      false,
      now,
    );
    expect(result.scheduledAt).toEqual(until);
    expect(result.reason).toContain('You reported wet soil');
    expect(result.signals).toContain('user_requested_timing');
  });

  it('shares concurrent forecasts for plants in the same location', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(forecast),
    } as Response);
    const subject = new WeatherCareService();
    const results = await Promise.all([
      subject.createReminder(plant()),
      subject.createReminder(plant()),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.weather?.temperature === 30)).toBe(true);
    await subject.createReminder(plant());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recovers from a temporary network failure', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network disconnected'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(forecast) } as Response);
    const result = await new WeatherCareService().createReminder(plant());
    expect(result.weather?.temperature).toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves the saved city for older plants without coordinates', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [{ name: 'Delhi', latitude: 28.61, longitude: 77.2 }] }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(forecast) } as Response);
    const result = await new WeatherCareService().createReminder(
      plant({ latitude: null, longitude: null }),
    );
    expect(result.weather?.temperature).toBe(30);
    expect(result.status).not.toBe('LOCATION_NEEDED');
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

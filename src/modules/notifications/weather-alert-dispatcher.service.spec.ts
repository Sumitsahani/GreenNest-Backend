import { evaluateThreeHourRain } from './weather-alert-dispatcher.service';

const now = new Date('2026-09-05T09:00:00.000Z');

describe('evaluateThreeHourRain', () => {
  it('creates an alert only for high-confidence heavy rain', () => {
    const result = evaluateThreeHourRain(
      {
        time: ['2026-09-05T09:00:00.000Z', '2026-09-05T10:00:00.000Z', '2026-09-05T11:00:00.000Z'],
        precipitation_probability: [82, 91, 88],
        precipitation: [2, 4.5, 3],
        weather_code: [63, 65, 65],
        wind_gusts_10m: [22, 35, 31],
      },
      now,
    );

    expect(result).toEqual(
      expect.objectContaining({
        probability: 91,
        precipitationMm: 9.5,
        severity: 'HEAVY',
      }),
    );
  });

  it('ignores likely light rain to avoid notification spam', () => {
    const result = evaluateThreeHourRain(
      {
        time: ['2026-09-05T09:00:00.000Z', '2026-09-05T10:00:00.000Z', '2026-09-05T11:00:00.000Z'],
        precipitation_probability: [85, 90, 82],
        precipitation: [0.2, 0.4, 0.1],
        weather_code: [51, 51, 53],
        wind_gusts_10m: [12, 15, 13],
      },
      now,
    );

    expect(result).toBeNull();
  });
});

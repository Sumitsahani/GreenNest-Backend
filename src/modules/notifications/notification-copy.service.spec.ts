import { NotificationAgeGroup, NotificationTone } from '@prisma/client';
import {
  buildFallbackWeatherNotification,
  isSafeNotificationContent,
  resolveNotificationTone,
  type WeatherNotificationFacts,
} from './notification-copy.service';

const facts: WeatherNotificationFacts = {
  location: 'Gurugram',
  plantNames: ['Tulsi'],
  probability: 91,
  precipitationMm: 9.5,
  windGustKmh: 35,
  recentlyWatered: false,
  rainSensitive: false,
};

describe('NotificationCopyService safety', () => {
  it('uses a playful tone for ages 18-35 when preference is automatic', () => {
    const tone = resolveNotificationTone(NotificationAgeGroup.AGE_18_35, NotificationTone.AUTO);
    const content = buildFallbackWeatherNotification(facts, tone);

    expect(tone).toBe(NotificationTone.PLAYFUL);
    expect(content.title).toContain('plant fam');
    expect(isSafeNotificationContent(content, facts)).toBe(true);
  });

  it('uses a calm tone for ages 36+ when preference is automatic', () => {
    expect(resolveNotificationTone(NotificationAgeGroup.AGE_36_PLUS, NotificationTone.AUTO)).toBe(
      NotificationTone.CALM,
    );
  });

  it('rejects unsafe AI wording so the deterministic fallback is used', () => {
    expect(
      isSafeNotificationContent(
        {
          title: 'Dating weather',
          body: 'Gurugram has 91% chance and around 10 mm rain.',
        },
        facts,
      ),
    ).toBe(false);
  });
});

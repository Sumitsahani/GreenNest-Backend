import { AiMemoryType } from '@prisma/client';
import { MemoryExtractorService } from './memory-extractor.service';

describe('MemoryExtractorService', () => {
  const extractor = new MemoryExtractorService();

  it('extracts only explicit, stable gardening context', () => {
    const memories = extractor.extract(
      'I am a beginner gardener. I live in an apartment and I have a balcony that gets 4 hours of sunlight. I prefer low-maintenance plants.',
    );

    expect(memories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'gardening_experience', value: 'beginner', type: AiMemoryType.EXPERIENCE }),
        expect.objectContaining({ key: 'home_type', value: 'apartment', type: AiMemoryType.ENVIRONMENT }),
        expect.objectContaining({ key: 'growing_space', value: 'balcony', type: AiMemoryType.ENVIRONMENT }),
        expect.objectContaining({ key: 'daily_sunlight_hours', value: '4', type: AiMemoryType.ENVIRONMENT }),
        expect.objectContaining({ key: 'care_preference', value: 'low-maintenance plants', type: AiMemoryType.CARE_PREFERENCE }),
      ]),
    );
  });

  it('skips trivial messages and sensitive account information', () => {
    expect(extractor.extract('Thanks!')).toEqual([]);
    expect(extractor.extract('My password is secret123 and my card is 4111111111111111.')).toEqual([]);
  });

  it('turns an explicit forget request into a delete operation', () => {
    expect(extractor.extract('Please forget my plant preference.')).toContainEqual(
      expect.objectContaining({ key: 'plant_preference', operation: 'delete' }),
    );
  });

  it('extracts a relevant gardening goal', () => {
    expect(extractor.extract('My goal is to grow herbs on my balcony.')).toContainEqual(
      expect.objectContaining({ key: 'gardening_goal', type: AiMemoryType.GOAL }),
    );
  });

  it('stores explicit plant corrections at plant scope with strong evidence', () => {
    expect(
      extractor.extract('The soil stays wet for 9 days in this pot.', 'plant-a'),
    ).toContainEqual(
      expect.objectContaining({
        key: 'soil_drying_days',
        value: '9 days',
        type: AiMemoryType.USER_CORRECTION,
        plantId: 'plant-a',
        confidence: 0.98,
      }),
    );
  });

  it('does not attach plant observations without an explicit plant context', () => {
    expect(extractor.extract('The soil stays wet for 9 days in this pot.')).toEqual([]);
  });
});

import { QuestionUnderstandingService } from './question-understanding.service';

describe('QuestionUnderstandingService', () => {
  const service = new QuestionUnderstandingService();

  it.each([
    ['Should I give paani today?', 'WATERING'],
    ['Is dhoop near the window enough?', 'LIGHT'],
    ['What happened last time with this plant?', 'PLANT_HISTORY'],
    ['Leaves are yellow and drooping', 'PLANT_HEALTH'],
    ['Kaunsa paudha is this?', 'PLANT_IDENTIFICATION'],
  ])('classifies %s', (question, intent) => {
    expect(service.classify(question)).toBe(intent);
  });
});

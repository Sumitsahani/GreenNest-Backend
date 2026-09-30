import { AiResponseService } from './ai-response.service';
import type { Consultation } from './consultation';
const state: Consultation = {
  stage: 'INVESTIGATING',
  focus: 'WATERING_DRAINAGE',
  confidence: 'LOW',
  opening: 'Let us check the cause first.',
  questions: ['How long has yellowing continued?', 'Does the soil stay wet between waterings?'],
  photoRequests: [],
  knownFacts: [],
  symptoms: ['Yellow leaves'],
  suspectedCause: '',
  evidence: [],
  alternatives: [],
  missingEvidence: ['Soil moisture'],
  confirmation: [],
  treatment: [],
  avoid: [],
  monitoring: [],
  followUp: '',
  userActions: [],
  expectedResponse: '',
  outcome: '',
  homeRemedy: '',
};
const response = (value: unknown): Response =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }),
  );
const context = {
  garden: [],
  memories: [],
  intent: 'PLANT_HEALTH' as const,
  plantId: 'p',
  sourcesUsed: [],
  promptContext: 'Pothos; daily watering was reported.',
};
describe('Structured doctor responses', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test';
    delete process.env.GEMINI_FALLBACK_API_KEY;
  });
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });
  it('requests structured evidence and passes prior answers without dropping the consultation', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        response({
          ...state,
          questions: ['Does the pot have drainage holes?', 'Does water run out from the bottom?'],
          knownFacts: [{ key: 'soil_condition', value: 'Four days', source: 'USER' }],
        }),
      );
    const result = await new AiResponseService().consult(
      'Soil stays wet four days',
      context,
      undefined,
      [],
      'ENGLISH',
      state,
    );
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string) as {
      generationConfig: { responseMimeType: string };
      contents: { parts: { text: string }[] }[];
    };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents.at(-1)!.parts[0]!.text).toContain('PRIOR CONSULTATION');
    expect(result.reply).toContain('Does the pot have drainage holes');
    expect(result.consultation?.stage).toBe('INVESTIGATING');
  });
  it('keeps the conversation language for short numeric answers', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(response(state));
    await new AiResponseService().consult(
      '3-4 days',
      context,
      undefined,
      [{ role: 'USER', content: 'Mere patte peele ho rahe hain' }],
      'AUTO',
      state,
    );
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string) as {
      systemInstruction: { parts: { text: string }[] };
    };
    expect(body.systemInstruction.parts[0]!.text).toContain('Roman-script Hinglish');
  });
  it('repairs a premature treatment instead of sending it to the user', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ ...state, treatment: ['Use neem oil'] }))
      .mockResolvedValueOnce(response(state));
    const result = await new AiResponseService().consult('Yellow leaves', context);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.reply).not.toContain('neem');
  });
  it('fails explicitly when both responses violate the evidence policy', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response({ ...state, suspectedCause: 'Root rot' }));
    await expect(new AiResponseService().consult('Yellow leaves', context)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});

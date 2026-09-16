import { ErrorCode } from '../../common/constants/error-code';
import { AiResponseService } from './ai-response.service';
import { plantDoctorPrompt } from './plant-doctor-prompt';

interface ChatRequest {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ parts: Array<{ text: string }> }>;
}

describe('Plant Doctor chat', () => {
  const context = {
    garden: [],
    memories: [],
    intent: 'OTHER' as const,
    plantId: 'plant-a',
    sourcesUsed: ['current_plant_state'],
    promptContext:
      'Money Plant A: wet soil, watered yesterday; previous yellowing improved after less watering.',
  };
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_FALLBACK_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('sends the complete policy, plant evidence, conversation and explicit language preference', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Check soil before watering.' }] } }],
        }),
      ),
    );
    await new AiResponseService().generate(
      'Actually balcony mein hai.',
      context,
      undefined,
      [
        { role: 'USER', content: 'The plant was indoors.' },
        { role: 'ASSISTANT', content: 'Check its light.' },
      ],
      'ENGLISH',
    );
    const body = JSON.parse(mock.mock.calls[0]![1]!.body as string) as ChatRequest;
    const instruction = body.systemInstruction.parts[0]?.text;
    expect(instruction).toContain(plantDoctorPrompt);
    expect(instruction).toContain('Reply only in natural English');
    expect(instruction).toContain('configured response language takes priority');
    expect(instruction).not.toContain('Always follow the CURRENT QUESTION language');
    expect(body.contents[0]?.parts[0]?.text).toBe('The plant was indoors.');
    expect(body.contents[2]?.parts[0]?.text).toContain(context.promptContext);
    expect(body.contents[2]?.parts[0]?.text).toContain('Actually balcony mein hai.');
  });

  it.each([429, 503])(
    'returns a retryable error instead of canned care advice after HTTP %s',
    async (status) => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status }));
      await expect(
        new AiResponseService().generate('Should I water this plant?', context),
      ).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
    },
  );

  it('does not manufacture advice when no AI credential is configured', async () => {
    delete process.env.GEMINI_API_KEY;
    const mock = jest.spyOn(global, 'fetch');
    await expect(new AiResponseService().generate('Yellow leaves?', context)).rejects.toMatchObject(
      { code: ErrorCode.SERVICE_UNAVAILABLE },
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('tries the fallback credential using the same policy', async () => {
    process.env.GEMINI_FALLBACK_API_KEY = 'fallback-test-key';
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Do not water wet soil.' }] } }],
          }),
        ),
      );
    await expect(new AiResponseService().generate('Water now?', context)).resolves.toBe(
      'Do not water wet soil.',
    );
    expect(mock).toHaveBeenCalledTimes(2);
    expect(
      (JSON.parse(mock.mock.calls[1]![1]!.body as string) as ChatRequest).systemInstruction.parts[0]?.text,
    ).toContain(plantDoctorPrompt);
  });
});

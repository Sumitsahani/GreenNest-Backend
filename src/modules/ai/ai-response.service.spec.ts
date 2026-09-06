import { ErrorCode } from '../../common/constants/error-code';
import { AiResponseService, detectResponseLanguage } from './ai-response.service';

describe('detectResponseLanguage', () => {
  it.each([
    ['Why are my plant leaves turning yellow?', 'ENGLISH'],
    ['Mere plant ke leaves yellow kyu ho rahe hain?', 'HINGLISH'],
    ['मेरे पौधे की पत्तियाँ पीली क्यों हो रही हैं?', 'HINDI'],
  ] as const)('maps %s to %s', (question, language) => {
    expect(detectResponseLanguage(question)).toBe(language);
  });
});

describe('AiResponseService friendly conversation', () => {
  it('responds to a greeting as Plant Buddy without forcing garden diagnostics', async () => {
    const response = await new AiResponseService().generate('Hello, how are you?', {
      garden: [],
      memories: [],
      intent: 'OTHER',
      plantId: null,
      sourcesUsed: [],
      promptContext: 'No garden context is needed for this greeting.',
    });

    expect(response).toContain('Plant Buddy');
    expect(response).not.toContain('saved garden plant');
  });
});

describe('AiResponseService plant identification', () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalUrl = process.env.SUPABASE_URL;
  const originalGeminiModels = process.env.GEMINI_IDENTIFICATION_MODELS;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalOpenAiModels = process.env.OPENAI_VISION_MODELS;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key-that-is-long-enough';
    process.env.GEMINI_IDENTIFICATION_MODELS = 'gemini-first,gemini-second';
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_VISION_MODELS;
    process.env.SUPABASE_URL = 'https://project.supabase.co';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalGeminiModels === undefined) delete process.env.GEMINI_IDENTIFICATION_MODELS;
    else process.env.GEMINI_IDENTIFICATION_MODELS = originalGeminiModels;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalOpenAiModels === undefined) delete process.env.OPENAI_VISION_MODELS;
    else process.env.OPENAI_VISION_MODELS = originalOpenAiModels;
  });

  it('accepts a stored image and parses fenced Gemini JSON safely', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: '```json\n{"containsRealPlant":true,"imageCategory":"LIVE_PLANT","classificationConfidence":0.98,"rejectionReason":"","name":"Jade Plant","species":"Crassula ovata","confidence":0.95,"suggestedLocation":"Sunny window","notes":"Let soil dry."}\n```',
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const result = await new AiResponseService().identifyPlant(
      'https://project.supabase.co/storage/v1/object/public/user-photos/user/plants/photo.jpg',
    );

    expect(result).toEqual(
      expect.objectContaining({
        containsRealPlant: true,
        imageCategory: 'LIVE_PLANT',
        name: 'Jade Plant',
        species: 'Crassula ovata',
        confidence: 0.95,
      }),
    );
  });

  it('rejects a book or poster instead of hallucinating a plant identity', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        containsRealPlant: false,
                        imageCategory: 'BOOK_OR_DOCUMENT',
                        classificationConfidence: 0.99,
                        rejectionReason:
                          'This is a photograph of a plant-care book, not a living plant.',
                        name: 'Money Plant',
                        species: 'Epipremnum aureum',
                        confidence: 0.9,
                        suggestedLocation: '',
                        notes: '',
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const result = await new AiResponseService().identifyPlant(
      'https://project.supabase.co/storage/v1/object/public/user-photos/user/plants/book.jpg',
    );

    expect(result).toEqual(
      expect.objectContaining({
        containsRealPlant: false,
        imageCategory: 'BOOK_OR_DOCUMENT',
        name: 'Unknown plant',
        species: 'Unknown',
        confidence: 0.29,
      }),
    );
  });

  it('returns an actionable service-busy error for Gemini rate limits', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 429 }));

    await expect(
      new AiResponseService().identifyPlant(
        'https://project.supabase.co/storage/v1/object/public/user-photos/user/plants/photo.jpg',
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'Plant recognition is busy right now. Please wait a moment and try again.',
    });
  });

  it('uses OpenAI after every configured Gemini model is unavailable', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key-that-is-long-enough';
    process.env.OPENAI_VISION_MODELS = 'gpt-vision-fallback';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              containsRealPlant: true,
              imageCategory: 'LIVE_PLANT',
              classificationConfidence: 0.96,
              rejectionReason: null,
              name: 'Snake Plant',
              species: 'Dracaena trifasciata',
              confidence: 0.93,
              suggestedLocation: 'Bright indirect light',
              notes: 'Allow the soil to dry between watering.',
            }),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const result = await new AiResponseService().identifyPlant(
      'https://project.supabase.co/storage/v1/object/public/user-photos/user/plants/snake.jpg',
    );

    expect(result).toEqual(
      expect.objectContaining({
        containsRealPlant: true,
        name: 'Snake Plant',
        species: 'Dracaena trifasciata',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]?.[0]).toBe('https://api.openai.com/v1/responses');
  });
});

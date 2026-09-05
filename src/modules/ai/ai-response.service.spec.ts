import { ErrorCode } from '../../common/constants/error-code';
import { AiResponseService } from './ai-response.service';

describe('AiResponseService plant identification', () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalUrl = process.env.SUPABASE_URL;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key-that-is-long-enough';
    process.env.SUPABASE_URL = 'https://project.supabase.co';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
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
                      text: '```json\n{"name":"Jade Plant","species":"Crassula ovata","confidence":0.95,"suggestedLocation":"Sunny window","notes":"Let soil dry."}\n```',
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
        name: 'Jade Plant',
        species: 'Crassula ovata',
        confidence: 0.95,
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
      .mockResolvedValueOnce(new Response('{}', { status: 429 }));

    await expect(
      new AiResponseService().identifyPlant(
        'https://project.supabase.co/storage/v1/object/public/user-photos/user/plants/photo.jpg',
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message:
        'Plant recognition is busy right now. Please wait a moment and try again.',
    });
  });
});

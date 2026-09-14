import { DesignImageProvider, readGeneratedImage } from './design-image-provider';
import type { DesignScene } from './design-scene';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const response = {
  status: 'completed',
  steps: [
    { type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: png }] },
  ],
};
describe('Design image provider', () => {
  const originalKey = process.env.GEMINI_IMAGE_API_KEY;
  beforeEach(() => {
    process.env.GEMINI_IMAGE_API_KEY = 'test-only-image-key';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.GEMINI_IMAGE_API_KEY;
    else process.env.GEMINI_IMAGE_API_KEY = originalKey;
  });
  it('accepts an actual image block and rejects text-only or corrupt output', () => {
    expect(readGeneratedImage(response)).toEqual({ data: png, mime_type: 'image/png' });
    expect(() =>
      readGeneratedImage({
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'done' }] }],
      }),
    ).toThrow('could not be created');
    expect(() =>
      readGeneratedImage({
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'image', mime_type: 'image/png', data: 'bm90LWFuLWltYWdl' }],
          },
        ],
      }),
    ).toThrow('could not be saved');
  });
  it('sends the original photo and structured plant placement without provider-side conversation storage', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const scene = {
      style: 'MINIMAL',
      plants: [
        {
          number: 1,
          name: 'Pothos',
          species: 'Epipremnum aureum',
          boundingBox: [0.1, 0.2, 0.3, 0.4],
          image: null,
          pot: { color: '#fff' },
        },
      ],
    } as unknown as DesignScene;
    await new DesignImageProvider().generate({ data: png, mime_type: 'image/png' }, scene);
    const args = fetchMock.mock.calls[0];
    const serialized = args?.[1]?.body;
    if (typeof serialized !== 'string') throw new Error('Expected JSON request body');
    const body = JSON.parse(serialized) as { store: boolean; input: unknown[] };
    expect(body.store).toBe(false);
    expect(body.input[1]).toEqual({ type: 'image', data: png, mime_type: 'image/png' });
    expect(JSON.stringify(body.input[0])).toContain('Epipremnum aureum');
  });
  it('surfaces exhausted image quota without switching text models or retrying charges', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(
      new DesignImageProvider().generate({ data: png, mime_type: 'image/png' }, {
        style: 'MINIMAL',
        plants: [],
      } as unknown as DesignScene),
    ).rejects.toThrow('quota is unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

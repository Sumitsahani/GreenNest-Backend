import { Injectable } from '@nestjs/common';
import { imageFailure, type ImageData } from './design-image-provider';

@Injectable()
export class DesignImageStorage {
  private endpoint(path: string): string {
    const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
    if (!base) throw imageFailure('Photo storage is not configured yet.');
    return `${base}/storage/v1/${path}`;
  }
  private headers(authorization: string): Record<string, string> {
    return { Authorization: authorization, apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '' };
  }
  private path(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
  }
  async load(path: string, authorization: string): Promise<ImageData> {
    const response = await fetch(
      this.endpoint(`object/authenticated/space-photos/${this.path(path)}`),
      { headers: this.headers(authorization), signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok)
      throw imageFailure('The original photo could not be opened. Sign in again and retry.');
    const mime = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'].includes(mime) ||
      Number(response.headers.get('content-length')) > 15 * 1024 * 1024
    )
      throw imageFailure('Use a clear photo smaller than 15 MB.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 15 * 1024 * 1024)
      throw imageFailure('Use a clear photo smaller than 15 MB.');
    return { data: bytes.toString('base64'), mime_type: mime };
  }
  async save(path: string, image: ImageData, authorization: string): Promise<void> {
    const response = await fetch(this.endpoint(`object/space-photos/${this.path(path)}`), {
      method: 'POST',
      headers: {
        ...this.headers(authorization),
        'Content-Type': image.mime_type,
        'x-upsert': 'true',
      },
      body: new Uint8Array(Buffer.from(image.data, 'base64')),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw imageFailure('The generated image could not be saved. Please try again.');
  }
  async sign(path: string, authorization: string): Promise<string> {
    const response = await fetch(this.endpoint(`object/sign/space-photos/${this.path(path)}`), {
      method: 'POST',
      headers: { ...this.headers(authorization), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw imageFailure('The saved image could not be opened. Please retry.');
    const result = (await response.json()) as { signedURL?: string };
    if (!result.signedURL?.startsWith('/object/sign/space-photos/'))
      throw imageFailure('The saved image could not be opened. Please retry.');
    return this.endpoint(result.signedURL.slice(1));
  }
}

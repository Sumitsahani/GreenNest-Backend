import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
describe('Auth provider failures', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  const context = {
    switchToHttp: (): { getRequest: () => { headers: { authorization: string } } } => ({
      getRequest: () => ({ headers: { authorization: 'Bearer token' } }),
    }),
  } as unknown as ExecutionContext;
  const guard = new SupabaseAuthGuard(
    new ConfigService({ SUPABASE_URL: 'https://example.test', SUPABASE_PUBLISHABLE_KEY: 'test' }),
  );
  it('does not turn a provider outage into an expired session', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'AUTH_PROVIDER_ERROR' });
  });
  it('rejects an invalid token', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

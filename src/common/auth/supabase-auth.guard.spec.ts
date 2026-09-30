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
  it('rejects existing sessions of suspended accounts', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: '00000000-0000-4000-8000-000000000001',
          app_metadata: { suspended: true },
        }),
    });
    await expect(guard.canActivate(context)).rejects.toThrow('suspended');
  });
  it('does not trust user-editable metadata for suspension or admin authority', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: '00000000-0000-4000-8000-000000000001',
          user_metadata: { role: 'ADMIN', suspended: false },
        }),
    });
    await expect(guard.authenticate('token')).resolves.not.toHaveProperty('role');
  });

  it('shares simultaneous verification but rechecks later requests for suspension', async () => {
    const user = { id: '00000000-0000-4000-8000-000000000001' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(user) });
    const other = new SupabaseAuthGuard(
      new ConfigService({ SUPABASE_URL: 'https://example.test', SUPABASE_PUBLISHABLE_KEY: 'test' }),
    );
    await Promise.all([guard.authenticate('same'), other.authenticate('same')]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...user, app_metadata: { suspended: true } }),
      });
    await expect(guard.authenticate('same')).rejects.toThrow('suspended');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not share verification across different tokens', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }),
      });
    await Promise.all([guard.authenticate('one'), guard.authenticate('two')]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

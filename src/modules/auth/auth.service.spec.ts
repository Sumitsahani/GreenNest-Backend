import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

describe('AuthService email authentication', () => {
  let service: AuthService;

  beforeEach(() => {
    const config = {
      getOrThrow: jest.fn((key: string): string =>
        key === 'SUPABASE_URL' ? 'https://example.supabase.co' : 'test-publishable-key',
      ),
    } as unknown as ConfigService;
    service = new AuthService(config);
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates an email account and reports when confirmation is required', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'user-1',
          email: 'person@example.com',
          user_metadata: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      service.registerWithEmail(' Person@Example.com ', 'secret12'),
    ).resolves.toMatchObject({
      confirmationRequired: true,
      session: null,
      user: { id: 'user-1', email: 'person@example.com' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'person@example.com', password: 'secret12' }),
      }),
    );
  });

  it('logs in with email and maps the Supabase session', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'person@example.com', user_metadata: {} },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(service.loginWithEmail('PERSON@example.com', 'secret12')).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', email: 'person@example.com' },
    });
  });
});

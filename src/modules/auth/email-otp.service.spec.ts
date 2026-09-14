import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { EmailOtpService } from './email-otp.service';
import type { PrismaService } from '../../database/prisma.service';
import type { EmailService } from './email.service';
import type { AuthService } from './auth.service';

// Test doubles deliberately infer their exact return shapes; production methods have explicit contracts.
/* eslint-disable @typescript-eslint/explicit-function-return-type */
describe('Email OTP security', () => {
  const secret = 'test-secret-that-is-at-least-32-characters';
  function setup() {
    const record = {
      email: 'test@example.test',
      otpHash: createHmac('sha256', secret).update('test@example.test:123456').digest('hex'),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
      usedAt: null as Date | null,
      verifiedAt: null as Date | null,
      createdAt: new Date(),
      windowStart: new Date(),
      requestCount: 1,
    };
    const update = jest.fn(
      ({
        data,
      }: {
        data: { attemptCount?: { increment: number }; usedAt?: Date; verifiedAt?: Date };
      }) => {
        if (data.attemptCount) record.attemptCount += data.attemptCount.increment;
        if (data.usedAt) record.usedAt = data.usedAt;
        return Promise.resolve(record);
      },
    );
    const tx = {
      $queryRaw: jest.fn(),
      emailOtp: {
        findUnique: jest.fn().mockResolvedValue(record),
        update,
        upsert: jest
          .fn<Promise<void>, [{ create: { otpHash: string } }]>()
          .mockResolvedValue(undefined),
        deleteMany: jest.fn(),
      },
    };
    const db = {
      $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
      emailOtp: { updateMany: jest.fn() },
    };
    const email = { assertConfigured: jest.fn(), sendOtp: jest.fn() };
    const auth = {
      sessionForVerifiedEmail: jest.fn().mockResolvedValue({ accessToken: 'test-session' }),
    };
    const config = new ConfigService({
      OTP_HASH_SECRET: secret,
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      MAX_OTP_ATTEMPTS: 5,
    });
    return {
      record,
      tx,
      auth,
      email,
      service: new EmailOtpService(
        db as unknown as PrismaService,
        config,
        email as unknown as EmailService,
        auth as unknown as AuthService,
      ),
    };
  }
  it('consumes a correct code once and never authenticates a replay', async () => {
    const s = setup();
    await s.service.verify('TEST@example.test', '123456');
    expect(s.record.usedAt).toBeInstanceOf(Date);
    await expect(s.service.verify('test@example.test', '123456')).rejects.toMatchObject({
      code: 'OTP_USED',
    });
    expect(s.auth.sessionForVerifiedEmail).toHaveBeenCalledTimes(1);
  });
  it('commits wrong attempts and locks after five failures', async () => {
    const s = setup();
    for (let n = 0; n < 5; n++)
      await expect(s.service.verify(s.record.email, '000000')).rejects.toThrow();
    expect(s.record.attemptCount).toBe(5);
    await expect(s.service.verify(s.record.email, '123456')).rejects.toMatchObject({
      code: 'OTP_ATTEMPTS_EXCEEDED',
    });
    expect(s.auth.sessionForVerifiedEmail).not.toHaveBeenCalled();
  });
  it('rejects expired and unsent codes', async () => {
    const s = setup();
    s.record.expiresAt = new Date(0);
    await expect(s.service.verify(s.record.email, '123456')).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
    expect(s.auth.sessionForVerifiedEmail).not.toHaveBeenCalled();
  });
  it('does not send during resend cooldown', async () => {
    const s = setup();
    await expect(s.service.request(s.record.email)).rejects.toMatchObject({ code: 'OTP_COOLDOWN' });
    expect(s.email.sendOtp).not.toHaveBeenCalled();
  });
  it('never returns success when SMTP rejects the send', async () => {
    const s = setup();
    s.record.createdAt = new Date(Date.now() - 120_000);
    s.email.sendOtp.mockRejectedValue(new Error('SMTP rejected'));
    await expect(s.service.request(s.record.email)).rejects.toThrow('SMTP rejected');
    expect(s.auth.sessionForVerifiedEmail).not.toHaveBeenCalled();
    const stored = s.tx.emailOtp.upsert.mock.calls[0]![0];
    expect(stored.create.otpHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

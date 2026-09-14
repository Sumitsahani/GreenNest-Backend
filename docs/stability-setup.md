# Stability setup and verification

## Development connectivity

Frontend `.env.local`: `EXPO_PUBLIC_API_URL=auto`. On a LAN Expo session, the API hostname follows `Constants.expoConfig.hostUri`; API port defaults to 3000. An explicit API URL is required for tunnels, custom backend ports, or separate backend hosts. Production uses an explicit HTTPS API URL or the existing hosted HTTPS default, never the Metro hostname.

Backend listens on `HOST=0.0.0.0`, `PORT=3000`. Keep database connection-on-startup enabled. `/api/v1/health` now executes `SELECT 1` and reports 503 if the database is unavailable.

Restart Expo after changing local environment:
```
npx expo start --go --clear
```

## Email OTP

Configure local/server environment from `.env.example`: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, OTP_HASH_SECRET (random 32+ characters), SUPABASE_SERVICE_ROLE_KEY. Do not place any of these in frontend EXPO_PUBLIC variables.

Endpoints: `POST /api/v1/auth/email/otp/request` with `{email}`; `POST /api/v1/auth/email/otp/verify` with `{email,code}`. Login links to the email-code screen, existing password auth, Google auth, and existing Supabase phone SMS flow.

Nodemailer requires SMTP TLS (implicit TLS or STARTTLS). Success means the recipient was accepted by SMTP, not proof of inbox delivery. OTPs are backend-generated, stored as keyed SHA-256 hashes, expire, enforce attempts and cooldown, and are consumed under a database lock. Per-address requests are capped at five/hour, with endpoint IP throttling. Old expired rows are pruned during requests; used/expired codes are never valid.

After successful local OTP verification, the backend uses Supabase's server-only generate-link + verify exchange to retain existing Supabase sessions and data ownership. The generated link/token is never returned to the client or logged. An auth-provider failure after consumption requires requesting a new code; the old code cannot be replayed.

References: [Nodemailer SMTP](https://nodemailer.com/smtp), [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).

## Verification commands

```
npm run prisma:generate
npm run prisma:migrate:deploy
npm test
npm run lint
npm run build
node scripts/check-stability.cjs
node scripts/check-core.cjs
npx ts-node --project tsconfig.json scripts/check-persistence.ts
```

The persistence script creates isolated generated fixture identities in the configured real database, exercises service methods, and cleans up only its own fixtures. It bypasses HTTP authentication intentionally and must not be counted as Android/login E2E verification. It disables background notification delivery in its process. No real order delivery is initiated.

## Still requires a physical device / external configuration

- ADB-authorized Android phone for session restart, camera/gallery, upload, and screen interactions.
- Configured SMTP + Supabase server key + test recipient for real inbox OTP delivery.
- Configured Supabase SMS provider and test number for SMS delivery.
- Google provider and mobile redirect allowlist for OAuth E2E.
- Native development build and FCM/push configuration for actual Android notification delivery; this app skips native notifications in Expo Go.

Record actual evidence separately for each test. Unit tests, valid API responses, and service/database integration do not establish a complete phone E2E pass.

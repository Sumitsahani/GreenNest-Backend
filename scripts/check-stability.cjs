// Read-only diagnostic. Never print secrets, tokens, full URLs, or user records.
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ quiet: true });
async function main() {
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    try {
      const url = new URL(process.env[key]);
      console.log(key, {
        host: url.hostname,
        port: url.port,
        sslmode: url.searchParams.get('sslmode'),
        passwordConfigured: Boolean(url.password),
      });
    } catch {
      console.log(key, 'invalid or missing');
    }
  }
  for (const key of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'OTP_HASH_SECRET',
  ])
    console.log(key, process.env[key] ? 'configured' : 'missing');
  const db = new PrismaClient({ log: [] });
  try {
    await db.$connect();
    await db.$queryRaw`SELECT 1`;
    console.log('DATABASE_SELECT_1 PASS');
    const migrations =
      await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    const applied = new Set(
      migrations.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => m.migration_name),
    );
    console.log(
      'PENDING_MIGRATIONS',
      fs
        .readdirSync('prisma/migrations', { withFileTypes: true })
        .filter((x) => x.isDirectory() && !applied.has(x.name))
        .map((x) => x.name),
    );
  } catch (error) {
    console.log('DATABASE_CHECK_FAILED', error.code || error.errorCode || error.name);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.log('DIAGNOSTIC_FAILED');
  process.exitCode = 1;
});

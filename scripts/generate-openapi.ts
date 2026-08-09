import { writeFile, mkdir } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/greennest';
process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/greennest';
process.env.WEB_APP_ORIGIN ??= 'http://localhost:3001';
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY ??= 'sb_publishable_test_key_for_contracts';
process.env.DATABASE_CONNECT_ON_STARTUP = 'false';

async function generate(): Promise<void> {
  const [{ AppModule }, { setupApp }, { createOpenApiDocument }] = await Promise.all([
    import('../src/app.module'),
    import('../src/setup-app'),
    import('../src/swagger'),
  ]);
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  setupApp(app);
  await app.init();
  const document = createOpenApiDocument(app);
  await mkdir('openapi', { recursive: true });
  await writeFile('openapi/openapi.json', JSON.stringify(document, null, 2));
  await app.close();
}

void generate().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});

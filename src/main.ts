import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useStaticAssets(join(process.cwd(), 'public'));
  setupApp(app);
  setupSwagger(app);
  await app.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  const code =
    error && typeof error === 'object' && 'errorCode' in error
      ? String(error.errorCode)
      : error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'STARTUP_FAILED';
  if (code === 'EADDRINUSE') {
    console.error(
      `Backend startup failed (EADDRINUSE): port ${Number(process.env.PORT ?? 3000)} is already in use. Stop the existing backend before restarting, or use the running instance.`,
    );
  } else {
    console.error(
      `Backend startup failed (${code}). Check database connectivity and server configuration.`,
    );
  }
  process.exitCode = 1;
});

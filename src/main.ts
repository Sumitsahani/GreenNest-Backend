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
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();

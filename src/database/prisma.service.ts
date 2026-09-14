import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor(private readonly configService: ConfigService) {
    super({
      log: configService.get<string>('nodeEnv') === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.configService.get<boolean>('databaseConnectOnStartup')) return;
    const attempts = this.configService.get<number>('DATABASE_CONNECT_ATTEMPTS', 3);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.$connect();
        this.connected = true;
        this.logger.log('PostgreSQL connection established');
        return;
      } catch (error) {
        const code = error && typeof error === 'object' && 'errorCode' in error ? String(error.errorCode) : '';
        if (!['P1001', 'P1002'].includes(code) || attempt === attempts) throw error;
        this.logger.warn(`Database connection ${code}; retrying startup (${attempt}/${attempts}).`);
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }

  isConnected(): boolean {
    return this.connected;
  }
}

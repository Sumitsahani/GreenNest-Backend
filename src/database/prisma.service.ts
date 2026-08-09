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
    await this.$connect();
    this.connected = true;
    this.logger.log('PostgreSQL connection established');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.connected) await this.$disconnect();
  }

  isConnected(): boolean {
    return this.connected;
  }
}

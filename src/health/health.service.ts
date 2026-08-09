import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      service: 'greennest-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: this.prisma.isConnected() ? 'connected' : 'not-connected',
    };
  }
}

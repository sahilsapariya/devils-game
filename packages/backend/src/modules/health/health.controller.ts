import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { CacheService } from '../cache/cache.service';

interface ComponentStatus {
  status: 'ok' | 'error';
  message?: string;
  size?: number;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  components: {
    database: ComponentStatus;
    cache: ComponentStatus;
    eventBus: ComponentStatus;
  };
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const database = await this.checkDatabase();
    const cache: ComponentStatus = {
      status: 'ok',
      size: this.cacheService.size(),
    };
    const eventBus: ComponentStatus = { status: 'ok' };

    const overall: HealthResponse['status'] =
      database.status === 'ok' ? 'ok' : 'degraded';

    const response: HealthResponse = {
      status: overall,
      timestamp: new Date().toISOString(),
      components: { database, cache, eventBus },
    };

    if (overall !== 'ok') {
      throw new ServiceUnavailableException(response);
    }
    return response;
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

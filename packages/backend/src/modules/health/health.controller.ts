import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { RedisService } from '../redis/redis.service';

interface ComponentStatus {
  status: 'ok' | 'error';
  message?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  components: {
    database: ComponentStatus;
    redis: ComponentStatus;
  };
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const overall: HealthResponse['status'] =
      database.status === 'ok' && redis.status === 'ok' ? 'ok' : 'degraded';

    const response: HealthResponse = {
      status: overall,
      timestamp: new Date().toISOString(),
      components: { database, redis },
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

  private async checkRedis(): Promise<ComponentStatus> {
    try {
      const ok = await this.redis.ping();
      return ok
        ? { status: 'ok' }
        : { status: 'error', message: 'Unexpected ping response' };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

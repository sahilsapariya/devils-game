import { Controller, Get } from '@nestjs/common';
import { ProvidersService, ProviderStatus } from './providers.service';

@Controller()
export class HealthController {
  constructor(private readonly providers: ProvidersService) {}

  @Get('health')
  async health(): Promise<{ ok: true; providers: ProviderStatus; service: string }> {
    const providers = await this.providers.status();
    return {
      ok: true,
      service: 'ai-service',
      providers,
    };
  }
}

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ProvidersService } from './providers.service';

@Module({
  controllers: [HealthController],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class HealthModule {}

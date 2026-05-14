import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { RoundsModule } from '../rounds/rounds.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { EventBroadcasterService } from './event-broadcaster.service';
import { OperationalGateway } from './operational.gateway';

@Module({
  imports: [AuthModule, EventsModule, RoundsModule, TelemetryModule],
  providers: [OperationalGateway, EventBroadcasterService],
  exports: [OperationalGateway, EventBroadcasterService],
})
export class WebsocketsModule {}

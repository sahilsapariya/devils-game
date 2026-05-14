import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventEntity } from '../../database/entities/event.entity';
import { EventSnapshotEntity } from '../../database/entities/event-snapshot.entity';
import { RoundEntity } from '../../database/entities/round.entity';
import { EventProcessor } from './event-processor.worker';
import { EventSnapshotService } from './event-snapshot.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { OperationalEventBus } from './operational-event-bus.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity, EventSnapshotEntity, RoundEntity]),
  ],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventSnapshotService,
    EventProcessor,
    OperationalEventBus,
  ],
  exports: [
    EventsService,
    EventSnapshotService,
    EventProcessor,
    OperationalEventBus,
  ],
})
export class EventsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BehavioralRecordEntity } from '../../database/entities/behavioral-record.entity';
import { RoundEntity } from '../../database/entities/round.entity';
import { TelemetryEventEntity } from '../../database/entities/telemetry-event.entity';
import { ScoringService } from './scoring.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TelemetryEventEntity,
      RoundEntity,
      BehavioralRecordEntity,
    ]),
  ],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}

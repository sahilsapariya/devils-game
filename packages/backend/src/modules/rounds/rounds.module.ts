import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BehavioralRecordEntity } from '../../database/entities/behavioral-record.entity';
import { MissionEntity } from '../../database/entities/mission.entity';
import { RoundEntity } from '../../database/entities/round.entity';
import { EventsModule } from '../events/events.module';
import { RoundStateMachineService } from './round-state-machine.service';
import { RoundsController } from './rounds.controller';
import { RoundsService } from './rounds.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RoundEntity, MissionEntity, BehavioralRecordEntity]),
    EventsModule,
  ],
  controllers: [RoundsController],
  providers: [RoundsService, RoundStateMachineService],
  exports: [RoundsService, RoundStateMachineService],
})
export class RoundsModule {}

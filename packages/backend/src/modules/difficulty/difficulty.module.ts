import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoundEntity } from '../../database/entities/round.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { EventsModule } from '../events/events.module';
import { DifficultyEngineService } from './difficulty-engine.service';

@Module({
  imports: [TypeOrmModule.forFeature([RoundEntity, UserEntity]), EventsModule],
  providers: [DifficultyEngineService],
  exports: [DifficultyEngineService],
})
export class DifficultyModule {}

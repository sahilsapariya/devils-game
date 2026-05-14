import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConsequenceEntity } from '../../database/entities/consequence.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { EventsModule } from '../events/events.module';
import { ConsequencesController } from './consequences.controller';
import { ConsequencesService } from './consequences.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsequenceEntity, UserEntity]),
    EventsModule,
  ],
  controllers: [ConsequencesController],
  providers: [ConsequencesService],
  exports: [ConsequencesService],
})
export class ConsequencesModule {}

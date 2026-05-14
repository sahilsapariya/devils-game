import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { appConfig } from './config/app.config';
import { databaseConfig, type DatabaseConfig } from './config/database.config';
import { jwtConfig } from './config/jwt.config';
import { redisConfig } from './config/redis.config';
import {
  AnnouncementEntity,
  BehavioralRecordEntity,
  ConsequenceEntity,
  EventEntity,
  EventSnapshotEntity,
  MissionEntity,
  OperationalLogEntity,
  RoundEntity,
  TelemetryEventEntity,
  UserEntity,
} from './database/entities';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConsequencesModule } from './modules/consequences/consequences.module';
import { DifficultyModule } from './modules/difficulty/difficulty.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { MissionsModule } from './modules/missions/missions.module';
import { RedisModule } from './modules/redis/redis.module';
import { RoundsModule } from './modules/rounds/rounds.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { UsersModule } from './modules/users/users.module';
import { WebsocketsModule } from './modules/websockets/websockets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig],
      cache: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const cfg = configService.getOrThrow<DatabaseConfig>('database');
        return {
          type: 'postgres',
          host: cfg.host,
          port: cfg.port,
          username: cfg.username,
          password: cfg.password,
          database: cfg.database,
          ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
          synchronize: false,
          logging: cfg.logging,
          autoLoadEntities: false,
          entities: [
            UserEntity,
            MissionEntity,
            RoundEntity,
            EventEntity,
            EventSnapshotEntity,
            TelemetryEventEntity,
            BehavioralRecordEntity,
            ConsequenceEntity,
            AnnouncementEntity,
            OperationalLogEntity,
          ],
          extra: {
            max: cfg.poolSize,
          },
        };
      },
    }),
    RedisModule,
    AuthModule,
    UsersModule,
    MissionsModule,
    EventsModule,
    RoundsModule,
    TelemetryModule,
    ScoringModule,
    ConsequencesModule,
    DifficultyModule,
    AnnouncementsModule,
    WebsocketsModule,
    HealthModule,
  ],
})
export class AppModule {}

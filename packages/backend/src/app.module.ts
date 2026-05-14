import * as path from 'path';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { appConfig } from './config/app.config';
import { databaseConfig, type DatabaseConfig } from './config/database.config';
import { jwtConfig } from './config/jwt.config';
import { configureSqlitePragmas } from './database/data-source';
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
import { CacheModule } from './modules/cache/cache.module';
import { ConsequencesModule } from './modules/consequences/consequences.module';
import { DifficultyModule } from './modules/difficulty/difficulty.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { MissionsModule } from './modules/missions/missions.module';
import { RoundsModule } from './modules/rounds/rounds.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { UsersModule } from './modules/users/users.module';
import { WebsocketsModule } from './modules/websockets/websockets.module';

// Migrations are resolved relative to compiled `dist/database/migrations/...`
// at runtime; relative `./` paths in TypeORM are resolved off cwd which is
// brittle, so we resolve against __dirname.
const operationalMigrationsGlob = path.join(
  __dirname,
  'database',
  'migrations',
  'operational',
  '*.{js,ts}',
);
const telemetryMigrationsGlob = path.join(
  __dirname,
  'database',
  'migrations',
  'telemetry',
  '*.{js,ts}',
);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
      cache: true,
      envFilePath: ['.env'],
    }),
    // Operational database (default connection)
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const cfg = configService.getOrThrow<DatabaseConfig>('database');
        return {
          type: 'better-sqlite3',
          database: cfg.operationalPath,
          synchronize: false,
          logging: cfg.logging,
          autoLoadEntities: false,
          entities: [
            UserEntity,
            MissionEntity,
            RoundEntity,
            EventEntity,
            EventSnapshotEntity,
            BehavioralRecordEntity,
            ConsequenceEntity,
            AnnouncementEntity,
            OperationalLogEntity,
          ],
          migrations: [operationalMigrationsGlob],
          migrationsTableName: 'typeorm_migrations',
          migrationsRun: true,
          prepareDatabase: configureSqlitePragmas,
        };
      },
    }),
    // Telemetry database (named connection)
    TypeOrmModule.forRootAsync({
      name: 'telemetry',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const cfg = configService.getOrThrow<DatabaseConfig>('database');
        return {
          name: 'telemetry',
          type: 'better-sqlite3',
          database: cfg.telemetryPath,
          synchronize: false,
          logging: cfg.logging,
          autoLoadEntities: false,
          entities: [TelemetryEventEntity],
          migrations: [telemetryMigrationsGlob],
          migrationsTableName: 'typeorm_migrations',
          migrationsRun: true,
          prepareDatabase: configureSqlitePragmas,
        };
      },
    }),
    CacheModule,
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

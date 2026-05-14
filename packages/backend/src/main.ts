import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';

import { AppModule } from './app.module';
import type { AppConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const appCfg = configService.getOrThrow<AppConfig>('app');

  app.setGlobalPrefix(appCfg.apiPrefix, { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );

  const origins = appCfg.corsOrigins;
  app.enableCors({
    origin: origins.length > 0 ? origins.slice() : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Socket.io adapter (Redis adapter can be wired later for multi-server scaling).
  app.useWebSocketAdapter(new IoAdapter(app));

  app.enableShutdownHooks();

  await app.listen(appCfg.port);
  logger.log(
    `PROJECT EXTRACTION backend listening on port ${appCfg.port} (env=${appCfg.nodeEnv})`,
  );
}

bootstrap().catch((error: unknown) => {
  // Last-resort error reporter — Nest's logger may not be ready yet.
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', error);
  process.exit(1);
});

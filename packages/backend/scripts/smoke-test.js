/* eslint-disable */
/**
 * Headless E2E smoke test for the SQLite + EventEmitter refactor.
 *
 * Boots a NestApplicationContext (no HTTP listener, no port bind), exercises
 * the same service layer the controllers call, and verifies the SQLite tables
 * get populated correctly. This avoids the sandbox prohibition on listening
 * sockets while still proving the wiring works end-to-end.
 */
const path = require('path');

require('reflect-metadata');

(async () => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.PORT = process.env.PORT || '0';
  process.env.API_PREFIX = process.env.API_PREFIX || 'api';
  process.env.DATABASE_PATH =
    process.env.DATABASE_PATH || path.resolve(__dirname, '../data/operational.db');
  process.env.TELEMETRY_DATABASE_PATH =
    process.env.TELEMETRY_DATABASE_PATH || path.resolve(__dirname, '../data/telemetry.db');
  process.env.DATABASE_LOGGING = process.env.DATABASE_LOGGING || 'false';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET ||
    'development-secret-that-is-at-least-32-chars-long';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ||
    'development-refresh-secret-that-is-at-least-32-chars';
  process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
  process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '12';
  process.env.CORS_ORIGINS =
    process.env.CORS_ORIGINS || 'http://localhost:8081,http://localhost:3000';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
  process.env.AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:4001';
  process.env.HMAC_VERIFICATION_ENABLED =
    process.env.HMAC_VERIFICATION_ENABLED || 'false';

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');

  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const { AuthService } = require('../dist/modules/auth/auth.service');
    const { UsersService } = require('../dist/modules/users/users.service');
    const { MissionsService } = require('../dist/modules/missions/missions.service');
    const { TelemetryService } = require('../dist/modules/telemetry/telemetry.service');
    const { CacheService } = require('../dist/modules/cache/cache.service');
    const { OperationalEventBus } = require('../dist/modules/events/operational-event-bus.service');

    const auth = ctx.get(AuthService);
    const users = ctx.get(UsersService);
    const missions = ctx.get(MissionsService);
    const telemetry = ctx.get(TelemetryService);
    const cache = ctx.get(CacheService);
    const bus = ctx.get(OperationalEventBus);

    const email = `sqlite-smoke-${Date.now()}@extraction.local`;
    const registerResult = await auth.register({
      email,
      password: 'OperationalTest123!',
      displayName: 'SQLite Smoke',
    });
    console.log('register: user=%s', registerResult.user.id);

    const me = await users.getById(registerResult.user.id);
    console.log('me: %s (%s)', me.id, me.email);

    const mission = await missions.create(registerResult.user.id, {
      title: 'SQLite test mission',
      priority: 1,
    });
    console.log('mission: %s priority=%d', mission.id, mission.priority);

    let broadcastsSeen = 0;
    const unsub = bus.subscribeBroadcasts(() => {
      broadcastsSeen += 1;
    });

    const ingest = await telemetry.ingestBatch(registerResult.user.id, {
      source: 'desktop_agent',
      deviceId: 'smoke-device-1',
      batches: [
        {
          periodStart: new Date(Date.now() - 5 * 60_000).toISOString(),
          periodEnd: new Date().toISOString(),
          metrics: {
            totalFocusMinutes: 5,
            appSwitches: 1,
            idleMinutes: 0,
            distractionCount: 0,
          },
          events: [
            {
              eventType: 'git_commit',
              occurredAt: new Date(Date.now() - 60_000).toISOString(),
              payload: { repo: 'foo', sha: 'deadbeef' },
            },
          ],
        },
      ],
    });
    console.log('telemetry: accepted=%d rejected=%d', ingest.accepted, ingest.rejected);

    unsub();
    console.log('broadcasts observed: %d', broadcastsSeen);

    // Cache sanity
    cache.set('smoke:test:k', { ok: 1 }, 60);
    const cached = cache.get('smoke:test:k');
    if (!cached || cached.ok !== 1) {
      throw new Error('cache get/set roundtrip failed');
    }
    console.log('cache: ok size=%d', cache.size());

    // Direct DB row counts
    const Database = require('better-sqlite3');
    const opDb = new Database(process.env.DATABASE_PATH, { readonly: true });
    const userCount = opDb.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const missionCount = opDb.prepare('SELECT COUNT(*) AS c FROM missions').get().c;
    const eventCount = opDb.prepare('SELECT COUNT(*) AS c FROM events').get().c;
    const operationalMode = opDb.pragma('journal_mode', { simple: true });
    console.log(
      'operational.db: users=%d missions=%d events=%d journal=%s',
      userCount,
      missionCount,
      eventCount,
      operationalMode,
    );
    opDb.close();

    const teDb = new Database(process.env.TELEMETRY_DATABASE_PATH, { readonly: true });
    const teCount = teDb.prepare('SELECT COUNT(*) AS c FROM telemetry_events').get().c;
    const teMode = teDb.pragma('journal_mode', { simple: true });
    console.log('telemetry.db: telemetry_events=%d journal=%s', teCount, teMode);
    teDb.close();

    if (userCount < 1) throw new Error('expected >=1 user');
    if (missionCount < 1) throw new Error('expected >=1 mission');
    if (teCount < 1) throw new Error('expected >=1 telemetry event');

    console.log('SMOKE OK');
  } finally {
    await ctx.close();
  }
})().catch((err) => {
  console.error('SMOKE FAILED');
  console.error(err);
  process.exit(1);
});

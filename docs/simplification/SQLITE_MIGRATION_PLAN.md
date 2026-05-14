# SQLITE MIGRATION PLAN

Detailed step-by-step plan for replacing PostgreSQL with SQLite in `packages/backend/`.

**Target:** Two SQLite databases (`operational.db` + `telemetry.db`), WAL mode, no managed-DB dependency.

---

## OVERVIEW

We use **two separate SQLite databases** to keep high-volume telemetry writes from blocking operational queries. SQLite handles this naturally — each `.db` file has its own writer lock, so concurrent reads of `operational.db` are unaffected by a flurry of writes to `telemetry.db`.

```
data/
├── operational.db   # users, missions, rounds, events, consequences,
│                    # announcements, event_snapshots, operational_logs, behavioral_records
│                    # ~1-10 MB typical; many reads, low write rate
│
└── telemetry.db     # telemetry_events
                     # ~10-500 MB over a year of heavy use; mostly writes
```

Why this split:
- Telemetry events arrive in 100-event batches every 10 minutes from desktop + browser
- Operational queries (round status, current state) happen on every WebSocket event and API call
- Two files = two writer locks = no contention
- Backup `operational.db` more frequently; backup `telemetry.db` less frequently

---

## DEPENDENCY CHANGES

### Add

```json
{
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "uuid": "^10.0.0"
  }
}
```

`better-sqlite3` is the fastest synchronous SQLite driver for Node. TypeORM supports it natively via the `better-sqlite3` driver type.

`uuid` is needed because we generate UUIDs app-side now (SQLite doesn't have `gen_random_uuid()`).

### Remove

```json
{
  "dependencies": {
    "pg": "(remove)"
  }
}
```

---

## CONFIGURATION CHANGES

### `.env.example` (backend)

Before:
```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=extraction
DATABASE_PASSWORD=development
DATABASE_NAME=extraction_dev
DATABASE_SSL=false
DATABASE_POOL_SIZE=10
DATABASE_LOGGING=false
```

After:
```
# SQLite database paths (relative to backend working directory)
DATABASE_PATH=./data/operational.db
TELEMETRY_DATABASE_PATH=./data/telemetry.db
DATABASE_LOGGING=false
```

### `packages/backend/src/config/database.config.ts`

Before (Postgres options):
```typescript
export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  poolSize: number;
  logging: boolean;
}
```

After (SQLite options):
```typescript
export interface DatabaseConfig {
  operationalPath: string;
  telemetryPath: string;
  logging: boolean;
}

export default registerAs<DatabaseConfig>('database', () => ({
  operationalPath: process.env.DATABASE_PATH ?? './data/operational.db',
  telemetryPath: process.env.TELEMETRY_DATABASE_PATH ?? './data/telemetry.db',
  logging: process.env.DATABASE_LOGGING === 'true',
}));
```

### `packages/backend/src/database/data-source.ts`

Two DataSource instances exported, one per database.

```typescript
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import {
  UserEntity, MissionEntity, RoundEntity, EventEntity,
  EventSnapshotEntity, ConsequenceEntity, AnnouncementEntity,
  OperationalLogEntity, BehavioralRecordEntity,
} from './entities';
import { TelemetryEventEntity } from './entities/telemetry-event.entity';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const operationalPath = process.env.DATABASE_PATH ?? './data/operational.db';
const telemetryPath = process.env.TELEMETRY_DATABASE_PATH ?? './data/telemetry.db';

// Ensure data directory exists
fs.mkdirSync(path.dirname(operationalPath), { recursive: true });
fs.mkdirSync(path.dirname(telemetryPath), { recursive: true });

export const OperationalDataSource = new DataSource({
  type: 'better-sqlite3',
  database: operationalPath,
  entities: [
    UserEntity, MissionEntity, RoundEntity, EventEntity,
    EventSnapshotEntity, ConsequenceEntity, AnnouncementEntity,
    OperationalLogEntity, BehavioralRecordEntity,
  ],
  migrations: [path.resolve(__dirname, 'migrations/operational/*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  logging: process.env.DATABASE_LOGGING === 'true',
  // Enable WAL mode + sane pragma defaults on every connection
  prepareDatabase: (db: any) => {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
  },
});

export const TelemetryDataSource = new DataSource({
  type: 'better-sqlite3',
  database: telemetryPath,
  entities: [TelemetryEventEntity],
  migrations: [path.resolve(__dirname, 'migrations/telemetry/*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  logging: process.env.DATABASE_LOGGING === 'true',
  prepareDatabase: (db: any) => {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
  },
});

// Default export for migration CLI (only knows about one DataSource at a time)
export default OperationalDataSource;
```

### `packages/backend/src/app.module.ts`

Two `TypeOrmModule.forRootAsync` calls — one for each DataSource with a unique `name` (default and `telemetry`):

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dbCfg = config.getOrThrow<DatabaseConfig>('database');
    return {
      type: 'better-sqlite3',
      database: dbCfg.operationalPath,
      entities: [/* operational entities */],
      migrations: [...],
      migrationsRun: true,  // auto-run migrations on boot
      logging: dbCfg.logging,
      prepareDatabase: configureSqlitePragmas,
    };
  },
}),

TypeOrmModule.forRootAsync({
  name: 'telemetry',
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dbCfg = config.getOrThrow<DatabaseConfig>('database');
    return {
      type: 'better-sqlite3',
      name: 'telemetry',
      database: dbCfg.telemetryPath,
      entities: [TelemetryEventEntity],
      migrations: [...],
      migrationsRun: true,
      logging: dbCfg.logging,
      prepareDatabase: configureSqlitePragmas,
    };
  },
}),
```

Modules that need the telemetry connection use `@InjectRepository(TelemetryEventEntity, 'telemetry')`.

### Module repository wiring

`TelemetryModule` is the only consumer of `telemetry.db`:

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([TelemetryEventEntity], 'telemetry'),  // 'telemetry' = connection name
  ],
  // ...
})
export class TelemetryModule {}
```

All other modules use the default DataSource for operational entities — no name needed.

---

## ENTITY ADAPTATIONS

A sweep through each entity in `packages/backend/src/database/entities/`. The pattern is consistent.

### Before (Postgres-flavored)

```typescript
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  preferences!: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
```

### After (portable / SQLite-friendly)

```typescript
@Entity('users')
export class UserEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = randomUUID();
  }

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  preferences!: Record<string, unknown>;

  @CreateDateColumn()  // TypeORM handles cross-DB default
  createdAt!: Date;
}
```

### Per-entity change summary

| Entity | Postgres feature used | SQLite replacement |
|---|---|---|
| `UserEntity` | UUID gen + JSONB preferences | `@PrimaryColumn` + `@BeforeInsert` + `simple-json` |
| `MissionEntity` | UUID gen + JSONB objectives | same |
| `RoundEntity` | UUID gen + JSONB difficulty + JSONB operationalState | same |
| `EventEntity` | UUID gen + JSONB payload | same |
| `EventSnapshotEntity` | UUID gen + JSONB state | same |
| `TelemetryEventEntity` | UUID gen + JSONB payload + indexes on timestamp | UUID gen + `simple-json` + standard B-tree index |
| `BehavioralRecordEntity` | UUID gen + JSONB metrics | same |
| `ConsequenceEntity` | UUID gen + JSONB metadata | same |
| `AnnouncementEntity` | UUID gen + JSONB context | same |
| `OperationalLogEntity` | UUID gen + JSONB context | same |

### Where to import `randomUUID`

Use Node's built-in: `import { randomUUID } from 'crypto';` — zero dependencies.

---

## MIGRATION REWRITE

Delete the existing migration. After entities are updated, generate a fresh one:

```bash
cd packages/backend
rm -rf src/database/migrations/*.ts
npm run migration:generate -- src/database/migrations/operational/InitialSchema -d src/database/data-source.ts
```

The new migration file will use SQLite-compatible SQL: `CREATE TABLE` with INTEGER/TEXT types, `CREATE INDEX` for B-tree indexes, no `EXTENSION IF NOT EXISTS`, no `uuid_generate_v4()`.

Manually generate the telemetry migration:

```bash
npm run migration:generate -- src/database/migrations/telemetry/InitialSchema -d src/database/telemetry-data-source.ts
```

(Requires a separate `telemetry-data-source.ts` for the CLI to know which entities belong where.)

---

## ENTITY-LEVEL INDEX REVIEW

Postgres allowed some sophisticated indexes that SQLite doesn't support cleanly. Audit and adapt:

| Existing index pattern | SQLite-compatible form |
|---|---|
| Composite index on `(user_id, scheduled_for)` | Same — standard B-tree |
| Partial index `WHERE delivered_at IS NULL` | Drop the WHERE clause — full index is fine for single-user volumes |
| Functional index on `LOWER(email)` | Drop — single user, exact match works |
| Time-DESC index `(created_at DESC)` | SQLite supports it; keep |
| GIN index on JSONB | Drop — JSONB query patterns aren't used; we always read the full JSON column |

All other indexes survive unchanged.

---

## REPOSITORY / SERVICE LAYER CHANGES

Most repository code is portable. Watch for these Postgres-isms and replace:

| Postgres SQL idiom | SQLite SQL idiom |
|---|---|
| `RETURNING *` | Not supported; use `.findOne()` after insert (TypeORM handles this automatically when using `repo.save()`) |
| `ON CONFLICT ... DO UPDATE` (upsert) | TypeORM `repo.upsert()` works the same way |
| `INTERVAL '7 days'` | `datetime('now', '-7 days')` |
| `NOW()` in raw queries | `datetime('now')` or `CURRENT_TIMESTAMP` |
| `EXTRACT(HOUR FROM ts)` | `strftime('%H', ts)` |
| Array operators (`@>`, `?`) | N/A — we don't store arrays in operational tables |

Grep for raw query strings in services and adapt. Most code uses Query Builder which is mostly portable.

---

## CONCURRENCY NOTES

SQLite in WAL mode supports:
- **Many concurrent readers** (no blocking)
- **One writer at a time per database file**
- Writers don't block readers (WAL feature)

For a single-user system, this is **massively over-sufficient**. Our peak workload looks like:
- 1-5 telemetry batch inserts/minute (writes to `telemetry.db`)
- 5-20 round/announcement state updates/round (writes to `operational.db`)
- 50-200 read queries/minute across both

`busy_timeout = 5000` (5 second wait for writer lock) gives any retried write plenty of time. No serialization issues expected.

---

## BACKUP STRATEGY

SQLite's `VACUUM INTO` is the safe way to back up while the DB is in use:

```bash
sqlite3 ./data/operational.db "VACUUM INTO '/backup/operational-$(date +%Y%m%d-%H%M).db'"
sqlite3 ./data/telemetry.db "VACUUM INTO '/backup/telemetry-$(date +%Y%m%d-%H%M).db'"
```

Helper script lives at `scripts/backup-sqlite.sh` (created by Subagent INFRA-VPS).

Optional: `rclone` to a cheap S3-compatible bucket (Cloudflare R2, Backblaze B2) for off-VPS storage.

---

## DOCKER COMPOSE CHANGES

### Before

```yaml
services:
  postgres:
    image: postgres:15-alpine
    # ...
  redis:
    image: redis:7-alpine
    # ...
```

### After (development)

```yaml
# Optional services only — backend uses SQLite by default, no DB container needed
services:
  ollama:
    image: ollama/ollama:latest
    profiles: ["ai"]   # opt-in
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

volumes:
  ollama_data:
```

Default `docker compose up` brings up **nothing**. Backend runs locally with `npm run dev`, writes SQLite files to `./packages/backend/data/`.

### After (production)

A separate `docker-compose.prod.yml` (covered in `VPS_DEPLOYMENT_GUIDE.md`):

```yaml
services:
  backend:
    image: ghcr.io/your-org/extraction-backend:latest
    # ... volumes for ./data, env from .env.production
  ai-service:
    image: ghcr.io/your-org/extraction-ai-service:latest
  caddy:
    image: caddy:2-alpine
    # ... reverse proxy
```

---

## VERIFICATION CHECKLIST

After the refactor:

- [ ] `npx tsc --noEmit` passes in `packages/backend/`
- [ ] `npm run build` produces `dist/main.js`
- [ ] `npm run migration:run` creates `./data/operational.db` and `./data/telemetry.db` with correct schemas (verify with `sqlite3 data/operational.db '.schema'`)
- [ ] `node dist/main.js` boots successfully on port 3001
- [ ] `curl http://localhost:3001/health` returns `200` with `components.database.status: ok`
- [ ] Register → login → mission → round → telemetry batch all succeed
- [ ] After E2E: `sqlite3 data/operational.db 'SELECT count(*) FROM users;'` returns 1
- [ ] After E2E: `sqlite3 data/telemetry.db 'SELECT count(*) FROM telemetry_events;'` returns ≥ 1
- [ ] WAL files are present (`operational.db-wal`, `telemetry.db-wal`) — confirms WAL mode is active

---

## KNOWN CAVEATS

1. **`better-sqlite3` is synchronous** — TypeORM wraps it in async, no issue
2. **WAL files** appear next to the DB files (`.db-wal` and `.db-shm`) — these are normal and must be backed up with the main file
3. **No concurrent backend processes** — only one Node process can write to a SQLite file at a time. Single-user system → trivially satisfied
4. **No HOT backups** without `VACUUM INTO` — don't `cp` a live SQLite file without freezing writes; use the helper script
5. **Migration on boot** — `migrationsRun: true` in TypeORM config means migrations apply automatically when backend starts. Safer for single-user single-deploy than manual migration commands.

---

Next: [`REDIS_REMOVAL_PLAN.md`](REDIS_REMOVAL_PLAN.md).

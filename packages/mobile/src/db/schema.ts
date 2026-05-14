/**
 * SQLite schema for the mobile operational runtime.
 *
 * Mobile is the authoritative runtime for in-flight rounds; this database
 * is the system-of-record while the device is offline. All tables retain
 * raw operational data; aggregation/inference is performed by the backend.
 */

export const SCHEMA_VERSION = 1;

export const SCHEMA_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY NOT NULL,
    mission_id TEXT,
    status TEXT NOT NULL,
    operational_state TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    local_timer_start TEXT,
    actual_start TEXT,
    actual_end TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    operational_metadata TEXT NOT NULL DEFAULT '{}',
    stats_json TEXT NOT NULL DEFAULT '{}',
    difficulty_json TEXT NOT NULL DEFAULT '{}',
    synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);`,
  `CREATE INDEX IF NOT EXISTS idx_rounds_starts_at ON rounds(starts_at);`,

  `CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY NOT NULL,
    round_id TEXT,
    category TEXT NOT NULL,
    tone TEXT NOT NULL,
    message TEXT NOT NULL,
    voice_url TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    scheduled_for TEXT NOT NULL,
    played_at TEXT,
    acknowledged_at TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status, scheduled_for);`,
  `CREATE INDEX IF NOT EXISTS idx_announcements_round ON announcements(round_id);`,

  `CREATE TABLE IF NOT EXISTS telemetry_queue (
    id TEXT PRIMARY KEY NOT NULL,
    round_id TEXT,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_status ON telemetry_queue(status, occurred_at);`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_round ON telemetry_queue(round_id);`,

  `CREATE TABLE IF NOT EXISTS consequences (
    id TEXT PRIMARY KEY NOT NULL,
    round_id TEXT,
    consequence_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    reputation_delta INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    acknowledged INTEGER NOT NULL DEFAULT 0,
    acknowledged_at TEXT,
    issued_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_consequences_round ON consequences(round_id);`,
  `CREATE INDEX IF NOT EXISTS idx_consequences_ack ON consequences(acknowledged);`,

  `CREATE TABLE IF NOT EXISTS operational_logs (
    id TEXT PRIMARY KEY NOT NULL,
    round_id TEXT,
    level TEXT NOT NULL DEFAULT 'info',
    category TEXT NOT NULL DEFAULT 'system',
    event_description TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_operational_logs_created ON operational_logs(created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_operational_logs_round ON operational_logs(round_id);`,
];

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema for PROJECT EXTRACTION.
 *
 * Creates ten tables backing the operational state machine, event sourcing
 * layer, and telemetry pipeline.
 *
 * pgcrypto extension is required for gen_random_uuid().
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // --- users -------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "display_name" varchar(100),
        "reputation_score" integer NOT NULL DEFAULT 0,
        "current_streak" integer NOT NULL DEFAULT 0,
        "longest_streak" integer NOT NULL DEFAULT 0,
        "difficulty_ceiling" integer NOT NULL DEFAULT 3,
        "preferences" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "email_verified_at" timestamptz,
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email")',
    );

    // --- missions ----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "missions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "objectives" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(32) NOT NULL DEFAULT 'draft',
        "priority" integer NOT NULL DEFAULT 0,
        "scheduled_start" timestamptz,
        "scheduled_end" timestamptz,
        "total_rounds" integer NOT NULL DEFAULT 0,
        "completed_rounds" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_missions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_missions_user_status" ON "missions" ("user_id", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_missions_scheduled_start" ON "missions" ("scheduled_start")',
    );

    // --- rounds ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "rounds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "mission_id" uuid NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'scheduled',
        "operational_state" varchar(32) NOT NULL DEFAULT 'DORMANT',
        "difficulty" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "scheduled_start" timestamptz NOT NULL,
        "scheduled_end" timestamptz NOT NULL,
        "actual_start" timestamptz,
        "actual_end" timestamptz,
        "duration_minutes" integer NOT NULL,
        "stats" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "points_earned" integer NOT NULL DEFAULT 0,
        "failure_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_rounds_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_rounds_mission" FOREIGN KEY ("mission_id")
          REFERENCES "missions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_rounds_user_status" ON "rounds" ("user_id", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_rounds_mission" ON "rounds" ("mission_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_rounds_scheduled_start" ON "rounds" ("scheduled_start")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_rounds_operational_state" ON "rounds" ("operational_state")',
    );

    // --- events (append-only) ---------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "round_id" uuid,
        "event_type" varchar(100) NOT NULL,
        "event_data" jsonb NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        "is_processed" boolean NOT NULL DEFAULT false,
        "processed_at" timestamptz,
        CONSTRAINT "fk_events_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_events_round" FOREIGN KEY ("round_id")
          REFERENCES "rounds"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_events_user_round_type" ON "events" ("user_id", "round_id", "event_type")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_events_occurred_at" ON "events" ("occurred_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_events_unprocessed" ON "events" ("is_processed", "event_type") WHERE "is_processed" = false',
    );

    // --- event snapshots --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "event_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "round_id" uuid,
        "snapshot_at" timestamptz NOT NULL,
        "event_count" integer NOT NULL,
        "state_data" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_event_snapshots_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_event_snapshots_round" FOREIGN KEY ("round_id")
          REFERENCES "rounds"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_event_snapshots_user_round" ON "event_snapshots" ("user_id", "round_id", "snapshot_at" DESC)',
    );

    // --- telemetry_events --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "telemetry_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "round_id" uuid,
        "source" varchar(32) NOT NULL,
        "device_id" varchar(128) NOT NULL,
        "event_type" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "is_productive" boolean,
        "confidence_score" numeric(4,3),
        "occurred_at" timestamptz NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_telemetry_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_telemetry_round" FOREIGN KEY ("round_id")
          REFERENCES "rounds"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_telemetry_user_round" ON "telemetry_events" ("user_id", "round_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_telemetry_occurred_at" ON "telemetry_events" ("occurred_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_telemetry_user_type_occurred" ON "telemetry_events" ("user_id", "event_type", "occurred_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_telemetry_device" ON "telemetry_events" ("device_id")',
    );

    // --- behavioral_records ------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "behavioral_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "round_id" uuid,
        "period_start" timestamptz NOT NULL,
        "period_end" timestamptz NOT NULL,
        "total_focus_minutes" integer NOT NULL DEFAULT 0,
        "total_idle_minutes" integer NOT NULL DEFAULT 0,
        "app_switches" integer NOT NULL DEFAULT 0,
        "productive_apps_active" integer NOT NULL DEFAULT 0,
        "distractions_detected" integer NOT NULL DEFAULT 0,
        "git_commits" integer NOT NULL DEFAULT 0,
        "ide_activity_minutes" integer NOT NULL DEFAULT 0,
        "terminal_commands" integer NOT NULL DEFAULT 0,
        "productivity_score" numeric(5,4) NOT NULL DEFAULT 0,
        "anomaly_flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "event_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_behavioral_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_behavioral_round" FOREIGN KEY ("round_id")
          REFERENCES "rounds"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_behavioral_user_round" ON "behavioral_records" ("user_id", "round_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_behavioral_period" ON "behavioral_records" ("period_start", "period_end")',
    );

    // --- consequences ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "consequences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "round_id" uuid,
        "consequence_type" varchar(64) NOT NULL,
        "severity" varchar(32) NOT NULL,
        "description" text NOT NULL,
        "reputation_delta" integer NOT NULL DEFAULT 0,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "acknowledged_at" timestamptz,
        "issued_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_consequences_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_consequences_round" FOREIGN KEY ("round_id")
          REFERENCES "rounds"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_consequences_user" ON "consequences" ("user_id", "issued_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_consequences_round" ON "consequences" ("round_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_consequences_unack" ON "consequences" ("user_id", "acknowledged_at")',
    );

    // --- announcements -----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "announcements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "round_id" uuid,
        "category" varchar(64) NOT NULL,
        "tone" varchar(32) NOT NULL,
        "content" text NOT NULL,
        "voice_url" text,
        "audio_duration_seconds" numeric(6,2),
        "ai_generated" boolean NOT NULL DEFAULT false,
        "quality_gate_passed" boolean NOT NULL DEFAULT false,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "scheduled_for" timestamptz NOT NULL,
        "delivered_at" timestamptz,
        "acknowledged_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_announcements_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_announcements_round" FOREIGN KEY ("round_id")
          REFERENCES "rounds"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_announcements_user_scheduled" ON "announcements" ("user_id", "scheduled_for")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_announcements_round" ON "announcements" ("round_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_announcements_undelivered" ON "announcements" ("user_id", "delivered_at")',
    );

    // --- operational_logs --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "operational_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "round_id" uuid,
        "level" varchar(16) NOT NULL,
        "message" text NOT NULL,
        "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_oplogs_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_oplogs_round" FOREIGN KEY ("round_id")
          REFERENCES "rounds"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_oplogs_user_created" ON "operational_logs" ("user_id", "created_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_oplogs_round" ON "operational_logs" ("round_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_oplogs_level" ON "operational_logs" ("level")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "operational_logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "announcements"');
    await queryRunner.query('DROP TABLE IF EXISTS "consequences"');
    await queryRunner.query('DROP TABLE IF EXISTS "behavioral_records"');
    await queryRunner.query('DROP TABLE IF EXISTS "telemetry_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "event_snapshots"');
    await queryRunner.query('DROP TABLE IF EXISTS "events"');
    await queryRunner.query('DROP TABLE IF EXISTS "rounds"');
    await queryRunner.query('DROP TABLE IF EXISTS "missions"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}

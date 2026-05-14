import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1778793823725 implements MigrationInterface {
    name = 'InitialSchema1778793823725'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "rounds" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "mission_id" varchar NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('scheduled'), "operational_state" varchar(32) NOT NULL DEFAULT ('DORMANT'), "difficulty" text NOT NULL DEFAULT ('{}'), "scheduled_start" datetime NOT NULL, "scheduled_end" datetime NOT NULL, "actual_start" datetime, "actual_end" datetime, "duration_minutes" integer NOT NULL, "stats" text NOT NULL DEFAULT ('{}'), "points_earned" integer NOT NULL DEFAULT (0), "failure_reason" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_rounds_operational_state" ON "rounds" ("operational_state") `);
        await queryRunner.query(`CREATE INDEX "idx_rounds_scheduled_start" ON "rounds" ("scheduled_start") `);
        await queryRunner.query(`CREATE INDEX "idx_rounds_mission" ON "rounds" ("mission_id") `);
        await queryRunner.query(`CREATE INDEX "idx_rounds_user_status" ON "rounds" ("user_id", "status") `);
        await queryRunner.query(`CREATE TABLE "missions" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "title" varchar(200) NOT NULL, "description" text NOT NULL DEFAULT (''), "objectives" text NOT NULL DEFAULT ('[]'), "status" varchar(32) NOT NULL DEFAULT ('draft'), "priority" integer NOT NULL DEFAULT (0), "scheduled_start" datetime, "scheduled_end" datetime, "total_rounds" integer NOT NULL DEFAULT (0), "completed_rounds" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_missions_scheduled_start" ON "missions" ("scheduled_start") `);
        await queryRunner.query(`CREATE INDEX "idx_missions_user_status" ON "missions" ("user_id", "status") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "email" varchar(255) NOT NULL, "password_hash" varchar(255) NOT NULL, "display_name" varchar(100), "reputation_score" integer NOT NULL DEFAULT (0), "current_streak" integer NOT NULL DEFAULT (0), "longest_streak" integer NOT NULL DEFAULT (0), "difficulty_ceiling" integer NOT NULL DEFAULT (3), "preferences" text NOT NULL DEFAULT ('{}'), "is_active" boolean NOT NULL DEFAULT (1), "email_verified_at" datetime, "last_login_at" datetime, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "events" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "round_id" varchar, "event_type" varchar(100) NOT NULL, "event_data" text NOT NULL, "occurred_at" datetime NOT NULL, "received_at" datetime NOT NULL DEFAULT (datetime('now')), "is_processed" boolean NOT NULL DEFAULT (0), "processed_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "idx_events_unprocessed" ON "events" ("is_processed", "event_type") `);
        await queryRunner.query(`CREATE INDEX "idx_events_occurred_at" ON "events" ("occurred_at") `);
        await queryRunner.query(`CREATE INDEX "idx_events_user_round_type" ON "events" ("user_id", "round_id", "event_type") `);
        await queryRunner.query(`CREATE TABLE "event_snapshots" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "round_id" varchar, "snapshot_at" datetime NOT NULL, "event_count" integer NOT NULL, "state_data" text NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_event_snapshots_user_round" ON "event_snapshots" ("user_id", "round_id", "snapshot_at") `);
        await queryRunner.query(`CREATE TABLE "behavioral_records" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "round_id" varchar, "period_start" datetime NOT NULL, "period_end" datetime NOT NULL, "total_focus_minutes" integer NOT NULL DEFAULT (0), "total_idle_minutes" integer NOT NULL DEFAULT (0), "app_switches" integer NOT NULL DEFAULT (0), "productive_apps_active" integer NOT NULL DEFAULT (0), "distractions_detected" integer NOT NULL DEFAULT (0), "git_commits" integer NOT NULL DEFAULT (0), "ide_activity_minutes" integer NOT NULL DEFAULT (0), "terminal_commands" integer NOT NULL DEFAULT (0), "productivity_score" numeric(5,4) NOT NULL DEFAULT (0), "anomaly_flags" text NOT NULL DEFAULT ('[]'), "event_count" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_behavioral_period" ON "behavioral_records" ("period_start", "period_end") `);
        await queryRunner.query(`CREATE INDEX "idx_behavioral_user_round" ON "behavioral_records" ("user_id", "round_id") `);
        await queryRunner.query(`CREATE TABLE "consequences" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "round_id" varchar, "consequence_type" varchar(64) NOT NULL, "severity" varchar(32) NOT NULL, "description" text NOT NULL, "reputation_delta" integer NOT NULL DEFAULT (0), "metadata" text NOT NULL DEFAULT ('{}'), "acknowledged_at" datetime, "issued_at" datetime NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_consequences_unack" ON "consequences" ("user_id", "acknowledged_at") `);
        await queryRunner.query(`CREATE INDEX "idx_consequences_round" ON "consequences" ("round_id") `);
        await queryRunner.query(`CREATE INDEX "idx_consequences_user" ON "consequences" ("user_id", "issued_at") `);
        await queryRunner.query(`CREATE TABLE "announcements" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "round_id" varchar, "category" varchar(64) NOT NULL, "tone" varchar(32) NOT NULL, "content" text NOT NULL, "voice_url" text, "audio_duration_seconds" numeric(6,2), "ai_generated" boolean NOT NULL DEFAULT (0), "quality_gate_passed" boolean NOT NULL DEFAULT (0), "metadata" text NOT NULL DEFAULT ('{}'), "scheduled_for" datetime NOT NULL, "delivered_at" datetime, "acknowledged_at" datetime, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_announcements_undelivered" ON "announcements" ("user_id", "delivered_at") `);
        await queryRunner.query(`CREATE INDEX "idx_announcements_round" ON "announcements" ("round_id") `);
        await queryRunner.query(`CREATE INDEX "idx_announcements_user_scheduled" ON "announcements" ("user_id", "scheduled_for") `);
        await queryRunner.query(`CREATE TABLE "operational_logs" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "round_id" varchar, "level" varchar(16) NOT NULL, "message" text NOT NULL, "context" text NOT NULL DEFAULT ('{}'), "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_oplogs_level" ON "operational_logs" ("level") `);
        await queryRunner.query(`CREATE INDEX "idx_oplogs_round" ON "operational_logs" ("round_id") `);
        await queryRunner.query(`CREATE INDEX "idx_oplogs_user_created" ON "operational_logs" ("user_id", "created_at") `);
        await queryRunner.query(`DROP INDEX "idx_rounds_operational_state"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_scheduled_start"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_mission"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_user_status"`);
        await queryRunner.query(`CREATE TABLE "temporary_rounds" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "mission_id" varchar NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('scheduled'), "operational_state" varchar(32) NOT NULL DEFAULT ('DORMANT'), "difficulty" text NOT NULL DEFAULT ('{}'), "scheduled_start" datetime NOT NULL, "scheduled_end" datetime NOT NULL, "actual_start" datetime, "actual_end" datetime, "duration_minutes" integer NOT NULL, "stats" text NOT NULL DEFAULT ('{}'), "points_earned" integer NOT NULL DEFAULT (0), "failure_reason" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b2aaff59c6ee65d95796af74211" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_e8f597ac1a7c36c7c1ce7ecf28e" FOREIGN KEY ("mission_id") REFERENCES "missions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_rounds"("id", "user_id", "mission_id", "status", "operational_state", "difficulty", "scheduled_start", "scheduled_end", "actual_start", "actual_end", "duration_minutes", "stats", "points_earned", "failure_reason", "created_at", "updated_at") SELECT "id", "user_id", "mission_id", "status", "operational_state", "difficulty", "scheduled_start", "scheduled_end", "actual_start", "actual_end", "duration_minutes", "stats", "points_earned", "failure_reason", "created_at", "updated_at" FROM "rounds"`);
        await queryRunner.query(`DROP TABLE "rounds"`);
        await queryRunner.query(`ALTER TABLE "temporary_rounds" RENAME TO "rounds"`);
        await queryRunner.query(`CREATE INDEX "idx_rounds_operational_state" ON "rounds" ("operational_state") `);
        await queryRunner.query(`CREATE INDEX "idx_rounds_scheduled_start" ON "rounds" ("scheduled_start") `);
        await queryRunner.query(`CREATE INDEX "idx_rounds_mission" ON "rounds" ("mission_id") `);
        await queryRunner.query(`CREATE INDEX "idx_rounds_user_status" ON "rounds" ("user_id", "status") `);
        await queryRunner.query(`DROP INDEX "idx_missions_scheduled_start"`);
        await queryRunner.query(`DROP INDEX "idx_missions_user_status"`);
        await queryRunner.query(`CREATE TABLE "temporary_missions" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "title" varchar(200) NOT NULL, "description" text NOT NULL DEFAULT (''), "objectives" text NOT NULL DEFAULT ('[]'), "status" varchar(32) NOT NULL DEFAULT ('draft'), "priority" integer NOT NULL DEFAULT (0), "scheduled_start" datetime, "scheduled_end" datetime, "total_rounds" integer NOT NULL DEFAULT (0), "completed_rounds" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_26b3e696670dcf919be98f550e5" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_missions"("id", "user_id", "title", "description", "objectives", "status", "priority", "scheduled_start", "scheduled_end", "total_rounds", "completed_rounds", "created_at", "updated_at") SELECT "id", "user_id", "title", "description", "objectives", "status", "priority", "scheduled_start", "scheduled_end", "total_rounds", "completed_rounds", "created_at", "updated_at" FROM "missions"`);
        await queryRunner.query(`DROP TABLE "missions"`);
        await queryRunner.query(`ALTER TABLE "temporary_missions" RENAME TO "missions"`);
        await queryRunner.query(`CREATE INDEX "idx_missions_scheduled_start" ON "missions" ("scheduled_start") `);
        await queryRunner.query(`CREATE INDEX "idx_missions_user_status" ON "missions" ("user_id", "status") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "idx_missions_user_status"`);
        await queryRunner.query(`DROP INDEX "idx_missions_scheduled_start"`);
        await queryRunner.query(`ALTER TABLE "missions" RENAME TO "temporary_missions"`);
        await queryRunner.query(`CREATE TABLE "missions" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "title" varchar(200) NOT NULL, "description" text NOT NULL DEFAULT (''), "objectives" text NOT NULL DEFAULT ('[]'), "status" varchar(32) NOT NULL DEFAULT ('draft'), "priority" integer NOT NULL DEFAULT (0), "scheduled_start" datetime, "scheduled_end" datetime, "total_rounds" integer NOT NULL DEFAULT (0), "completed_rounds" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "missions"("id", "user_id", "title", "description", "objectives", "status", "priority", "scheduled_start", "scheduled_end", "total_rounds", "completed_rounds", "created_at", "updated_at") SELECT "id", "user_id", "title", "description", "objectives", "status", "priority", "scheduled_start", "scheduled_end", "total_rounds", "completed_rounds", "created_at", "updated_at" FROM "temporary_missions"`);
        await queryRunner.query(`DROP TABLE "temporary_missions"`);
        await queryRunner.query(`CREATE INDEX "idx_missions_user_status" ON "missions" ("user_id", "status") `);
        await queryRunner.query(`CREATE INDEX "idx_missions_scheduled_start" ON "missions" ("scheduled_start") `);
        await queryRunner.query(`DROP INDEX "idx_rounds_user_status"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_mission"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_scheduled_start"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_operational_state"`);
        await queryRunner.query(`ALTER TABLE "rounds" RENAME TO "temporary_rounds"`);
        await queryRunner.query(`CREATE TABLE "rounds" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "mission_id" varchar NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('scheduled'), "operational_state" varchar(32) NOT NULL DEFAULT ('DORMANT'), "difficulty" text NOT NULL DEFAULT ('{}'), "scheduled_start" datetime NOT NULL, "scheduled_end" datetime NOT NULL, "actual_start" datetime, "actual_end" datetime, "duration_minutes" integer NOT NULL, "stats" text NOT NULL DEFAULT ('{}'), "points_earned" integer NOT NULL DEFAULT (0), "failure_reason" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "rounds"("id", "user_id", "mission_id", "status", "operational_state", "difficulty", "scheduled_start", "scheduled_end", "actual_start", "actual_end", "duration_minutes", "stats", "points_earned", "failure_reason", "created_at", "updated_at") SELECT "id", "user_id", "mission_id", "status", "operational_state", "difficulty", "scheduled_start", "scheduled_end", "actual_start", "actual_end", "duration_minutes", "stats", "points_earned", "failure_reason", "created_at", "updated_at" FROM "temporary_rounds"`);
        await queryRunner.query(`DROP TABLE "temporary_rounds"`);
        await queryRunner.query(`CREATE INDEX "idx_rounds_user_status" ON "rounds" ("user_id", "status") `);
        await queryRunner.query(`CREATE INDEX "idx_rounds_mission" ON "rounds" ("mission_id") `);
        await queryRunner.query(`CREATE INDEX "idx_rounds_scheduled_start" ON "rounds" ("scheduled_start") `);
        await queryRunner.query(`CREATE INDEX "idx_rounds_operational_state" ON "rounds" ("operational_state") `);
        await queryRunner.query(`DROP INDEX "idx_oplogs_user_created"`);
        await queryRunner.query(`DROP INDEX "idx_oplogs_round"`);
        await queryRunner.query(`DROP INDEX "idx_oplogs_level"`);
        await queryRunner.query(`DROP TABLE "operational_logs"`);
        await queryRunner.query(`DROP INDEX "idx_announcements_user_scheduled"`);
        await queryRunner.query(`DROP INDEX "idx_announcements_round"`);
        await queryRunner.query(`DROP INDEX "idx_announcements_undelivered"`);
        await queryRunner.query(`DROP TABLE "announcements"`);
        await queryRunner.query(`DROP INDEX "idx_consequences_user"`);
        await queryRunner.query(`DROP INDEX "idx_consequences_round"`);
        await queryRunner.query(`DROP INDEX "idx_consequences_unack"`);
        await queryRunner.query(`DROP TABLE "consequences"`);
        await queryRunner.query(`DROP INDEX "idx_behavioral_user_round"`);
        await queryRunner.query(`DROP INDEX "idx_behavioral_period"`);
        await queryRunner.query(`DROP TABLE "behavioral_records"`);
        await queryRunner.query(`DROP INDEX "idx_event_snapshots_user_round"`);
        await queryRunner.query(`DROP TABLE "event_snapshots"`);
        await queryRunner.query(`DROP INDEX "idx_events_user_round_type"`);
        await queryRunner.query(`DROP INDEX "idx_events_occurred_at"`);
        await queryRunner.query(`DROP INDEX "idx_events_unprocessed"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`DROP INDEX "idx_users_email"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "idx_missions_user_status"`);
        await queryRunner.query(`DROP INDEX "idx_missions_scheduled_start"`);
        await queryRunner.query(`DROP TABLE "missions"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_user_status"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_mission"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_scheduled_start"`);
        await queryRunner.query(`DROP INDEX "idx_rounds_operational_state"`);
        await queryRunner.query(`DROP TABLE "rounds"`);
    }

}

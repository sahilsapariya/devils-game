import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchemaTelemetry1778793829415 implements MigrationInterface {
    name = 'InitialSchemaTelemetry1778793829415'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "telemetry_events" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "round_id" varchar, "source" varchar(32) NOT NULL, "device_id" varchar(128) NOT NULL, "event_type" varchar(64) NOT NULL, "payload" text NOT NULL, "is_productive" boolean, "confidence_score" numeric(4,3), "occurred_at" datetime NOT NULL, "received_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_telemetry_device" ON "telemetry_events" ("device_id") `);
        await queryRunner.query(`CREATE INDEX "idx_telemetry_user_type_occurred" ON "telemetry_events" ("user_id", "event_type", "occurred_at") `);
        await queryRunner.query(`CREATE INDEX "idx_telemetry_occurred_at" ON "telemetry_events" ("occurred_at") `);
        await queryRunner.query(`CREATE INDEX "idx_telemetry_user_round" ON "telemetry_events" ("user_id", "round_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "idx_telemetry_user_round"`);
        await queryRunner.query(`DROP INDEX "idx_telemetry_occurred_at"`);
        await queryRunner.query(`DROP INDEX "idx_telemetry_user_type_occurred"`);
        await queryRunner.query(`DROP INDEX "idx_telemetry_device"`);
        await queryRunner.query(`DROP TABLE "telemetry_events"`);
    }

}

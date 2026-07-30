import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogsTable1785250000000 implements MigrationInterface {
  name = 'CreateAuditLogsTable1785250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL,
        "actor_type" character varying(20) NOT NULL,
        "actor_id" character varying(100),
        "action" character varying(100) NOT NULL,
        "method" character varying(10) NOT NULL,
        "route" character varying(500) NOT NULL,
        "entity_type" character varying(100) NOT NULL,
        "entity_id" character varying(100),
        "before_data" jsonb,
        "after_data" jsonb,
        "changes" jsonb,
        "status_code" integer NOT NULL,
        "duration_ms" integer NOT NULL,
        "ip_address" character varying(100),
        "user_agent" character varying(1000),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_logs_actor_created_at"
      ON "audit_logs" ("actor_type", "actor_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_logs_entity_created_at"
      ON "audit_logs" ("entity_type", "entity_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_logs_request_id"
      ON "audit_logs" ("request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_logs_created_at"
      ON "audit_logs" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "audit_logs"');
  }
}

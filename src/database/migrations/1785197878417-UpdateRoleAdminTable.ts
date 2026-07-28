import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateRoleAdminTable1785197878417 implements MigrationInterface {
    name = 'UpdateRoleAdminTable1785197878417'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0d37c735ae63ef083c76754c8e" ON "admins_roles"  ("admin_id", "role_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_0d37c735ae63ef083c76754c8e"`);
    }

}

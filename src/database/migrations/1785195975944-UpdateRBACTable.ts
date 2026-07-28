import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateRBACTable1785195975944 implements MigrationInterface {
    name = 'UpdateRBACTable1785195975944'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "admins_roles" ("id" SERIAL NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "admin_id" integer NOT NULL, "role_id" integer NOT NULL, CONSTRAINT "PK_8e64d5b3bcf67338d90a2319690" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "isActive"`);
        await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "isSuperAdmin"`);
        await queryRunner.query(`ALTER TABLE "admins" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "admins" ADD "is_super_admin" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "admins_roles" ADD CONSTRAINT "FK_e1ca492de85beaecba0f6927ead" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "admins_roles" ADD CONSTRAINT "FK_687f8290d1c81f9915577cfb641" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "admins_roles" DROP CONSTRAINT "FK_687f8290d1c81f9915577cfb641"`);
        await queryRunner.query(`ALTER TABLE "admins_roles" DROP CONSTRAINT "FK_e1ca492de85beaecba0f6927ead"`);
        await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "is_super_admin"`);
        await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "admins" ADD "isSuperAdmin" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "admins" ADD "isActive" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`DROP TABLE "admins_roles"`);
    }

}

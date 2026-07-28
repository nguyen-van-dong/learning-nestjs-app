import { MigrationInterface, QueryRunner } from "typeorm";

export class GenerateRBACTable1785195776516 implements MigrationInterface {
    name = 'GenerateRBACTable1785195776516'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "admins" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "email" character varying(100) NOT NULL, "password" character varying(100) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "isSuperAdmin" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_eb3faa75323e2738a5a2bd8f8ba" UNIQUE ("name"), CONSTRAINT "UQ_051db7d37d478a69a7432df1479" UNIQUE ("email"), CONSTRAINT "UQ_f41c8a774070602c46cb6ba40da" UNIQUE ("password"), CONSTRAINT "PK_e3b38270c97a854c48d2e80874e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "admins-roles" ("id" SERIAL NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "adminId" integer NOT NULL, "roleId" integer NOT NULL, CONSTRAINT "PK_08c8da7c14c4567b91515c5b72f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "admins-roles" ADD CONSTRAINT "FK_cecc4e195bf33112c765365c36d" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "admins-roles" ADD CONSTRAINT "FK_8e084d74ece3d7113787565aa29" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "admins-roles" DROP CONSTRAINT "FK_8e084d74ece3d7113787565aa29"`);
        await queryRunner.query(`ALTER TABLE "admins-roles" DROP CONSTRAINT "FK_cecc4e195bf33112c765365c36d"`);
        await queryRunner.query(`DROP TABLE "admins-roles"`);
        await queryRunner.query(`DROP TABLE "admins"`);
    }

}

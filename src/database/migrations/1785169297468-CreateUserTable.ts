import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserTable1785169297468 implements MigrationInterface {
    name = 'CreateUserTable1785169297468'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user', 'moderator')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "password" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "is_active" boolean NOT NULL DEFAULT false, "email_verified_at" TIMESTAMP, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "email_verification_tokens" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP NOT NULL, "used_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_417a095bbed21c2369a6a01ab9a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fdcb77f72f529bf65c95d72a14" ON "email_verification_tokens"  ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c20ed35f3d31d486aabcd0564d" ON "email_verification_tokens"  ("token_hash") `);
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_52ac39dd8a28730c63aeb428c9" ON "password_reset_tokens"  ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_91185d86d5d7557b19abbb2868" ON "password_reset_tokens"  ("token_hash") `);
        await queryRunner.query(`ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "FK_fdcb77f72f529bf65c95d72a147" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`);
        await queryRunner.query(`ALTER TABLE "email_verification_tokens" DROP CONSTRAINT "FK_fdcb77f72f529bf65c95d72a147"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_91185d86d5d7557b19abbb2868"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_52ac39dd8a28730c63aeb428c9"`);
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c20ed35f3d31d486aabcd0564d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fdcb77f72f529bf65c95d72a14"`);
        await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }
}

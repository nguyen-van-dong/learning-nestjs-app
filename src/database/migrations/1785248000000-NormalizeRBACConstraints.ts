import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeRBACConstraints1785248000000 implements MigrationInterface {
  name = 'NormalizeRBACConstraints1785248000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admins" DROP CONSTRAINT "UQ_f41c8a774070602c46cb6ba40da"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_b4599f8b8f548d35850afa2d12c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_06792d0c62ce6b0203c03643cdd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "UQ_d430a02aad006d8a70f3acd7d03"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" RENAME COLUMN "roleId" TO "role_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" RENAME COLUMN "permissionId" TO "permission_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ALTER COLUMN "role_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ALTER COLUMN "permission_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "UQ_role_permission" UNIQUE ("role_id", "permission_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_role_permission_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_role_permission_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_role_permission_permission"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_role_permission_role"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "UQ_role_permission"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ALTER COLUMN "permission_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ALTER COLUMN "role_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" RENAME COLUMN "permission_id" TO "permissionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" RENAME COLUMN "role_id" TO "roleId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "UQ_d430a02aad006d8a70f3acd7d03" UNIQUE ("roleId", "permissionId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_b4599f8b8f548d35850afa2d12c" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_06792d0c62ce6b0203c03643cdd" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "admins" ADD CONSTRAINT "UQ_f41c8a774070602c46cb6ba40da" UNIQUE ("password")`,
    );
  }
}

import { DataSource, In } from 'typeorm';
import { Permission } from '../../user/permission.entity';
import { RolePermission } from '../../user/role-permission.entity';
import { Role } from '../../user/role.entity';

export async function seedRolePermissions(
  dataSource: DataSource,
): Promise<void> {
  const roleRepository = dataSource.getRepository(Role);
  const permissionRepository = dataSource.getRepository(Permission);
  const rolePermissionRepository = dataSource.getRepository(RolePermission);

  const adminRole = await roleRepository.findOneBy({ name: 'admin' });
  const permissions = await permissionRepository.find();

  if (!adminRole || permissions.length === 0) {
    return;
  }

  const existingRolePermissions = await rolePermissionRepository.find({
    where: {
      role: { id: adminRole.id },
      permission: { id: In(permissions.map(({ id }) => id)) },
    },
    relations: {
      permission: true,
    },
  });
  const assignedPermissionIds = new Set(
    existingRolePermissions.map(({ permission }) => permission.id),
  );

  const missingRolePermissions = permissions
    .filter(({ id }) => !assignedPermissionIds.has(id))
    .map((permission) =>
      rolePermissionRepository.create({
        role: adminRole,
        permission,
      }),
    );

  if (missingRolePermissions.length > 0) {
    await rolePermissionRepository.save(missingRolePermissions);
  }
}

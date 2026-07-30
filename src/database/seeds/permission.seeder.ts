import { DataSource } from 'typeorm';
import { Permission } from 'src/user/permission.entity';

export async function seedPermissions(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getRepository(Permission);

  await repository.upsert(
    [
      { name: 'user.read', description: 'Read user data' },
      { name: 'user.update', description: 'Update user data' },
      { name: 'user.delete', description: 'Delete user data' },
      { name: 'role.read', description: 'Read role data' },
      { name: 'role.update', description: 'Update role data' },
      { name: 'role.delete', description: 'Delete role data' },
      { name: 'permission.read', description: 'Read permission data' },
      { name: 'permission.update', description: 'Update permission data' },
      { name: 'permission.delete', description: 'Delete permission data' },
      { name: 'audit-log.read', description: 'Read audit logs' },
    ],
    {
      conflictPaths: ['name'],
      skipUpdateIfNoValuesChanged: true,
    },
  );
}

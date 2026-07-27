import { DataSource } from 'typeorm';
import { Role } from '../../user/role.entity';

export async function seedRoles(
  dataSource: DataSource,
): Promise<void> {
  const repository = dataSource.getRepository(Role);

  await repository.upsert(
    [
      { name: 'admin' },
      { name: 'user' },
      { name: 'moderator' },
    ],
    {
      conflictPaths: ['name'],
      skipUpdateIfNoValuesChanged: true,
    },
  );
}

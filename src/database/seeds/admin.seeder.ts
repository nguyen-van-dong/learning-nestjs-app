import bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Admin } from '../../user/admin.entity';

export async function seedAdmin(
  dataSource: DataSource,
): Promise<void> {
  const repository = dataSource.getRepository(Admin);

  const existingAdmin = await repository.findOne({
    where: {
      email: 'admin@admin.com',
    },
  });

  if (existingAdmin) {
    return;
  }

  await repository.save(
    repository.create({
      name: 'Administrator',
      email: 'admin@admin.com',
      password: await bcrypt.hash('Dong@1994', 12),
      is_active: true,
      is_super_admin: true,
    }),
  );
}

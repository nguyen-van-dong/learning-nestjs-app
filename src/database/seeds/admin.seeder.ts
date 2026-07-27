import bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { User } from '../../user/user.entity';
import { UserRole } from 'src/user/user-role.enum';

export async function seedAdmin(
  dataSource: DataSource,
): Promise<void> {
  const repository = dataSource.getRepository(User);

  const existingAdmin = await repository.findOne({
    where: {
      email: 'admin@admin.com',
    },
  });

  if (existingAdmin) {
    return;
  }

  const password = await bcrypt.hash('Dong@1994', 12);

  await repository.save(
    repository.create({
      name: 'Administrator',
      email: 'admin@admin.com',
      password,
      is_active: true,
      role: UserRole.ADMIN,
    }),
  );
}

import dataSource from '../data-source';
import { seedRoles } from './role.seeder';
import { seedAdmin } from './admin.seeder';
import { seedPermissions } from './permission.seeder';
import { seedRolePermissions } from './role-permission.seeder';

async function seed(): Promise<void> {
  try {
    await dataSource.initialize();

    await seedRoles(dataSource);
    await seedAdmin(dataSource);
    await seedPermissions(dataSource);
    await seedRolePermissions(dataSource);

    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void seed();

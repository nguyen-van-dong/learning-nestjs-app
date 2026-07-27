import dataSource from '../data-source';
import { seedRoles } from './role.seeder';
import { seedAdmin } from './admin.seeder';

async function seed(): Promise<void> {
  try {
    await dataSource.initialize();

    await seedRoles(dataSource);
    await seedAdmin(dataSource);

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

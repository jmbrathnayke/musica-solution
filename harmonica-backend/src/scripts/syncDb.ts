import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../config/database';

dotenv.config();

// This script uses TypeORM synchronize to create/update tables automatically
// Use ONLY for development. Use migrations for production.
async function syncDb() {
  const dataSource = new (require('typeorm').DataSource)({
    ...AppDataSource.options,
    synchronize: true, // Auto-create tables from entities
    logging: true,
  });

  await dataSource.initialize();
  console.log('✅ Database schema synchronized');
  await dataSource.destroy();
}

syncDb().catch((err) => {
  console.error('❌ DB sync failed:', err);
  process.exit(1);
});

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import bcrypt from 'bcryptjs';

dotenv.config();

async function seed() {
  console.log('🌱 Starting database seed...');

  await AppDataSource.initialize();
  console.log('✅ Connected to NeonDB');

  const userRepo = AppDataSource.getRepository(User);

  // Check if demo user already exists
  const existing = await userRepo.findOne({ where: { email: 'demo@harmonica.app' } });

  if (!existing) {
    const passwordHash = await bcrypt.hash('demo1234', 12);
    const demoUser = userRepo.create({
      email: 'demo@harmonica.app',
      passwordHash,
      displayName: 'Demo DJ',
    });
    await userRepo.save(demoUser);
    console.log('✅ Demo user created: demo@harmonica.app / demo1234');
  } else {
    console.log('ℹ️  Demo user already exists, skipping');
  }

  await AppDataSource.destroy();
  console.log('🎉 Seed complete');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});

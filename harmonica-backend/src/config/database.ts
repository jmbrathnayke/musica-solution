import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../entities/User';
import { Track } from '../entities/Track';
import { Playlist } from '../entities/Playlist';
import { PlaylistTrack } from '../entities/PlaylistTrack';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for NeonDB
  },
  entities: [User, Track, Playlist, PlaylistTrack],
  migrations: ['src/migrations/*.ts'],
  synchronize: false, // Use migrations in production
  logging: process.env.NODE_ENV === 'development',
});

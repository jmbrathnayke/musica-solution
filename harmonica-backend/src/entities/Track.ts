import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { PlaylistTrack } from './PlaylistTrack';

export type AnalysisStatus = 'pending' | 'analyzing' | 'done' | 'error';

@Entity('tracks')
export class Track {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.tracks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 255, nullable: true })
  title: string;

  @Column({ length: 255, nullable: true })
  artist: string;

  @Column({ name: 'blob_url', type: 'text' })
  blobUrl: string;

  @Column({ name: 'filename_original', length: 255, nullable: true })
  filenameOriginal: string;

  @Column({ name: 'duration_seconds', type: 'float', nullable: true })
  durationSeconds: number;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes: number;

  // ─── Analysis Results ───────────────────────────────────────────────────────

  @Column({ type: 'float', nullable: true })
  bpm: number;

  @Column({ name: 'musical_key', length: 10, nullable: true })
  musicalKey: string; // e.g. "Am", "Cmaj"

  @Column({ name: 'camelot_key', length: 3, nullable: true })
  camelotKey: string; // e.g. "8A", "6B"

  @Column({ type: 'float', nullable: true })
  energy: number; // 0.0 – 1.0

  @Column({ type: 'float', nullable: true })
  lows: number; // 0.0 – 1.0

  @Column({ type: 'float', nullable: true })
  mids: number; // 0.0 – 1.0

  @Column({ type: 'float', nullable: true })
  highs: number; // 0.0 – 1.0

  @Column({ name: 'waveform_data', type: 'jsonb', nullable: true })
  waveformData: number[]; // ~1000 amplitude points

  @Column({
    name: 'analysis_status',
    length: 20,
    default: 'pending',
  })
  analysisStatus: AnalysisStatus;

  @Column({ name: 'analysis_error', type: 'text', nullable: true })
  analysisError: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => PlaylistTrack, (pt) => pt.track)
  playlistTracks: PlaylistTrack[];
}

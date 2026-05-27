import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Playlist } from './Playlist';
import { Track } from './Track';

@Entity('playlist_tracks')
@Unique(['playlistId', 'position'])
export class PlaylistTrack {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'playlist_id' })
  playlistId: string;

  @ManyToOne(() => Playlist, (playlist) => playlist.playlistTracks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'playlist_id' })
  playlist: Playlist;

  @Column({ name: 'track_id' })
  trackId: string;

  @ManyToOne(() => Track, (track) => track.playlistTracks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'track_id' })
  track: Track;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'key_compatibility', length: 20, nullable: true })
  keyCompatibility: string; // 'compatible' | 'moderate' | 'incompatible'

  @Column({ name: 'bpm_delta', type: 'float', nullable: true })
  bpmDelta: number;
}

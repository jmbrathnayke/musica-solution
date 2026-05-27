import { Router, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Playlist } from '../entities/Playlist';
import { PlaylistTrack } from '../entities/PlaylistTrack';
import { Track } from '../entities/Track';
import { authGuard, AuthRequest } from '../middleware/authGuard';
import fetch from 'node-fetch';
import archiver from 'archiver';
import path from 'path';
import { URL } from 'url';

const router = Router();
const playlistRepo = () => AppDataSource.getRepository(Playlist);
const playlistTrackRepo = () => AppDataSource.getRepository(PlaylistTrack);

// Helper function to check Camelot Wheel key compatibility
export function checkKeyCompatibility(keyA: string, keyB: string): 'compatible' | 'moderate' | 'incompatible' {
  if (!keyA || !keyB) return 'incompatible';
  if (keyA === keyB) return 'compatible';

  const numA = parseInt(keyA.slice(0, -1));
  const letterA = keyA.slice(-1);
  const numB = parseInt(keyB.slice(0, -1));
  const letterB = keyB.slice(-1);

  if (isNaN(numA) || isNaN(numB)) return 'incompatible';

  const numDiff = Math.abs(numA - numB);
  const isNumericAdjacent = numDiff === 1 || numDiff === 11; // 12-hour wrap around

  if (numA === numB && letterA !== letterB) {
    return 'compatible'; // e.g. 8A -> 8B
  }

  if (isNumericAdjacent && letterA === letterB) {
    return 'compatible'; // e.g. 8A -> 9A
  }

  if (isNumericAdjacent && letterA !== letterB) {
    return 'moderate'; // e.g. 8A -> 9B or 8A -> 7B
  }

  return 'incompatible';
}

// ─── GET /api/playlists — List user's playlists ──────────────────────────────
router.get('/', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const playlists = await playlistRepo().find({
      where: { userId: req.userId! },
      relations: ['playlistTracks', 'playlistTracks.track'],
      order: { createdAt: 'DESC' },
    });

    // Sort tracks inside playlist by position
    playlists.forEach((p) => {
      p.playlistTracks.sort((a, b) => a.position - b.position);
    });

    res.json(playlists);
  } catch (err) {
    console.error('[PLAYLISTS] Get error:', err);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// ─── POST /api/playlists — Create a playlist ─────────────────────────────────
router.post('/', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Playlist name is required' });
      return;
    }

    const playlist = playlistRepo().create({
      userId: req.userId!,
      name,
    });

    await playlistRepo().save(playlist);
    res.status(201).json(playlist);
  } catch (err) {
    console.error('[PLAYLISTS] Create error:', err);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// ─── GET /api/playlists/:id — Detailed view with compatibility metrics ────────
router.get('/:id', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const playlist = await playlistRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
      relations: ['playlistTracks', 'playlistTracks.track'],
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    playlist.playlistTracks.sort((a, b) => a.position - b.position);

    // Calculate transition characteristics on-the-fly between consecutive tracks
    const tracksWithTransitions = playlist.playlistTracks.map((pt, index) => {
      const currentTrack = pt.track;
      const nextPt = playlist.playlistTracks[index + 1];
      const nextTrack = nextPt?.track;

      let keyCompatibility: 'compatible' | 'moderate' | 'incompatible' | null = null;
      let bpmDelta: number | null = null;

      if (currentTrack && nextTrack) {
        if (currentTrack.camelotKey && nextTrack.camelotKey) {
          keyCompatibility = checkKeyCompatibility(currentTrack.camelotKey, nextTrack.camelotKey);
        }
        if (currentTrack.bpm !== null && nextTrack.bpm !== null) {
          bpmDelta = Math.round((nextTrack.bpm - currentTrack.bpm) * 10) / 10;
        }
      }

      // Merge and save cached compatibility metrics inside standard response payload
      return {
        ...pt,
        keyCompatibility,
        bpmDelta,
      };
    });

    res.json({
      ...playlist,
      playlistTracks: tracksWithTransitions,
    });
  } catch (err) {
    console.error('[PLAYLISTS] Get detailed error:', err);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// ─── PUT /api/playlists/:id/tracks — Update playlist composition (drag & drop) ───
router.put('/:id/tracks', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { trackIds } = req.body as { trackIds: string[] };
    const playlistId = req.params.id;

    if (!Array.isArray(trackIds)) {
      res.status(400).json({ error: 'trackIds array is required' });
      return;
    }

    // Verify playlist belongs to current user
    const playlist = await queryRunner.manager.findOne(Playlist, {
      where: { id: playlistId, userId: req.userId! },
    });

    if (!playlist) {
      await queryRunner.rollbackTransaction();
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    // Delete existing playlist associations
    await queryRunner.manager.delete(PlaylistTrack, { playlistId });

    // Build new playlist track positions
    const playlistTracks = trackIds.map((trackId, index) => {
      return queryRunner.manager.create(PlaylistTrack, {
        playlistId,
        trackId,
        position: index + 1,
      });
    });

    await queryRunner.manager.save(PlaylistTrack, playlistTracks);
    await queryRunner.commitTransaction();

    // Fetch and return the updated detailed structure
    const updatedPlaylist = await playlistRepo().findOne({
      where: { id: playlistId },
      relations: ['playlistTracks', 'playlistTracks.track'],
    });

    if (updatedPlaylist) {
      updatedPlaylist.playlistTracks.sort((a, b) => a.position - b.position);
    }

    res.json(updatedPlaylist);
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('[PLAYLISTS] Reorder error:', err);
    res.status(500).json({ error: 'Failed to update playlist tracks' });
  } finally {
    await queryRunner.release();
  }
});

// ─── POST /api/playlists/generate — Auto recommendation engine ───────────────
router.post('/generate', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { seedTrackId, targetLength = 10, name = 'Harmonic Generation' } = req.body;
    if (!seedTrackId) {
      res.status(400).json({ error: 'seedTrackId is required' });
      return;
    }

    const seedTrack = await AppDataSource.getRepository(Track).findOne({
      where: { id: seedTrackId, userId: req.userId! },
    });

    if (!seedTrack) {
      res.status(404).json({ error: 'Seed track not found' });
      return;
    }

    // Retrieve all completed tracks inside user library
    const allTracks = await AppDataSource.getRepository(Track).find({
      where: { userId: req.userId!, analysisStatus: 'done' },
    });

    const playlistTracks: Track[] = [seedTrack];
    const usedIds = new Set<string>([seedTrack.id]);

    while (playlistTracks.length < targetLength) {
      const lastTrack = playlistTracks[playlistTracks.length - 1];
      let bestCandidate: Track | null = null;
      let lowestPenalty = Infinity;

      for (const candidate of allTracks) {
        if (usedIds.has(candidate.id)) continue;
        if (!candidate.camelotKey || candidate.bpm === null) continue;
        if (!lastTrack.camelotKey || lastTrack.bpm === null) continue;

        const bpmDelta = Math.abs(candidate.bpm - lastTrack.bpm);
        if (bpmDelta > 8) continue; // standard transition limit

        const keyComp = checkKeyCompatibility(lastTrack.camelotKey, candidate.camelotKey);
        if (keyComp === 'incompatible') continue;

        // Scoring rules: Key compatibility penalty + BPM gap penalty
        const keyPenalty = keyComp === 'compatible' ? 0 : 2;
        const penalty = keyPenalty + bpmDelta * 1.5;

        if (penalty < lowestPenalty) {
          lowestPenalty = penalty;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        playlistTracks.push(bestCandidate);
        usedIds.add(bestCandidate.id);
      } else {
        break; // No more compatible track matches found
      }
    }

    // Save generated playlist metadata
    const playlist = playlistRepo().create({
      userId: req.userId!,
      name,
    });
    await playlistRepo().save(playlist);

    const ptEntities = playlistTracks.map((track, index) => {
      return AppDataSource.getRepository(PlaylistTrack).create({
        playlistId: playlist.id,
        trackId: track.id,
        position: index + 1,
      });
    });
    await AppDataSource.getRepository(PlaylistTrack).save(ptEntities);

    res.status(201).json({
      id: playlist.id,
      name: playlist.name,
      tracksCount: playlistTracks.length,
    });
  } catch (err) {
    console.error('[PLAYLISTS] Generation error:', err);
    res.status(500).json({ error: 'Failed to generate playlist' });
  }
});

// ─── DELETE /api/playlists/:id — Delete playlist ─────────────────────────────
router.delete('/:id', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const playlist = await playlistRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    await playlistRepo().remove(playlist);
    res.json({ message: 'Playlist deleted' });
  } catch (err) {
    console.error('[PLAYLISTS] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// ─── GET /api/playlists/:id/export/m3u — Export M3U playlist ─────────────────
router.get('/:id/export/m3u', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const playlist = await playlistRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
      relations: ['playlistTracks', 'playlistTracks.track'],
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    playlist.playlistTracks.sort((a, b) => a.position - b.position);

    let content = '#EXTM3U\n';
    for (const pt of playlist.playlistTracks) {
      if (pt.track) {
        const duration = Math.round(pt.track.durationSeconds || 0);
        content += `#EXTINF:${duration},${pt.track.artist} - ${pt.track.title}\n`;
        content += `${pt.track.blobUrl}\n`;
      }
    }

    const safeName = playlist.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.m3u"`);
    res.send(content);
  } catch (err) {
    console.error('[EXPORT] M3U failed:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── GET /api/playlists/:id/export/csv — Export CSV metadata sheet ────────────
router.get('/:id/export/csv', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const playlist = await playlistRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
      relations: ['playlistTracks', 'playlistTracks.track'],
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    playlist.playlistTracks.sort((a, b) => a.position - b.position);

    let content = 'Position,Title,Artist,BPM,Camelot Key,Musical Key,Duration,Blob URL\n';
    for (const pt of playlist.playlistTracks) {
      const t = pt.track;
      if (t) {
        const title = `"${t.title.replace(/"/g, '""')}"`;
        const artist = `"${t.artist.replace(/"/g, '""')}"`;
        const bpm = t.bpm ? t.bpm.toFixed(1) : '';
        const camelot = t.camelotKey || '';
        const key = t.musicalKey || '';
        const duration = t.durationSeconds ? Math.round(t.durationSeconds) : '';
        content += `${pt.position},${title},${artist},${bpm},${camelot},${key},${duration},${t.blobUrl}\n`;
      }
    }

    const safeName = playlist.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    res.send(content);
  } catch (err) {
    console.error('[EXPORT] CSV failed:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── GET /api/playlists/:id/export/rekordbox — Export Rekordbox XML ──────────
router.get('/:id/export/rekordbox', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const playlist = await playlistRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
      relations: ['playlistTracks', 'playlistTracks.track'],
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    playlist.playlistTracks.sort((a, b) => a.position - b.position);

    let trackNodes = '';
    let playlistNodes = '';

    playlist.playlistTracks.forEach((pt, index) => {
      const t = pt.track;
      if (t) {
        const trackId = index + 1;
        const title = t.title.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const artist = t.artist.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const bpm = t.bpm ? t.bpm.toFixed(2) : '120.00';
        const duration = t.durationSeconds ? Math.round(t.durationSeconds) : '0';
        const key = t.camelotKey || '';
        const size = t.fileSizeBytes || '0';
        const location = t.blobUrl.replace(/&/g, '&amp;');

        trackNodes += `    <TRACK TrackID="${trackId}" Name="${title}" Artist="${artist}" Size="${size}" TotalTime="${duration}" AverageBpm="${bpm}" Key="${key}" Location="${location}" Type="Audio" />\n`;
        playlistNodes += `      <TRACK Key="${trackId}" />\n`;
      }
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="Harmonica Mix Planner" Version="1.0" Company="Antigravity AI" />
  <COLLECTION Entries="${playlist.playlistTracks.length}">
${trackNodes}  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT">
      <NODE Type="1" Name="${playlist.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" Entries="${playlist.playlistTracks.length}">
${playlistNodes}      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`;

    const safeName = playlist.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_rekordbox.xml"`);
    res.send(xml);
  } catch (err) {
    console.error('[EXPORT] Rekordbox failed:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── GET /api/playlists/:id/export/zip — Export complete ZIP archive ─────────
router.get('/:id/export/zip', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const playlist = await playlistRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
      relations: ['playlistTracks', 'playlistTracks.track'],
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    playlist.playlistTracks.sort((a, b) => a.position - b.position);

    const archive = archiver('zip', { zlib: { level: 9 } });
    const safeName = playlist.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

    archive.pipe(res);

    let m3u = '#EXTM3U\n';

    for (const pt of playlist.playlistTracks) {
      const t = pt.track;
      if (t) {
        const duration = Math.round(t.durationSeconds || 0);
        // Extract original extension or default to .mp3
        const parsedUrl = new URL(t.blobUrl);
        const ext = path.extname(parsedUrl.pathname) || '.mp3';
        const fileInZip = `${pt.position.toString().padStart(2, '0')} - ${t.artist} - ${t.title}${ext}`.replace(/[^a-zA-Z0-9.\-_\s]/g, '_');

        m3u += `#EXTINF:${duration},${t.artist} - ${t.title}\n`;
        m3u += `${fileInZip}\n`;

        try {
          const fileResponse = await fetch(t.blobUrl);
          if (fileResponse.ok && fileResponse.body) {
            archive.append(fileResponse.body as any, { name: fileInZip });
          }
        } catch (downloadErr) {
          console.error(`Failed to download ${t.title} for ZIP export:`, downloadErr);
        }
      }
    }

    archive.append(m3u, { name: 'playlist.m3u' });

    await archive.finalize();
  } catch (err) {
    console.error('[EXPORT] ZIP failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'ZIP export failed' });
    }
  }
});

export default router;

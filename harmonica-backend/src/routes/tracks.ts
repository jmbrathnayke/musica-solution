import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Track } from '../entities/Track';
import { authGuard, AuthRequest } from '../middleware/authGuard';
import fetch from 'node-fetch';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const cleanFilename = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${timestamp}_${cleanFilename}`);
  },
});

const upload = multer({ storage });

const router = Router();
const trackRepo = () => AppDataSource.getRepository(Track);

// SSE clients map: userId → response[]
const sseClients: Map<string, Response[]> = new Map();

// Helper: send SSE event to a specific user
export const sendSSEToUser = (userId: string, data: object) => {
  const clients = sseClients.get(userId) || [];
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => res.write(payload));
};

// ─── GET /api/tracks/events — SSE stream ─────────────────────────────────────
router.get('/events', authGuard, (req: AuthRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const userId = req.userId!;
  const existing = sseClients.get(userId) || [];
  sseClients.set(userId, [...existing, res]);

  // Keep alive ping every 30s
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const clients = sseClients.get(userId) || [];
    sseClients.set(
      userId,
      clients.filter((c) => c !== res)
    );
  });
});

// ─── GET /api/tracks/blob-token ──────────────────────────────────────────────
router.get('/blob-token', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filename = req.query.filename as string;
    if (!filename) {
      res.status(400).json({ error: 'filename is required' });
      return;
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN is not configured' });
      return;
    }

    const timestamp = Date.now();
    const cleanFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const pathname = `tracks/${req.userId}/${timestamp}_${cleanFilename}`;

    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
    });

    res.json({ clientToken, pathname });
  } catch (err: any) {
    console.error('[BLOB-TOKEN] Error:', err);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// ─── POST /api/tracks/local-upload — Local file upload fallback ──────────────
router.post('/local-upload', authGuard, upload.single('file'), (req: AuthRequest, res: Response): void => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const host = req.headers.host || 'localhost:4000';
    const protocol = req.secure ? 'https' : 'http';
    const url = `${protocol}://${host}/uploads/${req.file.filename}`;

    res.json({
      url,
      filename: req.file.originalname,
      fileSize: req.file.size,
    });
  } catch (err) {
    console.error('[LOCAL-UPLOAD] Error:', err);
    res.status(500).json({ error: 'Failed to upload locally' });
  }
});

// ─── POST /api/tracks/upload ──────────────────────────────────────────────────
router.post('/upload', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { blobUrl, filename, fileSize, title, artist } = req.body;

    if (!blobUrl) {
      res.status(400).json({ error: 'blobUrl is required' });
      return;
    }

    // Parse title/artist from filename if not provided
    const parsedName = filename?.replace(/\.[^/.]+$/, '') || 'Unknown Track';
    const parts = parsedName.split(' - ');

    const track = trackRepo().create({
      userId: req.userId!,
      blobUrl,
      filenameOriginal: filename,
      fileSizeBytes: fileSize,
      title: title || (parts.length > 1 ? parts.slice(1).join(' - ') : parsedName),
      artist: artist || (parts.length > 1 ? parts[0] : 'Unknown Artist'),
      analysisStatus: 'pending',
    });

    await trackRepo().save(track);

    // Fire-and-forget audio analysis
    triggerAnalysis(track.id, blobUrl, req.userId!);

    res.status(201).json(track);
  } catch (err) {
    console.error('[TRACKS] Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── Trigger Python microservice analysis (async, no await) ──────────────────
async function triggerAnalysis(trackId: string, blobUrl: string, userId: string) {
  const audioServiceUrl = process.env.AUDIO_SERVICE_URL || 'http://localhost:8000';

  try {
    // Update status to "analyzing"
    await trackRepo().update(trackId, { analysisStatus: 'analyzing' });
    sendSSEToUser(userId, { type: 'analysis_status', trackId, status: 'analyzing' });

    const response = await fetch(`${audioServiceUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: trackId, blob_url: blobUrl }),
      signal: AbortSignal.timeout(300000), // 5 min timeout
    });

    if (!response.ok) {
      throw new Error(`Audio service responded with ${response.status}`);
    }

    const result = await response.json() as any;

    await trackRepo().update(trackId, {
      bpm: result.bpm,
      musicalKey: result.musical_key,
      camelotKey: result.camelot_key,
      energy: result.energy,
      lows: result.lows,
      mids: result.mids,
      highs: result.highs,
      waveformData: result.waveform,
      durationSeconds: result.duration_seconds,
      analysisStatus: 'done',
    });

    sendSSEToUser(userId, {
      type: 'analysis_status',
      trackId,
      status: 'done',
      data: result,
    });
  } catch (err: any) {
    console.error(`[ANALYSIS] Failed for track ${trackId}:`, err.message);
    await trackRepo().update(trackId, {
      analysisStatus: 'error',
      analysisError: err.message,
    });
    sendSSEToUser(userId, {
      type: 'analysis_status',
      trackId,
      status: 'error',
      error: err.message,
    });
  }
}

// ─── GET /api/tracks — List with filters ─────────────────────────────────────
router.get('/', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '50',
      search,
      bpm_min,
      bpm_max,
      camelot_key,
    } = req.query as Record<string, string>;

    const qb = trackRepo()
      .createQueryBuilder('track')
      .where('track.user_id = :userId', { userId: req.userId })
      .orderBy('track.created_at', 'DESC')
      .skip((+page - 1) * +limit)
      .take(+limit);

    if (search) {
      qb.andWhere(
        '(LOWER(track.title) LIKE :s OR LOWER(track.artist) LIKE :s)',
        { s: `%${search.toLowerCase()}%` }
      );
    }
    if (bpm_min) qb.andWhere('track.bpm >= :bpm_min', { bpm_min: +bpm_min });
    if (bpm_max) qb.andWhere('track.bpm <= :bpm_max', { bpm_max: +bpm_max });
    if (camelot_key) qb.andWhere('track.camelot_key = :key', { key: camelot_key });

    const [tracks, total] = await qb.getManyAndCount();

    res.json({ tracks, total, page: +page, limit: +limit });
  } catch (err) {
    console.error('[TRACKS] List error:', err);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// ─── GET /api/tracks/:id ──────────────────────────────────────────────────────
router.get('/:id', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const track = await trackRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }
    res.json(track);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch track' });
  }
});

// ─── PATCH /api/tracks/:id — Update metadata ─────────────────────────────────
router.patch('/:id', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const track = await trackRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }
    const { title, artist } = req.body;
    if (title !== undefined) track.title = title;
    if (artist !== undefined) track.artist = artist;
    await trackRepo().save(track);
    res.json(track);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update track' });
  }
});

// ─── POST /api/tracks/:id/reanalyze ─────────────────────────────────────────
router.post('/:id/reanalyze', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const track = await trackRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }
    await trackRepo().update(track.id, { analysisStatus: 'pending', analysisError: undefined });
    triggerAnalysis(track.id, track.blobUrl, req.userId!);
    res.json({ message: 'Reanalysis triggered' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger reanalysis' });
  }
});

// ─── PATCH /api/tracks/:id/analysis — Internal endpoint for Python service ───
router.patch('/:id/analysis', async (req: Request, res: Response): Promise<void> => {
  // This is called by the Python microservice (internal, localhost only)
  try {
    const { bpm, musical_key, camelot_key, energy, lows, mids, highs, waveform, duration_seconds } = req.body;
    await trackRepo().update(req.params.id, {
      bpm,
      musicalKey: musical_key,
      camelotKey: camelot_key,
      energy,
      lows,
      mids,
      highs,
      waveformData: waveform,
      durationSeconds: duration_seconds,
      analysisStatus: 'done',
    });
    res.json({ message: 'Analysis saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save analysis' });
  }
});

// ─── DELETE /api/tracks/:id ───────────────────────────────────────────────────
router.delete('/:id', authGuard, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const track = await trackRepo().findOne({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    // Delete from Vercel Blob
    try {
      const { del } = await import('@vercel/blob');
      await del(track.blobUrl);
    } catch (blobErr) {
      console.warn('[TRACKS] Blob deletion failed:', blobErr);
    }

    await trackRepo().remove(track);
    res.json({ message: 'Track deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete track' });
  }
});

export default router;

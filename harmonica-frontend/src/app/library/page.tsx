'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, Search, Trash2, RefreshCw, Play, Pause, 
  Music, Sliders, AlertTriangle, ChevronLeft, ChevronRight, CheckCircle2, Loader2 
} from 'lucide-react';
import toast from 'react-hot-toast';
import AuthGuard from '../../components/AuthGuard';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../lib/api';

interface Track {
  id: string;
  title: string;
  artist: string;
  blobUrl: string;
  filenameOriginal: string;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  bpm: number | null;
  musicalKey: string | null;
  camelotKey: string | null;
  energy: number | null;
  lows: number | null;
  mids: number | null;
  highs: number | null;
  analysisStatus: 'pending' | 'analyzing' | 'done' | 'error';
  analysisError: string | null;
  createdAt: string;
}

interface UploadProgress {
  filename: string;
  progress: number;
  status: 'signing' | 'uploading' | 'saving' | 'done' | 'error';
}

export default function LibraryPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [bpmMin, setBpmMin] = useState('');
  const [bpmMax, setBpmMax] = useState('');
  const [camelotKey, setCamelotKey] = useState('');

  // UI state
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});
  const [isPlaying, setIsPlaying] = useState(false);

  // Wavesurfer refs
  const waveContainerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);

  // Fetch tracks function
  const fetchTracks = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit,
      };
      if (search) params.search = search;
      if (bpmMin) params.bpm_min = bpmMin;
      if (bpmMax) params.bpm_max = bpmMax;
      if (camelotKey) params.camelot_key = camelotKey;

      const response = await api.get('/tracks', { params });
      setTracks(response.data.tracks);
      setTotal(response.data.total);
    } catch (err) {
      toast.error('Failed to load track library');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, bpmMin, bpmMax, camelotKey]);

  // Initial fetch & refetch on filter change
  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  // SSE subscription for real-time analysis updates
  useEffect(() => {
    const token = localStorage.getItem('harmonica_token');
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const sseUrl = `${apiUrl}/tracks/events?token=${token}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'analysis_status') {
          // Update local tracks state
          setTracks((prev) =>
            prev.map((t) => {
              if (t.id === payload.trackId) {
                const updated = {
                  ...t,
                  analysisStatus: payload.status,
                };
                if (payload.status === 'done' && payload.data) {
                  updated.bpm = payload.data.bpm;
                  updated.musicalKey = payload.data.musical_key;
                  updated.camelotKey = payload.data.camelot_key;
                  updated.energy = payload.data.energy;
                  updated.lows = payload.data.lows;
                  updated.mids = payload.data.mids;
                  updated.highs = payload.data.highs;
                  updated.durationSeconds = payload.data.duration_seconds;
                } else if (payload.status === 'error') {
                  updated.analysisError = payload.error;
                }
                return updated;
              }
              return t;
            })
          );

          // Update selected track details if selected
          setSelectedTrack((prev) => {
            if (prev && prev.id === payload.trackId) {
              const updated = {
                ...prev,
                analysisStatus: payload.status,
              };
              if (payload.status === 'done' && payload.data) {
                updated.bpm = payload.data.bpm;
                updated.musicalKey = payload.data.musical_key;
                updated.camelotKey = payload.data.camelot_key;
                updated.energy = payload.data.energy;
                updated.lows = payload.data.lows;
                updated.mids = payload.data.mids;
                updated.highs = payload.data.highs;
                updated.durationSeconds = payload.data.duration_seconds;
              } else if (payload.status === 'error') {
                updated.analysisError = payload.error;
              }
              return updated;
            }
            return prev;
          });

          // Show notifications
          if (payload.status === 'done') {
            toast.success(`Analysis complete for track!`);
          } else if (payload.status === 'error') {
            toast.error(`Analysis failed for track: ${payload.error}`);
          }
        }
      } catch (err) {
        console.error('Error handling SSE message:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Initialize and load WaveSurfer
  useEffect(() => {
    if (!selectedTrack || !waveContainerRef.current || selectedTrack.analysisStatus !== 'done') {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
        setIsPlaying(false);
      }
      return;
    }

    let ws: any = null;

    const initWaveSurfer = async () => {
      try {
        const WaveSurferModule = (await import('wavesurfer.js')).default;
        
        if (wavesurferRef.current) {
          wavesurferRef.current.destroy();
        }

        ws = WaveSurferModule.create({
          container: waveContainerRef.current!,
          waveColor: '#27272a',
          progressColor: '#6366f1',
          cursorColor: '#22d3ee',
          height: 60,
          barWidth: 2,
          barGap: 1,
          normalize: true,
        });

        ws.load(selectedTrack.blobUrl);
        wavesurferRef.current = ws;

        ws.on('ready', () => {
          setIsPlaying(false);
        });

        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        ws.on('finish', () => setIsPlaying(false));
      } catch (err) {
        console.error('Wavesurfer init failed:', err);
      }
    };

    initWaveSurfer();

    return () => {
      if (ws) {
        ws.destroy();
      }
    };
  }, [selectedTrack]);

  // Play/Pause audio toggle
  const togglePlay = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  // Upload handler
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const { put } = await import('@vercel/blob');

    for (const file of acceptedFiles) {
      const filename = file.name;
      setUploads((prev) => ({
        ...prev,
        [filename]: { filename, progress: 0, status: 'signing' },
      }));

      try {
        let blobUrl = '';
        let uploadSuccess = false;

        // 1. Try Vercel Blob direct upload (only if token is not default placeholder)
        try {
          const tokenRes = await api.get('/tracks/blob-token', {
            params: { filename },
          });
          const { clientToken, pathname } = tokenRes.data;

          if (clientToken && !clientToken.includes('xxxxxxxxxxxxxxxxxxxxx')) {
            setUploads((prev) => ({
              ...prev,
              [filename]: { filename, progress: 10, status: 'uploading' },
            }));

            // Direct upload to Vercel Blob
            const blob = await put(pathname, file, {
              access: 'public',
              token: clientToken,
              onUploadProgress: (progressEvent) => {
                setUploads((prev) => ({
                  ...prev,
                  [filename]: {
                    filename,
                    progress: Math.round(10 + (progressEvent.percentage || 0) * 0.8),
                    status: 'uploading',
                  },
                }));
              },
            });
            blobUrl = blob.url;
            uploadSuccess = true;
          }
        } catch (blobErr: any) {
          console.warn('Vercel Blob direct upload failed or not configured, falling back to local server...', blobErr);
        }

        // 2. Fallback: upload file directly to local backend Express server
        if (!uploadSuccess) {
          setUploads((prev) => ({
            ...prev,
            [filename]: { filename, progress: 10, status: 'uploading' },
          }));

          const formData = new FormData();
          formData.append('file', file);

          const localRes = await api.post('/tracks/local-upload', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent) => {
              const total = progressEvent.total || file.size;
              const percent = Math.round((progressEvent.loaded / total) * 100);
              setUploads((prev) => ({
                ...prev,
                [filename]: {
                  filename,
                  progress: Math.round(10 + percent * 0.8),
                  status: 'uploading',
                },
              }));
            },
          });
          blobUrl = localRes.data.url;
        }

        setUploads((prev) => ({
          ...prev,
          [filename]: { filename, progress: 95, status: 'saving' },
        }));

        // 3. Register on node backend
        await api.post('/tracks/upload', {
          blobUrl,
          filename: file.name,
          fileSize: file.size,
        });

        setUploads((prev) => ({
          ...prev,
          [filename]: { filename, progress: 100, status: 'done' },
        }));

        toast.success(`Uploaded ${file.name} successfully! Analysis started.`);
        fetchTracks();
      } catch (err: any) {
        console.error('Upload failed for file:', file.name, err);
        setUploads((prev) => ({
          ...prev,
          [filename]: { filename, progress: 0, status: 'error' },
        }));
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  }, [fetchTracks]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.flac'] },
  });

  // Reanalyze trigger
  const handleReanalyze = async (trackId: string) => {
    try {
      await api.post(`/tracks/${trackId}/reanalyze`);
      toast.success('Reanalysis triggered');
      fetchTracks();
    } catch (err) {
      toast.error('Failed to trigger reanalysis');
    }
  };

  // Delete handler
  const handleDelete = async (trackId: string) => {
    if (!confirm('Are you sure you want to delete this track? This will remove the track file permanently.')) return;
    try {
      await api.delete(`/tracks/${trackId}`);
      toast.success('Track deleted');
      if (selectedTrack?.id === trackId) {
        setSelectedTrack(null);
      }
      fetchTracks();
    } catch (err) {
      toast.error('Failed to delete track');
    }
  };

  // Format duration helpers
  const formatDuration = (sec: number | null) => {
    if (!sec) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const activeUploadCount = Object.values(uploads).filter(
    (u) => u.status !== 'done' && u.status !== 'error'
  ).length;

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="flex gap-8 h-[calc(100vh-8.5rem)] overflow-hidden">
          
          {/* Left panel - Upload widget & Track List */}
          <div className="flex-1 flex flex-col min-w-0 bg-zinc-950/20 border border-zinc-800/40 rounded-2xl p-6 overflow-hidden">
            
            {/* Header & Controls */}
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold font-display text-zinc-100 uppercase tracking-wider">
                  Track Library
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchTracks()}
                    className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent hover:border-zinc-800 rounded-xl transition-all"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Filters Block */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-zinc-900/30 p-3.5 border border-zinc-800/50 rounded-xl">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search title, artist..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700/60 focus:border-indigo-500 rounded-xl py-2 pl-9 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all"
                  />
                </div>

                {/* Min BPM */}
                <div>
                  <input
                    type="number"
                    placeholder="Min BPM"
                    value={bpmMin}
                    onChange={(e) => {
                      setBpmMin(e.target.value);
                      setPage(1);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700/60 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all"
                  />
                </div>

                {/* Max BPM */}
                <div>
                  <input
                    type="number"
                    placeholder="Max BPM"
                    value={bpmMax}
                    onChange={(e) => {
                      setBpmMax(e.target.value);
                      setPage(1);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700/60 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all"
                  />
                </div>

                {/* Camelot Key Filter */}
                <div>
                  <select
                    value={camelotKey}
                    onChange={(e) => {
                      setCamelotKey(e.target.value);
                      setPage(1);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700/60 focus:border-indigo-500 rounded-xl py-2 px-3 text-sm text-zinc-300 placeholder-zinc-500 outline-none transition-all cursor-pointer"
                  >
                    <option value="">All Keys</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [
                      <option key={`${n}A`} value={`${n}A`}>{`${n}A`}</option>,
                      <option key={`${n}B`} value={`${n}B`}>{`${n}B`}</option>
                    ])}
                  </select>
                </div>
              </div>
            </div>

            {/* Dropzone / Upload area */}
            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-xl p-5 mb-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                isDragActive 
                  ? 'border-indigo-500 bg-indigo-500/5' 
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/10'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 text-indigo-400 mb-2" />
              <p className="text-sm font-medium text-zinc-300 text-center">
                {isDragActive ? 'Drop the audio files here' : 'Drag & drop audio files here, or click to browse'}
              </p>
              <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider font-semibold">
                MP3, WAV, M4A, FLAC
              </p>
            </div>

            {/* Uploading progress blocks */}
            {Object.keys(uploads).length > 0 && activeUploadCount > 0 && (
              <div className="mb-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 max-h-40 overflow-y-auto space-y-3">
                <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider">
                  Active Uploads ({activeUploadCount})
                </span>
                {Object.values(uploads)
                  .filter((u) => u.status !== 'done' && u.status !== 'error')
                  .map((u) => (
                    <div key={u.filename} className="text-xs space-y-1">
                      <div className="flex justify-between text-zinc-300">
                        <span className="truncate max-w-[70%]">{u.filename}</span>
                        <span className="capitalize text-zinc-500">{u.status} • {u.progress}%</span>
                      </div>
                      <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-indigo-500 h-full transition-all duration-200" 
                          style={{ width: `${u.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Track list Table container */}
            <div className="flex-1 overflow-auto border border-zinc-800/60 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-900/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4 w-12">#</th>
                    <th className="py-3.5 px-4">Title / Artist</th>
                    <th className="py-3.5 px-4 w-24 text-center">BPM</th>
                    <th className="py-3.5 px-4 w-24 text-center">Camelot Key</th>
                    <th className="py-3.5 px-4 w-28 text-center">Duration</th>
                    <th className="py-3.5 px-4 w-32 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/50">
                  {tracks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-sm text-zinc-500">
                        {isLoading ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                            <span>Loading library...</span>
                          </div>
                        ) : (
                          'No tracks found in library'
                        )}
                      </td>
                    </tr>
                  ) : (
                    tracks.map((track, idx) => {
                      const isSelected = selectedTrack?.id === track.id;
                      return (
                        <tr 
                          key={track.id}
                          onClick={() => setSelectedTrack(track)}
                          className={`group text-sm transition-all duration-150 cursor-pointer ${
                            isSelected 
                              ? 'bg-indigo-600/10 text-indigo-200 border-l-2 border-indigo-500' 
                              : 'text-zinc-300 hover:bg-zinc-900/40'
                          }`}
                        >
                          <td className="py-3.5 px-4 text-zinc-500 font-mono text-xs">
                            {(page - 1) * limit + idx + 1}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-zinc-200 truncate max-w-xs md:max-w-sm">
                              {track.title}
                            </div>
                            <div className="text-xs text-zinc-400 truncate max-w-xs mt-0.5">
                              {track.artist}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono font-medium">
                            {track.bpm ? track.bpm.toFixed(1) : '--'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {track.camelotKey ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                                {track.camelotKey} ({track.musicalKey})
                              </span>
                            ) : (
                              <span className="text-zinc-600 font-mono">--</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono text-zinc-400 text-xs">
                            {formatDuration(track.durationSeconds)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {track.analysisStatus === 'pending' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                                <Loader2 className="w-3 h-3 animate-spin" /> Pending
                              </span>
                            )}
                            {track.analysisStatus === 'analyzing' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                                <Loader2 className="w-3 h-3 animate-spin text-indigo-400" /> Analyzing
                              </span>
                            )}
                            {track.analysisStatus === 'done' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                <CheckCircle2 className="w-3 h-3 text-cyan-400" /> Complete
                              </span>
                            )}
                            {track.analysisStatus === 'error' && (
                              <span 
                                title={track.analysisError || 'Unknown Error'}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20"
                              >
                                <AlertTriangle className="w-3 h-3 text-red-400" /> Failed
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {total > limit && (
              <div className="flex justify-between items-center mt-4">
                <span className="text-xs text-zinc-500">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} tracks
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 disabled:opacity-40 rounded-lg hover:border-zinc-700 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={page * limit >= total}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 disabled:opacity-40 rounded-lg hover:border-zinc-700 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right panel - Dynamic Selected Track Profile */}
          <div className="w-80 flex flex-col bg-zinc-950/40 border border-zinc-800/40 rounded-2xl p-6 overflow-hidden shrink-0">
            {selectedTrack ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                {/* File Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 bg-indigo-600/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
                    <Music className="w-5 h-5" />
                  </div>
                  <button
                    onClick={() => handleDelete(selectedTrack.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="font-semibold text-zinc-100 text-lg leading-tight uppercase font-display select-text">
                  {selectedTrack.title}
                </h3>
                <p className="text-zinc-400 text-sm mt-1 mb-4 select-text">
                  {selectedTrack.artist}
                </p>

                <div className="border-t border-zinc-900 my-4"></div>

                {/* Status Indicator */}
                {selectedTrack.analysisStatus !== 'done' ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-zinc-900/10 border border-zinc-900 rounded-xl">
                    {selectedTrack.analysisStatus === 'pending' || selectedTrack.analysisStatus === 'analyzing' ? (
                      <>
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-4" />
                        <span className="text-sm font-semibold text-zinc-300">Analyzing Track Features...</span>
                        <p className="text-xs text-zinc-500 mt-2">
                          Detecting Camelot Key, BPM, and frequency distribution bands. This usually takes around 10 seconds.
                        </p>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-8 h-8 text-red-500 mb-4" />
                        <span className="text-sm font-semibold text-red-400">Analysis Failed</span>
                        <p className="text-xs text-zinc-500 mt-2 select-text">
                          Error: {selectedTrack.analysisError || 'Unknown analysis error'}
                        </p>
                        <button
                          onClick={() => handleReanalyze(selectedTrack.id)}
                          className="mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl hover:bg-zinc-800 hover:border-zinc-700 transition"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Re-Analyze
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 space-y-6">
                    
                    {/* BPM and Key Block */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-900/40 p-4 border border-zinc-800/40 rounded-xl text-center">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Tempo</span>
                        <div className="text-2xl font-bold text-zinc-100 font-mono mt-1">
                          {selectedTrack.bpm ? selectedTrack.bpm.toFixed(1) : '--'}
                        </div>
                        <span className="text-[10px] text-zinc-400 mt-0.5 block">BPM</span>
                      </div>
                      <div className="bg-zinc-900/40 p-4 border border-zinc-800/40 rounded-xl text-center">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Camelot</span>
                        <div className="text-2xl font-bold text-indigo-400 font-mono mt-1">
                          {selectedTrack.camelotKey || '--'}
                        </div>
                        <span className="text-[10px] text-zinc-400 mt-0.5 block">({selectedTrack.musicalKey || '--'})</span>
                      </div>
                    </div>

                    {/* Wavesurfer Player */}
                    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Waveform</span>
                        <span className="text-xs text-zinc-400 font-mono">{formatDuration(selectedTrack.durationSeconds)}</span>
                      </div>
                      <div ref={waveContainerRef} className="w-full bg-zinc-950/60 rounded-lg p-2 min-h-16"></div>
                      <button
                        onClick={togglePlay}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-zinc-100 text-sm font-semibold rounded-xl transition shadow-md shadow-indigo-600/10"
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                        {isPlaying ? 'Pause Preview' : 'Play Preview'}
                      </button>
                    </div>

                    {/* Frequency Band Spectrum Distribution */}
                    <div className="bg-zinc-900/20 border border-zinc-800/30 rounded-xl p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Energy & Band Distribution</span>
                        <Sliders className="w-3.5 h-3.5 text-zinc-500" />
                      </div>
                      
                      <div className="space-y-3">
                        {/* Overall Energy */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-zinc-300">
                            <span>Track Energy</span>
                            <span>{selectedTrack.energy ? Math.round(selectedTrack.energy * 100) : 0}%</span>
                          </div>
                          <div className="h-2 w-full bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                              style={{ width: `${(selectedTrack.energy || 0) * 100}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Lows */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-400">
                            <span>Lows (Bass/Kick)</span>
                            <span className="font-mono">{selectedTrack.lows ? Math.round(selectedTrack.lows * 100) : 0}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-900 border border-zinc-900 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-cyan-400 rounded-full"
                              style={{ width: `${(selectedTrack.lows || 0) * 100}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Mids */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-400">
                            <span>Mids (Vocals/Leads)</span>
                            <span className="font-mono">{selectedTrack.mids ? Math.round(selectedTrack.mids * 100) : 0}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-900 border border-zinc-900 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-400 rounded-full"
                              style={{ width: `${(selectedTrack.mids || 0) * 100}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Highs */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-400">
                            <span>Highs (Hats/Perc)</span>
                            <span className="font-mono">{selectedTrack.highs ? Math.round(selectedTrack.highs * 100) : 0}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-900 border border-zinc-900 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${(selectedTrack.highs || 0) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleReanalyze(selectedTrack.id)}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold rounded-xl hover:bg-zinc-850 hover:border-zinc-700 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Re-Analyze Track
                    </button>
                    
                    <div className="text-[10px] text-zinc-500 font-mono text-center">
                      File Size: {formatFileSize(selectedTrack.fileSizeBytes)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500">
                <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center mb-4">
                  <Music className="w-6 h-6 text-zinc-600" />
                </div>
                <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">No Track Selected</h4>
                <p className="text-xs text-zinc-600 mt-2 max-w-[200px]">
                  Click on any track in the list to open its harmonic waveform, playback preview, and frequency analysis.
                </p>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

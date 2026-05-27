'use client';

import React, { useState, useEffect } from 'react';
import { 
  Download, FileSpreadsheet, FileCode, Archive, FileText, 
  ListMusic, ChevronRight, Music, AlertCircle, Loader2 
} from 'lucide-react';
import toast from 'react-hot-toast';
import AuthGuard from '../../components/AuthGuard';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../lib/api';

interface Track {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  camelotKey: string | null;
  durationSeconds: number | null;
}

interface PlaylistTrackData {
  id: string;
  position: number;
  track: Track;
}

interface Playlist {
  id: string;
  name: string;
  playlistTracks: PlaylistTrackData[];
  createdAt: string;
}

export default function ExportPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState<Record<string, boolean>>({});

  // Fetch playlist directories
  useEffect(() => {
    const loadPlaylists = async () => {
      try {
        const response = await api.get('/playlists');
        setPlaylists(response.data);
        if (response.data.length > 0) {
          setSelectedId(response.data[0].id);
        }
      } catch (err) {
        toast.error('Failed to load playlists');
      }
    };
    loadPlaylists();
  }, []);

  // Fetch detailed playlist preview when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setActivePlaylist(null);
      return;
    }
    const loadPlaylistDetails = async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`/playlists/${selectedId}`);
        setActivePlaylist(response.data);
      } catch (err) {
        toast.error('Failed to load playlist details');
      } finally {
        setIsLoading(false);
      }
    };
    loadPlaylistDetails();
  }, [selectedId]);

  // Execute export download
  const handleExport = (format: 'm3u' | 'csv' | 'rekordbox' | 'zip') => {
    if (!selectedId) return;

    setIsExporting((prev) => ({ ...prev, [format]: true }));
    try {
      const token = localStorage.getItem('harmonica_token');
      const baseUrl = api.defaults.baseURL || 'http://localhost:4000/api';
      const downloadUrl = `${baseUrl}/playlists/${selectedId}/export/${format}?token=${token}`;
      
      // Trigger native download by setting window location
      window.location.href = downloadUrl;
      toast.success(`Exporting playlist as ${format.toUpperCase()}...`);
    } catch (err) {
      toast.error(`Export failed for format ${format.toUpperCase()}`);
    } finally {
      // Simulate brief loading completion
      setTimeout(() => {
        setIsExporting((prev) => ({ ...prev, [format]: false }));
      }, 1500);
    }
  };

  const formatDuration = (sec: number | null) => {
    if (!sec) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="flex gap-8 h-[calc(100vh-8.5rem)] overflow-hidden">
          
          {/* Left Column - Playlist Selector */}
          <div className="w-80 flex flex-col bg-zinc-950/20 border border-zinc-800/40 rounded-2xl p-5 shrink-0 overflow-hidden">
            <h3 className="text-xs font-bold font-display text-zinc-400 uppercase tracking-wider mb-4">
              Select Playlist Set
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {playlists.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-600">
                  No playlists available to export. Build one in the Playlists page first.
                </div>
              ) : (
                playlists.map((p) => {
                  const isSelected = selectedId === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`group flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-200'
                          : 'bg-transparent border-transparent hover:bg-zinc-900/30 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ListMusic className="w-4 h-4 shrink-0 text-zinc-500 group-hover:text-zinc-350" />
                        <span className="text-xs font-semibold truncate leading-none">
                          {p.name}
                        </span>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 text-zinc-650 transition-transform ${isSelected ? 'translate-x-0.5 text-indigo-400' : 'group-hover:translate-x-0.5'}`} />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column - Export Dashboard & Preview */}
          <div className="flex-1 flex flex-col min-w-0 bg-zinc-950/20 border border-zinc-800/40 rounded-2xl p-6 overflow-hidden">
            {activePlaylist ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
                
                {/* Header */}
                <div className="mb-6">
                  <h2 className="text-xl font-bold font-display text-zinc-100 uppercase tracking-wider">
                    Export Center: {activePlaylist.name}
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    Select a format below to export your harmonically ordered track sequence.
                  </p>
                </div>

                {activePlaylist.playlistTracks.length === 0 ? (
                  <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl text-amber-400 text-xs mb-6">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>This playlist is empty. Please add tracks to the playlist before exporting.</span>
                  </div>
                ) : (
                  <>
                    {/* Export Formats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                      {/* 1. M3U */}
                      <div className="glass-panel border border-zinc-800/80 hover:border-zinc-700/60 p-5 rounded-2xl flex items-start gap-4 transition-all duration-200">
                        <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-zinc-200 text-sm">M3U8 Playlist</h4>
                          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                            Standard audio playlist file compatible with desktop players (VLC, Winamp). Contains cloud stream links.
                          </p>
                          <button
                            onClick={() => handleExport('m3u')}
                            disabled={isExporting['m3u']}
                            className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-850 hover:text-white transition"
                          >
                            {isExporting['m3u'] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Download .m3u
                          </button>
                        </div>
                      </div>

                      {/* 2. CSV */}
                      <div className="glass-panel border border-zinc-800/80 hover:border-zinc-700/60 p-5 rounded-2xl flex items-start gap-4 transition-all duration-200">
                        <div className="w-10 h-10 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-zinc-200 text-sm">CSV Spreadsheet</h4>
                          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                            Export track indexes, titles, artists, BPMs, Camelot keys, and download links into a spreadsheet.
                          </p>
                          <button
                            onClick={() => handleExport('csv')}
                            disabled={isExporting['csv']}
                            className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-850 hover:text-white transition"
                          >
                            {isExporting['csv'] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Download .csv
                          </button>
                        </div>
                      </div>

                      {/* 3. Rekordbox XML */}
                      <div className="glass-panel border border-zinc-800/80 hover:border-zinc-700/60 p-5 rounded-2xl flex items-start gap-4 transition-all duration-200">
                        <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                          <FileCode className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-zinc-200 text-sm">Rekordbox XML</h4>
                          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                            Pioneer Rekordbox-matching database file. Imports keys, BPM, track structure directly into Rekordbox.
                          </p>
                          <button
                            onClick={() => handleExport('rekordbox')}
                            disabled={isExporting['rekordbox']}
                            className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-850 hover:text-white transition"
                          >
                            {isExporting['rekordbox'] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Download XML
                          </button>
                        </div>
                      </div>

                      {/* 4. Zipped Set Package */}
                      <div className="glass-panel border border-zinc-800/80 hover:border-zinc-700/60 p-5 rounded-2xl flex items-start gap-4 transition-all duration-200">
                        <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                          <Archive className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-zinc-200 text-sm">Zipped Audio Set (Recommended)</h4>
                          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                            Bundles all original track audio files and a relative M3U file into a ZIP archive. Ready to copy onto USB!
                          </p>
                          <button
                            onClick={() => handleExport('zip')}
                            disabled={isExporting['zip']}
                            className="mt-4 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-850 hover:text-white transition"
                          >
                            {isExporting['zip'] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Download ZIP
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Playlist Track Preview */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold font-display text-zinc-400 uppercase tracking-wider">
                        Set Track Order Preview
                      </h4>
                      <div className="border border-zinc-900 rounded-xl overflow-hidden bg-zinc-950/20">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-zinc-900 bg-zinc-900/30 text-zinc-400 font-semibold uppercase">
                              <th className="py-2.5 px-3 w-12 text-center">#</th>
                              <th className="py-2.5 px-3">Track Info</th>
                              <th className="py-2.5 px-3 text-center w-24">BPM</th>
                              <th className="py-2.5 px-3 text-center w-28">Camelot Key</th>
                              <th className="py-2.5 px-3 text-center w-20">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900/40 text-zinc-300">
                            {activePlaylist.playlistTracks.map((pt) => (
                              <tr key={pt.id} className="hover:bg-zinc-900/20">
                                <td className="py-2.5 px-3 text-center font-mono text-zinc-500">
                                  {pt.position}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-zinc-200">
                                  <div>{pt.track.title}</div>
                                  <div className="text-[10px] text-zinc-500 mt-0.5">{pt.track.artist}</div>
                                </td>
                                <td className="py-2.5 px-3 text-center font-mono">
                                  {pt.track.bpm ? pt.track.bpm.toFixed(1) : '--'}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {pt.track.camelotKey ? (
                                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-indigo-400 font-bold border border-zinc-800">
                                      {pt.track.camelotKey}
                                    </span>
                                  ) : (
                                    '--'
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center font-mono text-zinc-400">
                                  {formatDuration(pt.track.durationSeconds)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500">
                {isLoading ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin text-zinc-400 mb-4" />
                    <span>Loading playlist preview...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-12 h-12 text-zinc-700 mb-4" />
                    <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                      No Playlist Selected
                    </h4>
                    <p className="text-xs text-zinc-600 mt-2 max-w-[200px]">
                      Select one of your sets from the list on the left to export and download.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}

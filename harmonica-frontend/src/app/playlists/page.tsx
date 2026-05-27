'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  DndContext, closestCenter, KeyboardSensor, PointerSensor, 
  useSensor, useSensors, DragEndEvent 
} from '@dnd-kit/core';
import { 
  arrayMove, SortableContext, sortableKeyboardCoordinates, 
  verticalListSortingStrategy, useSortable 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Plus, Search, Trash2, Sliders, CheckCircle2, AlertTriangle, 
  XCircle, ListMusic, Wand2, Music, Loader2, GripVertical, Play, Pause, ChevronRight 
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
  musicalKey: string | null;
  durationSeconds: number | null;
}

interface PlaylistTrackData {
  id: string;
  trackId: string;
  position: number;
  track: Track;
  keyCompatibility?: 'compatible' | 'moderate' | 'incompatible' | null;
  bpmDelta?: number | null;
}

interface Playlist {
  id: string;
  name: string;
  playlistTracks: PlaylistTrackData[];
  createdAt: string;
}

// ─── Sortable Track Item Component ───────────────────────────────────────────
function SortableTrackItem({ 
  pt, 
  index, 
  isLast,
  onRemove 
}: { 
  pt: PlaylistTrackData; 
  index: number; 
  isLast: boolean;
  onRemove: (trackId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pt.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  const { track, keyCompatibility, bpmDelta } = pt;

  return (
    <div ref={setNodeRef} style={style} className="relative select-none">
      {/* Track Row */}
      <div className="flex items-center gap-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 hover:border-zinc-700/60 transition-all">
        {/* Grip handle */}
        <div 
          {...attributes} 
          {...listeners} 
          className="text-zinc-500 hover:text-zinc-300 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-zinc-800/50"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Index */}
        <span className="text-xs font-mono text-zinc-500 w-4 text-center">
          {index + 1}
        </span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-zinc-200 text-sm truncate">{track.title}</div>
          <div className="text-xs text-zinc-400 truncate mt-0.5">{track.artist}</div>
        </div>

        {/* Key & BPM */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono bg-zinc-850 px-2.5 py-1 rounded-lg text-zinc-300 border border-zinc-800">
            {track.bpm ? `${track.bpm.toFixed(1)} BPM` : '--'}
          </span>
          <span className="text-xs font-mono bg-indigo-500/10 px-2.5 py-1 rounded-lg text-indigo-400 border border-indigo-500/20 font-bold">
            {track.camelotKey ? `${track.camelotKey} (${track.musicalKey})` : '--'}
          </span>
        </div>

        {/* Remove Button */}
        <button
          onClick={() => onRemove(track.id)}
          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Transition Connection Indicator (Rendered below the item if it's not the last one) */}
      {!isLast && (
        <div className="relative pl-12 py-3 flex items-center">
          {/* Vertical line connection */}
          <div 
            className={`absolute left-[59px] top-0 bottom-0 w-0.5 border-l-2 ${
              keyCompatibility === 'compatible' && Math.abs(bpmDelta || 0) <= 3
                ? 'border-cyan-500/40 border-solid'
                : keyCompatibility === 'incompatible' || Math.abs(bpmDelta || 0) > 6
                ? 'border-red-500/30 border-dashed'
                : 'border-amber-500/40 border-solid'
            }`}
            style={{ height: 'calc(100% + 2px)' }}
          />

          {/* Transition Bubble */}
          <div className="z-10 flex items-center gap-2 bg-zinc-950 border rounded-full py-1 px-3 text-[10px] font-semibold tracking-wide transition-all duration-200">
            {keyCompatibility === 'compatible' && Math.abs(bpmDelta || 0) <= 3 ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-cyan-400 uppercase">Seamless Mix</span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-400 font-mono">
                  Δ {bpmDelta !== null ? (bpmDelta >= 0 ? `+${bpmDelta.toFixed(1)}` : `${bpmDelta.toFixed(1)}`) : '--'} BPM
                </span>
              </>
            ) : keyCompatibility === 'incompatible' || Math.abs(bpmDelta || 0) > 6 ? (
              <>
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-400 uppercase">Mix Clash</span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-400 font-mono">
                  Δ {bpmDelta !== null ? (bpmDelta >= 0 ? `+${bpmDelta.toFixed(1)}` : `${bpmDelta.toFixed(1)}`) : '--'} BPM
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400 uppercase">Shift Transition</span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-400 font-mono">
                  Δ {bpmDelta !== null ? (bpmDelta >= 0 ? `+${bpmDelta.toFixed(1)}` : `${bpmDelta.toFixed(1)}`) : '--'} BPM
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Playlists Page Component ───────────────────────────────────────────
export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Library tray (for manual adding)
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [libSearch, setLibSearch] = useState('');

  // Generation Modal state
  const [showGenModal, setShowGenModal] = useState(false);
  const [genSeedId, setGenSeedId] = useState('');
  const [genLength, setGenLength] = useState(10);
  const [genName, setGenName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch playlist list
  const fetchPlaylists = useCallback(async (selectId?: string) => {
    try {
      const response = await api.get('/playlists');
      setPlaylists(response.data);
      if (selectId) {
        const found = response.data.find((p: Playlist) => p.id === selectId);
        if (found) fetchPlaylistDetails(found.id);
      } else if (response.data.length > 0 && !selectedPlaylist) {
        fetchPlaylistDetails(response.data[0].id);
      }
    } catch (err) {
      toast.error('Failed to load playlists');
    }
  }, [selectedPlaylist]);

  // Fetch specific playlist details (for calculations)
  const fetchPlaylistDetails = async (id: string) => {
    try {
      const response = await api.get(`/playlists/${id}`);
      setSelectedPlaylist(response.data);
    } catch (err) {
      toast.error('Failed to load playlist details');
    }
  };

  // Fetch analyzed library for the drawer
  const fetchLibrary = useCallback(async () => {
    try {
      const response = await api.get('/tracks', { params: { limit: 100 } });
      const completed = response.data.tracks.filter((t: any) => t.analysisStatus === 'done');
      setLibraryTracks(completed);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchPlaylists();
    fetchLibrary();
  }, [fetchPlaylists, fetchLibrary]);

  // Create standard manual playlist
  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    setIsCreating(true);
    try {
      const response = await api.post('/playlists', { name: newPlaylistName });
      toast.success('Playlist created');
      setNewPlaylistName('');
      fetchPlaylists(response.data.id);
    } catch (err) {
      toast.error('Failed to create playlist');
    } finally {
      setIsCreating(false);
    }
  };

  // Auto recommend generator
  const handleGeneratePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genSeedId) {
      toast.error('Please select a starting seed track');
      return;
    }
    setIsGenerating(true);
    try {
      const response = await api.post('/playlists/generate', {
        seedTrackId: genSeedId,
        targetLength: genLength,
        name: genName.trim() || 'Harmonic Mix Generation',
      });
      toast.success('Harmonically optimized playlist generated!');
      setShowGenModal(false);
      setGenSeedId('');
      setGenName('');
      fetchPlaylists(response.data.id);
    } catch (err) {
      toast.error('Failed to generate playlist');
    } finally {
      setIsGenerating(false);
    }
  };

  // Delete playlist
  const handleDeletePlaylist = async (id: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    try {
      await api.delete(`/playlists/${id}`);
      toast.success('Playlist deleted');
      setSelectedPlaylist(null);
      fetchPlaylists();
    } catch (err) {
      toast.error('Failed to delete playlist');
    }
  };

  // Drag and Drop sort sensor configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // enables clicking action without triggering drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Drag Reorder Handler
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!selectedPlaylist || !over || active.id === over.id) return;

    const oldIndex = selectedPlaylist.playlistTracks.findIndex((pt) => pt.id === active.id);
    const newIndex = selectedPlaylist.playlistTracks.findIndex((pt) => pt.id === over.id);

    const reordered = arrayMove(selectedPlaylist.playlistTracks, oldIndex, newIndex);

    // Optimistic UI updates
    setSelectedPlaylist({
      ...selectedPlaylist,
      playlistTracks: reordered,
    });

    try {
      const trackIds = reordered.map((pt) => pt.trackId);
      const response = await api.put(`/playlists/${selectedPlaylist.id}/tracks`, { trackIds });
      setSelectedPlaylist(response.data);
    } catch (err) {
      toast.error('Failed to save track order');
      fetchPlaylistDetails(selectedPlaylist.id);
    }
  };

  // Append track to selected playlist
  const handleAddTrack = async (track: Track) => {
    if (!selectedPlaylist) {
      toast.error('Please select or create a playlist first');
      return;
    }
    const alreadyExists = selectedPlaylist.playlistTracks.some((pt) => pt.trackId === track.id);
    if (alreadyExists) {
      toast.error('Track is already inside this playlist');
      return;
    }

    const currentTrackIds = selectedPlaylist.playlistTracks.map((pt) => pt.trackId);
    const newTrackIds = [...currentTrackIds, track.id];

    try {
      const response = await api.put(`/playlists/${selectedPlaylist.id}/tracks`, { trackIds: newTrackIds });
      setSelectedPlaylist(response.data);
      toast.success('Added track');
    } catch (err) {
      toast.error('Failed to add track');
    }
  };

  // Remove track from selected playlist
  const handleRemoveTrack = async (trackId: string) => {
    if (!selectedPlaylist) return;
    const newTrackIds = selectedPlaylist.playlistTracks
      .filter((pt) => pt.trackId !== trackId)
      .map((pt) => pt.trackId);

    try {
      const response = await api.put(`/playlists/${selectedPlaylist.id}/tracks`, { trackIds: newTrackIds });
      setSelectedPlaylist(response.data);
      toast.success('Track removed');
    } catch (err) {
      toast.error('Failed to remove track');
    }
  };

  // Filter drawer list
  const filteredLibrary = libraryTracks.filter(
    (t) =>
      t.title.toLowerCase().includes(libSearch.toLowerCase()) ||
      t.artist.toLowerCase().includes(libSearch.toLowerCase())
  );

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="flex gap-8 h-[calc(100vh-8.5rem)] overflow-hidden">
          
          {/* Left Panel: Playlist directory selector */}
          <div className="w-72 flex flex-col bg-zinc-950/20 border border-zinc-800/40 rounded-2xl p-5 shrink-0 overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold font-display text-zinc-400 uppercase tracking-wider">
                My Playlists
              </h3>
              <button
                onClick={() => setShowGenModal(true)}
                className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-lg transition"
              >
                <Wand2 className="w-3.5 h-3.5" /> Auto Mix
              </button>
            </div>

            {/* Quick Playlist Creation */}
            <form onSubmit={handleCreatePlaylist} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="New playlist name..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700/60 focus:border-indigo-500 rounded-lg py-1.5 px-3 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-all"
              />
              <button
                type="submit"
                disabled={isCreating}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {/* Playlist Scroll Container */}
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {playlists.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-600">
                  No playlists created. Build one above or click Auto Mix.
                </div>
              ) : (
                playlists.map((p) => {
                  const isSelected = selectedPlaylist?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => fetchPlaylistDetails(p.id)}
                      className={`group flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-200'
                          : 'bg-transparent border-transparent hover:bg-zinc-900/30 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ListMusic className="w-4 h-4 shrink-0 text-zinc-500 group-hover:text-zinc-300" />
                        <span className="text-xs font-semibold truncate leading-none">
                          {p.name}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlaylist(p.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Center Column: Drag-and-drop playlist reorder timeline */}
          <div className="flex-1 flex flex-col bg-zinc-950/20 border border-zinc-800/40 rounded-2xl p-6 overflow-hidden">
            {selectedPlaylist ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-900">
                  <div>
                    <h2 className="text-lg font-bold font-display text-zinc-100 uppercase tracking-wider">
                      {selectedPlaylist.name}
                    </h2>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1">
                      {selectedPlaylist.playlistTracks.length} Track Set
                    </p>
                  </div>
                </div>

                {/* Playlist Tracks List */}
                <div className="flex-1 overflow-y-auto pr-1">
                  {selectedPlaylist.playlistTracks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center h-full text-zinc-500 py-12">
                      <Music className="w-12 h-12 text-zinc-700 mb-3" />
                      <p className="text-sm font-semibold text-zinc-400">Empty Playlist</p>
                      <p className="text-xs text-zinc-600 mt-1 max-w-[250px]">
                        Choose tracks from the Library Tray on the right to start building your mix.
                      </p>
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={selectedPlaylist.playlistTracks.map((pt) => pt.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-0.5">
                          {selectedPlaylist.playlistTracks.map((pt, idx) => (
                            <SortableTrackItem
                              key={pt.id}
                              pt={pt}
                              index={idx}
                              isLast={idx === selectedPlaylist.playlistTracks.length - 1}
                              onRemove={handleRemoveTrack}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500">
                <ListMusic className="w-12 h-12 text-zinc-700 mb-4" />
                <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                  No Playlist Selected
                </h4>
                <p className="text-xs text-zinc-600 mt-2 max-w-[200px]">
                  Select an existing set from the directory list, create a new one, or generate a mix.
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Library Tray */}
          <div className="w-80 flex flex-col bg-zinc-950/20 border border-zinc-800/40 rounded-2xl p-5 shrink-0 overflow-hidden">
            <h3 className="text-xs font-bold font-display text-zinc-400 uppercase tracking-wider mb-3">
              Library Tray
            </h3>

            {/* Tray Search */}
            <div className="relative mb-4">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search analyzed files..."
                value={libSearch}
                onChange={(e) => setLibSearch(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700/60 focus:border-indigo-500 rounded-lg py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-all"
              />
            </div>

            {/* Tracks List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredLibrary.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-600">
                  No analyzed tracks available. Ensure you upload files in the Library page first.
                </div>
              ) : (
                filteredLibrary.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2.5 bg-zinc-900/30 border border-zinc-800/60 rounded-xl hover:bg-zinc-900/50 hover:border-zinc-750 transition"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-semibold text-zinc-200 truncate">
                        {t.title}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                        {t.artist}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <span className="text-[9px] font-mono text-zinc-500">
                          {t.bpm ? `${t.bpm.toFixed(0)} BPM` : ''}
                        </span>
                        <span className="text-[9px] font-mono text-indigo-400 font-bold">
                          {t.camelotKey || ''}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddTrack(t)}
                      className="p-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg transition"
                      title="Add to playlist"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ─── Auto Mix Playlist Generation Modal ─────────────────────────────── */}
        {showGenModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md p-6 overflow-hidden">
              <h3 className="text-lg font-bold font-display text-zinc-100 uppercase tracking-wide mb-4">
                Auto Harmonic Mix Generator
              </h3>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Choose a seed track. The engine will query your library and arrange an optimized flow of tracks by matching compatible Camelot Wheel keys and minimizing tempo shifts.
              </p>

              <form onSubmit={handleGeneratePlaylist} className="space-y-4">
                {/* Seed selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">
                    Select Seed Track
                  </label>
                  <select
                    value={genSeedId}
                    onChange={(e) => {
                      setGenSeedId(e.target.value);
                      const track = libraryTracks.find((t) => t.id === e.target.value);
                      if (track) {
                        setGenName(`Harmonic Mix: ${track.title}`);
                      }
                    }}
                    required
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-3 text-sm text-zinc-300 placeholder-zinc-500 outline-none cursor-pointer"
                  >
                    <option value="">-- Choose Track --</option>
                    {libraryTracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.camelotKey} | {t.title} - {t.artist}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Length */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">
                    Set Length ({genLength} tracks)
                  </label>
                  <input
                    type="range"
                    min="3"
                    max="20"
                    value={genLength}
                    onChange={(e) => setGenLength(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>3 Tracks</span>
                    <span>20 Tracks</span>
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">
                    Playlist Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter playlist name..."
                    value={genName}
                    onChange={(e) => setGenName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
                  />
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-900">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGenModal(false);
                      setGenSeedId('');
                      setGenName('');
                    }}
                    className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-zinc-100 text-xs font-bold uppercase rounded-xl transition disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3.5 h-3.5" /> Generate Mix
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </DashboardLayout>
    </AuthGuard>
  );
}

'use client';

import { useState } from 'react';
import { Loader2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { SiSpotify } from 'react-icons/si';
import type { SpotifyTrack } from '@flowstate/shared';
import { useOnboarding } from '@/lib/onboarding';
import {
  nextTrack,
  playTrack,
  previousTrack,
  setSearchQuery,
  togglePlay,
  useSpotify,
  useSpotifySync,
} from '@/lib/spotify';
import { trpc } from '@/lib/trpc';
import { AudioWaveform } from '../ui/AudioWaveform';
import { cn } from '../ui/cn';
import { DropdownMenu } from '../ui/dropdown-menu';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/input';

/////////////
// Helpers //
/////////////

/** The now-playing card + transport controls (shown when connected). */
function Player() {
  const playback = useSpotify((s) => s.playback);
  const error = useSpotify((s) => s.playbackError);
  const track = playback?.track ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {track?.albumArtUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.albumArtUrl}
            alt=""
            className="size-12 shrink-0 rounded bg-accent object-cover"
          />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded bg-accent">
            <SiSpotify className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {track ? (
            <>
              <p className="truncate text-sm font-medium text-neutral-100">{track.name}</p>
              <p className="truncate text-xs text-muted-foreground">{track.artists.join(', ')}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Nothing playing.</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => void previousTrack()}
          title="Previous"
          className="text-muted-foreground transition-colors hover:text-neutral-100"
        >
          <SkipBack className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => void togglePlay()}
          title={playback?.isPlaying ? 'Pause' : 'Play'}
          className="flex size-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 transition-colors hover:bg-white"
        >
          {playback?.isPlaying ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="size-4 fill-current" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void nextTrack()}
          title="Next"
          className="text-muted-foreground transition-colors hover:text-neutral-100"
        >
          <SkipForward className="size-4" />
        </button>
      </div>

      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** The track search box + results (plays a result on the active device). */
function Search() {
  const query = useSpotify((s) => s.searchQuery);
  const results = useSpotify((s) => s.searchResults);
  const searching = useSpotify((s) => s.searching);

  const onPlay = (track: SpotifyTrack) => {
    void playTrack(track.uri);
    setSearchQuery('');
  };

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search a song…"
        className="h-8 text-xs"
      />
      {searching && <p className="px-1 text-xs text-muted-foreground">Searching…</p>}
      {!searching && results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto">
          {results.map((track) => (
            <li key={track.id}>
              <button
                type="button"
                onClick={() => onPlay(track)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
              >
                {track.albumArtUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={track.albumArtUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
                ) : (
                  <div className="size-8 shrink-0 rounded bg-accent" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-neutral-100">{track.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {track.artists.join(', ')}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The panel body shown when Spotify isn't connected yet. */
function ConnectPrompt() {
  const [connecting, setConnecting] = useState(false);

  const connect = async () => {
    setConnecting(true);
    try {
      await trpc().onboarding.spotifyBeginLogin.mutate();
    } catch {
      // The status subscription reflects the outcome; nothing to do on failure.
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-2 p-1 text-center">
      <p className="text-xs text-muted-foreground">
        Connect Spotify Premium to control playback from FlowState.
      </p>
      <button
        type="button"
        disabled={connecting}
        onClick={() => void connect()}
        className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-4 py-1.5 text-xs font-medium text-black transition-colors hover:bg-[#1ed760] disabled:opacity-60"
      >
        {connecting ? <Loader2 className="size-4 animate-spin" /> : <SiSpotify className="size-4" />}
        {connecting ? 'Waiting for browser…' : 'Connect Spotify'}
      </button>
    </div>
  );
}

////////////
// Export //
////////////

/**
 * Header player button. Shows a Spotify glyph (green while playing); the panel
 * hosts the now-playing card + transport controls and a song search when
 * connected, or a Connect prompt when not. Playback is Spotify Connect — it
 * controls the user's active device.
 */
export function SpotifyButton() {
  const connected = useOnboarding((s) => s.spotifyConnected);
  const isPlaying = useSpotify((s) => s.playback?.isPlaying ?? false);

  // Poll the player whenever the app is focused/visible so the header waveform
  // reflects live playback even while the panel is closed.
  useSpotifySync(true);

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu
        align="end"
        placement="bottom"
        panelClassName="w-72 p-3"
        triggerClassName={cn(
          'transition-colors',
          connected && isPlaying
            ? 'text-[#1DB954] hover:text-[#1ed760]'
            : 'text-muted-foreground hover:text-neutral-200',
        )}
        trigger={<SiSpotify className="size-4" />}
      >
        {() => (connected ? (
          <div className="space-y-3">
            <Player />
            <div className="border-t border-border pt-3">
              <Search />
            </div>
          </div>
        ) : (
          <ConnectPrompt />
        ))}
      </DropdownMenu>
      {connected && (
        <>
          <AudioWaveform playing={isPlaying} />
          <IconButton
            variant="ghost"
            className="h-6 w-6"
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={() => void togglePlay()}
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </IconButton>
        </>
      )}
    </div>
  );
}

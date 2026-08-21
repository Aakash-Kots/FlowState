'use client';

import { useCallback, useRef, useState } from 'react';
import { trpc } from './trpc';

///////////
// Types //
///////////

/** Where the mic capture → transcription flow currently is. */
export type MicStatus = 'idle' | 'recording' | 'transcribing';

///////////////
// Constants //
///////////////

/** Recording containers to try, best-first — the first the platform's
 * MediaRecorder supports wins. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

/////////////
// Helpers //
/////////////

/** The first MediaRecorder container this platform supports (or '' to let the
 * browser choose). */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

/** Base64-encode a recorded blob for the IPC hop to the main process, chunked so
 * a long clip doesn't blow the argument limit of `String.fromCharCode`. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

////////////
// Export //
////////////

/**
 * Mic → speech-to-text via the Gemini API. `toggle` starts recording, and
 * toggling again stops it and transcribes: the clip is sent to `gemma.transcribe`
 * and the resulting text handed to `onText` (to insert into the composer).
 * Requires a Gemini API key — a missing key surfaces as `error`.
 */
export function useMicTranscription(onText: (text: string) => void) {
  const [status, setStatus] = useState<MicStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const type = rec.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (blob.size === 0) {
          setStatus('idle');
          return;
        }
        setStatus('transcribing');
        try {
          const audioBase64 = await blobToBase64(blob);
          // Drop any codecs= parameter — Gemini wants the bare container type.
          const text = await trpc().gemma.transcribe.mutate({
            audioBase64,
            mimeType: type.split(';')[0],
          });
          if (text.trim()) onText(text.trim());
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Transcription failed.');
        } finally {
          setStatus('idle');
        }
      };
      recorderRef.current = rec;
      rec.start();
      setStatus('recording');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Microphone unavailable.');
      setStatus('idle');
    }
  }, [onText]);

  const toggle = useCallback(() => {
    if (status === 'recording') recorderRef.current?.stop();
    else if (status === 'idle') void start();
  }, [status, start]);

  return { status, error, toggle };
}

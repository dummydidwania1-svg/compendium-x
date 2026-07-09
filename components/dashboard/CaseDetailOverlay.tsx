'use client';

import React, {
  useState, useEffect, useRef, useMemo, useCallback,
  type ChangeEvent, type DragEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  X, RefreshCw, Upload, Loader2, Play, Pause,
  CalendarDays, Wifi, User, Trash2, Monitor, Feather, Minus,
} from 'lucide-react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage, waitForAuthUser } from '@/lib/firebase/config';
import { apiPost, apiDelete } from '@/lib/api/client';
import type { DashboardCaseEntry } from '@/lib/dashboard/live';
import { COLORS } from '@/lib/constants';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function stripTs(raw: string): string {
  return raw
    .replace(/\[\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*\]/g, '')
    .replace(/\(\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*\)/g, '')
    .replace(/<\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*>/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

type Speaker = 'Candidate' | 'Interviewer' | 'S1' | 'S2' | 'Unknown';
interface Turn { speaker: Speaker; text: string }

function parseTurns(raw: string): Turn[] {
  if (!raw.trim()) return [];
  const turns: Turn[] = [];
  let speaker: Speaker = 'Unknown';
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join(' ').trim();
    if (text) turns.push({ speaker, text });
    lines = [];
  };
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const cand = t.match(/^Candidate:\s*(.*)/);
    const intv = t.match(/^Interviewer:\s*(.*)/);
    const s1   = t.match(/^S1:\s*(.*)/);
    const s2   = t.match(/^S2:\s*(.*)/);
    if (cand)      { flush(); speaker = 'Candidate';   if (cand[1]) lines.push(cand[1]); }
    else if (intv) { flush(); speaker = 'Interviewer'; if (intv[1]) lines.push(intv[1]); }
    else if (s1)   { flush(); speaker = 'S1';          if (s1[1])   lines.push(s1[1]); }
    else if (s2)   { flush(); speaker = 'S2';          if (s2[1])   lines.push(s2[1]); }
    else           { lines.push(t); }
  }
  flush();
  return turns;
}

function fmtTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDate(d: string): string {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function scoreColor(score: number): string {
  if (score >= 3.5) return COLORS.accent;
  if (score >= 2.5) return COLORS.warm;
  return COLORS.dark;
}

function safeExt(filename: string): string {
  return filename.toLowerCase().split('.').pop()?.replace(/[^a-z0-9]/g, '') || 'jpg';
}

const WAVE_HEIGHTS = [
  12,13,13,12,13,13,11,7,5,6,9,11,11,11,13,15,14,10,6,6,7,9,
  8,9,11,14,16,13,10,8,8,8,7,6,8,12,15,15,12,10,10,10,8,5,
];

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-center gap-[6px] text-[9px] uppercase tracking-[.14em] font-semibold text-[#3D5A35] mb-[8px]">
    <span
      className="inline-block w-[3px] h-[9px] rounded-full shrink-0"
      style={{ background: 'rgba(61,90,53,.42)' }}
    />
    {children}
  </p>
);

function renderNotesLines(notes: string): React.ReactNode {
  const lines = notes.split('\n');
  return lines.map((line, i) => {
    if (line.trim() === '') {
      return <div key={i} style={{ height: '0.5em' }} />;
    }
    const indent = (line.match(/^( *)/)?.[1] ?? '').length;
    const level = Math.floor(indent / 2);
    const marginLeft = level * 16;
    const rest = line.slice(indent);
    const numMatch = rest.match(/^(\d+[.):\-])\s(.*)$/);
    const letterMatch = rest.match(/^([a-z]\))\s(.*)$/);
    const romanMatch = rest.match(/^((?:i{1,3}|iv|vi{0,3}|ix|xi{0,3})\))\s(.*)$/i);
    const bulletMatch = rest.match(/^([•–])\s(.*)$/);
    const dashMatch = rest.match(/^([-])\s(.*)$/);
    if (numMatch || letterMatch || romanMatch || bulletMatch || dashMatch) {
      const m = (numMatch || letterMatch || romanMatch || bulletMatch || dashMatch)!;
      const marker = m[1];
      const text = m[2];
      return (
        <div key={i} style={{ display: 'flex', gap: '4px', marginLeft }}>
          <span style={{ flexShrink: 0, minWidth: '20px', fontVariantNumeric: 'tabular-nums', color: 'rgba(92,64,51,.6)' }}>
            {marker}
          </span>
          <span>{text}</span>
        </div>
      );
    }
    return <div key={i} style={{ marginLeft }}>{rest}</div>;
  });
}

function useCountUp(target: number | null): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target == null) return;
    const dur = 650;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(+(eased * target).toFixed(1));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return val;
}

// ── Measurement Ring ─────────────────────────────────────────────────────────
function ScoreRing({ value, ready }: { value: number | null; ready: boolean }) {
  const animated = useCountUp(value);
  const SIZE = 124;
  const STROKE = 11;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const frac = value != null ? Math.min(value / 5, 1) : 0;
  const offset = CIRC * (1 - (ready ? frac : 0));
  const ringColor = value != null ? '#3D5A35' : 'rgba(61,90,53,.28)';
  const textColor = value != null ? scoreColor(value) : 'rgba(61,90,53,.28)';
  const display = value != null
    ? (Math.abs(animated - Math.round(animated)) < 0.05 ? String(Math.round(animated)) : animated.toFixed(1))
    : '--';

  return (
    <div className="flex flex-col items-center mx-auto">
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(217,208,196,.5)" strokeWidth={STROKE} strokeLinecap="round" />
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none" stroke={ringColor} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={offset}
            className="cdo-ring-fill"
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span className="font-serif" style={{ fontSize: 32, fontWeight: 500, lineHeight: 1, color: textColor, letterSpacing: '-0.01em' }}>
            {display}
          </span>
          <span style={{ fontSize: 9, marginTop: 4, color: 'rgba(92,64,51,.42)', lineHeight: 1 }}>out of 5</span>
        </div>
      </div>
    </div>
  );
}

function ParamBar({ label, score, ready, tag }: { label: string; score: number | null; ready: boolean; tag?: 'strongest' | 'focus' | null }) {
  const fill =
    tag === 'strongest' ? '#3D5A35'
    : tag === 'focus'   ? 'rgba(201,138,61,.55)'
    : 'rgba(61,90,53,.42)';
  return (
    <div className="flex items-center gap-[9px] mb-[10px]">
      <span className="text-[11px] font-medium w-[88px] text-right shrink-0" style={{ color: 'rgba(92,64,51,.46)' }}>
        {label}
      </span>
      <div className="relative flex-1 h-[5px] rounded-full" style={{ background: 'rgba(217,208,196,.40)' }}>
        <div
          className="h-full rounded-full transition-all duration-[900ms] ease-out"
          style={{
            width: ready && score != null ? `${(score / 5) * 100}%` : '0%',
            background: fill,
          }}
        />
        {/* midpoint tick — a quiet 2.5/5 reference mark on every track */}
        <div
          className="absolute pointer-events-none"
          style={{ left: '50%', top: '-2px', width: 1, height: 9, background: 'rgba(92,64,51,.14)' }}
        />
      </div>
      <span className="text-[11px] font-semibold w-[22px] text-right shrink-0 tabular-nums" style={{ color: 'rgba(59,47,47,.78)' }}>
        {score != null ? score.toFixed(1) : '--'}
      </span>
      {/* Fixed-width tag column keeps every bar the same length whether or not a pill renders */}
      <span className="w-[78px] shrink-0 flex justify-start">
        {tag === 'strongest' && (
          <span
            className="text-[8px] font-semibold uppercase tracking-[.08em] px-[7px] py-[2px] rounded-full whitespace-nowrap"
            style={{ color: '#3D5A35', background: 'rgba(61,90,53,.07)', border: '1px solid rgba(61,90,53,.30)' }}
          >
            Strongest
          </span>
        )}
        {tag === 'focus' && (
          <span
            className="text-[8px] font-semibold uppercase tracking-[.08em] px-[7px] py-[2px] rounded-full whitespace-nowrap"
            style={{ color: '#8a5a2b', background: 'rgba(201,138,61,.10)', border: '1px solid rgba(201,138,61,.45)' }}
          >
            Focus
          </span>
        )}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function CaseDetailOverlay({
  entry,
  onClose,
  onDeleted,
  initialTab = 'session',
}: {
  entry: DashboardCaseEntry;
  onClose: () => void;
  onDeleted?: (evaluationId: string) => void;
  initialTab?: 'session' | 'notes';
}) {
  const [isExiting, setIsExiting]     = useState(false);
  // Map legacy 'session' → 'overview'; 'notes' → 'notes'
  const [activeTab, setActiveTab]     = useState<'overview' | 'transcript' | 'notes'>(
    initialTab === 'notes' ? 'notes' : 'overview'
  );
  const [tabKey, setTabKey]           = useState(0);
  const [paramsReady, setParamsReady] = useState(false);
  // Feedback overlay
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Feedback clamp: measure whether the clamped feedback box actually overflows,
  // so the bottom fade + "Read full feedback" only appear when there's more to read.
  const feedbackBoxRef = useRef<HTMLDivElement>(null);
  const [feedbackOverflows, setFeedbackOverflows] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [hasScrolled, setHasScrolled]       = useState(false);

  const notesBoxRef = useRef<HTMLDivElement>(null);
  const [notesOverflows, setNotesOverflows] = useState(false);
  const [notesScrolled, setNotesScrolled]   = useState(false);

  // Audio
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const isSafari = typeof navigator !== 'undefined' && navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome');

  // Transcript
  const rawTranscript = useMemo(
    () => stripTs(entry.transcript || entry.transcriptPreview || ''),
    [entry.transcript, entry.transcriptPreview],
  );
  const turns = useMemo(() => parseTurns(rawTranscript), [rawTranscript]);

  // Retry
  const [retrying, setRetrying]       = useState(false);
  const [retryQueued, setRetryQueued] = useState(false);
  const [retryError, setRetryError]   = useState<string | null>(null);

  // Notes upload
  const [localUrls, setLocalUrls]     = useState<string[]>(entry.workspaceImageUrls ?? []);
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging]       = useState(false);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [replaceIdx, setReplaceIdx]   = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [zoomed, setZoomed]       = useState(false);
  const [zoomXY, setZoomXY]       = useState({ x: 50, y: 50 });
  const ZOOM_SCALE = 2.2;

  useEffect(() => { setZoomed(false); setZoomXY({ x: 50, y: 50 }); }, [expandedUrl]);

  // Zoom hint: greets the user for ~3s when the photo opens, fades away, then
  // returns briefly when they zoom in (where the pan / zoom-out guidance is
  // genuinely useful). Keyed on `zoomed` so each zoom change re-shows it.
  const [showZoomHint, setShowZoomHint] = useState(false);
  useEffect(() => {
    if (!expandedUrl) { setShowZoomHint(false); return; }
    setShowZoomHint(true);
    const t = window.setTimeout(() => setShowZoomHint(false), 3000);
    return () => window.clearTimeout(t);
  }, [expandedUrl, zoomed]);

  const [lightboxExiting, setLightboxExiting] = useState(false);
  const closeLightbox = useCallback(() => {
    setLightboxExiting(true);
    window.setTimeout(() => { setExpandedUrl(null); setLightboxExiting(false); }, 200);
  }, []);

  // Lightbox ESC (capture phase, highest priority)
  useEffect(() => {
    if (!expandedUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeLightbox(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expandedUrl, closeLightbox]);

  // Feedback overlay ESC
  useEffect(() => {
    if (!feedbackOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFeedbackOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedbackOpen]);

  // Re-measure feedback overflow whenever the box resizes (flex height is dynamic)
  // or when the content / tab changes.
  useEffect(() => {
    const el = feedbackBoxRef.current;
    if (!el) { setFeedbackOverflows(false); return; }
    const check = () => setFeedbackOverflows(el.scrollHeight - el.clientHeight > 6);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [entry.notes, activeTab]);

  const handleZoomMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setZoomXY({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  };

  // Derived
  // While a Remote session's merged audio is still being generated, we neither
  // play nor load any single-mic track — the UI shows a "generating" state
  // instead. Once the audio side resolves (mergedAudioStatus), it lands on one
  // of: 'completed' (both sides stitched, mergedAudioUrl points at that file),
  // 'single_side' (only one side had usable audio — mergedAudioUrl already
  // points directly at that one side's own track, written by evaluateAndMerge),
  // or 'none' (neither side had usable audio). Same Device sessions and
  // sessions that pre-date this fix fall back to the single candidate track
  // as before.
  const audioMergePending = entry.audioMergePending;
  const mergedAudioStatus = entry.mergedAudioStatus ?? null;
  const audioResolvedNone = mergedAudioStatus === 'none';
  // 'failed' = the merge step itself gave up after retries (ffmpeg/download
  // error) rather than there being no audio to stitch in the first place —
  // shown with its own honest message instead of looking like eternal "generating".
  const audioResolvedFailed = mergedAudioStatus === 'failed';
// Same-device (local): audio resolved to nothing usable (embedded transcript
// failed — empty/silent/zero-byte). Mirrors audioResolvedNone for local.
const localAudioResolvedNone = entry.localAudioResolvedNone ?? false;
const audioUrl         = audioMergePending ? null : (entry.mergedAudioUrl ?? entry.audioUrl ?? entry.interviewerAudioUrl ?? null);
const hasAudio         = !audioMergePending && !audioResolvedNone && !audioResolvedFailed && !localAudioResolvedNone && entry.hasAudio && !!audioUrl;
  const transcriptStatus = entry.transcriptStatus ?? null;
  const transcriptReason = entry.transcriptReason ?? null;
  const scoreVal         = entry.isUnrated ? null : (entry.score ?? null);
  const sessionMode      = entry.sessionMode;
// Same-device (local) partial recording: candidate window closed mid-session
// ('page_hide') but what was captured transcribed fine — show a partial notice.
const localPartialRecording = sessionMode === 'Same Device' && transcriptStatus === 'completed' && entry.localStopReason === 'page_hide';
const playedRatio      = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  // Overview computed flags
  const hasFeedback = !!entry.notes?.trim();
  const hasScore    = !entry.isUnrated && entry.score != null;

  // Animate params on mount
  useEffect(() => {
    const t = setTimeout(() => setParamsReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Scroll hint
  useEffect(() => {
    if (hasScrolled) { setShowScrollHint(false); return; }
    const el = scrollRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      const overflows = el.scrollHeight - el.clientHeight > 24;
      setShowScrollHint(overflows && el.scrollTop <= 1);
    }, 360);
    return () => clearTimeout(t);
  }, [tabKey, hasScrolled, turns.length]);

  const handleContentScroll = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop > 2 && !hasScrolled) {
      setHasScrolled(true);
      setShowScrollHint(false);
    }
  };

  useEffect(() => {
    const el = notesBoxRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      setNotesOverflows(el.scrollHeight - el.clientHeight > 8);
    }, 200);
    return () => clearTimeout(t);
  }, [entry.notes]);

  const handleNotesScroll = () => {
    const el = notesBoxRef.current;
    if (el && el.scrollTop > 4) setNotesScrolled(true);
  };

  // Close with exit animation
  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(onClose, 210);
  }, [onClose]);

  // Delete this session/evaluation permanently, then remove it from the
  // dashboard list and close the overlay.
  const handleDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete(`/api/evaluations/${encodeURIComponent(entry.evaluationId)}`, {});
      onDeleted?.(entry.evaluationId);
      setConfirmDelete(false);
      handleClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this session. Try again.');
    } finally {
      setDeleting(false);
    }
  }, [deleting, entry.evaluationId, onDeleted, handleClose]);

  // ESC closes modal (only when lightbox, feedback overlay, and delete confirm
  // are all closed; the delete confirm swallows ESC to dismiss itself first).
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (expandedUrl || feedbackOpen) return;
      if (confirmDelete) { setConfirmDelete(false); return; }
      handleClose();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [handleClose, expandedUrl, feedbackOpen, confirmDelete]);

  // Server-computed duration (decoded from the actual audio, not the file's
  // own container metadata) — authoritative when present. A recording that
  // went through a mic-drop/resume cycle produces a WebM/MP4 file whose
  // embedded duration is misleadingly short even though all the audio plays
  // in full, so when this field exists we skip asking the browser entirely
  // rather than risk it clobbering a correct value with a wrong one.
  const authoritativeDurationSec =
    entry.mergedAudioDurationMs && entry.mergedAudioDurationMs > 0
      ? entry.mergedAudioDurationMs / 1000
      : null;

  // Seed duration from the authoritative server value the moment it's known,
  // so the label/seek-bar are correct even before the <audio> element loads
  // anything.
  useEffect(() => {
    if (authoritativeDurationSec) setDuration(authoritativeDurationSec);
  }, [authoritativeDurationSec]);

  // Audio effects
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let seekingForDuration = false;
    // When the server already gave us the true duration, never let the
    // browser's own (possibly wrong, see authoritativeDurationSec above)
    // reading overwrite it — only track playback position.
    const setDurationIfNotAuthoritative = (d: number) => {
      if (authoritativeDurationSec) return;
      setDuration(d);
    };

    // MediaRecorder WebM files don't write the duration into the file header
    // (it's unknown during recording). The browser reports NaN/Infinity after
    // loadedmetadata. Seeking to a very large position forces the browser to
    // fetch the file's tail, after which it can report a finite duration.
    // Chrome tolerates this early; Safari aborts the load if we seek before
    // canplay, so we defer to the canplay handler there.
    const seekForDuration = () => {
      if (seekingForDuration) return;
      seekingForDuration = true;
      try { audio.currentTime = 1e101; } catch { seekingForDuration = false; }
    };

    const tryResolveDuration = () => {
      if (authoritativeDurationSec) return;
      const d = audio.duration;
      if (isFinite(d) && d > 0) { setDurationIfNotAuthoritative(d); return; }
      if (!isSafari) seekForDuration();
    };

    // Safari: defer the seek until the element reports it can play.
    // At this point the browser has buffered enough that seeking won't abort.
    const onCanPlay = () => {
      if (authoritativeDurationSec) return;
      const d = audio.duration;
      if (isFinite(d) && d > 0) { setDurationIfNotAuthoritative(d); return; }
      if (isSafari) seekForDuration();
    };

    const onDurationChange = () => {
      const d = audio.duration;
      if (!isFinite(d) || d <= 0) return;
      setDurationIfNotAuthoritative(d);
      if (seekingForDuration) { seekingForDuration = false; audio.currentTime = 0; }
    };
    const onTime = () => {
      if (seekingForDuration) return;
      setCurrentTime(audio.currentTime);
      if (authoritativeDurationSec) return;
      const d = audio.duration;
      if (isFinite(d) && d > 0) setDuration(prev => prev || d);
    };
    const onEnd = () => {
      setIsPlaying(false);
      if (authoritativeDurationSec) return;
      if (audio.currentTime > 0) setDuration(prev => prev || audio.currentTime);
    };
    audio.addEventListener('loadedmetadata', tryResolveDuration);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    if (audio.readyState >= 1) tryResolveDuration();
    if (audio.readyState >= 3) onCanPlay(); // HAVE_FUTURE_DATA — already ready
    return () => {
      audio.removeEventListener('loadedmetadata', tryResolveDuration);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, [isSafari, authoritativeDurationSec]);

  // Tab switch — updated to new tab type
  const switchTab = (tab: 'overview' | 'transcript' | 'notes') => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setTabKey(k => k + 1);
  };

  // Audio controls
  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) { a.pause(); setIsPlaying(false); return; }
    if (!hasPlayedOnce) setHasPlayedOnce(true);
    void a.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  const seekTo = (ratio: number) => {
    const a = audioRef.current;
    if (!a) return;
    const dur = (a.duration && isFinite(a.duration) && a.duration > 0) ? a.duration : duration;
    if (!dur) return;
    const t = Math.max(0, Math.min(ratio, 1)) * dur;
    a.currentTime = t;
    setCurrentTime(t);
  };

  const setSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const onWaveClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  };

  // Retry transcript
  const handleRetry = async () => {
    if (!entry.lobbyId || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(entry.lobbyId)}/recording/retry-transcript`, {});
      setRetryQueued(true);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRetrying(false);
    }
  };

  // Upload photo
  const uploadFile = async (file: File | null | undefined) => {
    if (!file || uploading) return;
    setUploadError('');
    if (!file.type.startsWith('image/')) {
      setUploadError('Pick an image file (PNG, JPG, HEIC).'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image must be under 10 MB.'); return;
    }
    setUploading(true);
    try {
      const user = await waitForAuthUser();
      if (!user) throw new Error('Sign in to upload photos.');
      const ext  = safeExt(file.name);
      const path = `workspace-images/${user.uid}/${entry.evaluationId}/${Date.now()}.${ext}`;
      const ref  = storageRef(storage, path);
      await uploadBytes(ref, file, { contentType: file.type });
      const url  = await getDownloadURL(ref);
      await apiPost(`/api/evaluations/${encodeURIComponent(entry.evaluationId)}/workspace-image`, {
        storagePath: path, workspaceImageUrl: url,
      });
      setLocalUrls(prev => [...prev, url]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    void uploadFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void uploadFile(e.dataTransfer.files?.[0]);
  };

  const removePhoto = async (idx: number) => {
    const url = localUrls[idx];
    if (!url) return;
    setLocalUrls(prev => prev.filter((_, i) => i !== idx));
    try {
      await apiDelete(`/api/evaluations/${encodeURIComponent(entry.evaluationId)}/workspace-image`, {
        workspaceImageUrl: url,
      });
    } catch {
      setLocalUrls(prev => { const next = [...prev]; next.splice(idx, 0, url); return next; });
    }
  };

  const handleReplaceInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || replaceIdx === null) return;
    const oldUrl = localUrls[replaceIdx];
    await uploadFile(file);
    if (oldUrl) {
      try {
        await apiDelete(`/api/evaluations/${encodeURIComponent(entry.evaluationId)}/workspace-image`, {
          workspaceImageUrl: oldUrl,
        });
        setLocalUrls(prev => prev.filter(u => u !== oldUrl));
      } catch { /* new image already added */ }
    }
    setReplaceIdx(null);
  };

  // ─────────────────────────────────────────────────────────────
  // Overview: performance parameters + strongest / focus tags
  // ─────────────────────────────────────────────────────────────

  const paramRows = [
    { label: 'Structure',     val: entry.structure },
    { label: 'Understanding', val: entry.analysis },
    { label: 'Delivery',      val: entry.delivery },
    { label: 'Creativity',    val: entry.creativity },
  ];

  // Tag the single best and single weakest parameter — only when the session
  // is scored, at least two parameters are present, and they aren't all tied.
  let strongestLabel: string | null = null;
  let focusLabel: string | null = null;
  const numericParams = paramRows.filter(r => r.val != null) as { label: string; val: number }[];
  if (hasScore && numericParams.length >= 2) {
    const maxVal = Math.max(...numericParams.map(r => r.val));
    const minVal = Math.min(...numericParams.map(r => r.val));
    if (maxVal !== minVal) {
      strongestLabel = numericParams.find(r => r.val === maxVal)!.label;
      focusLabel     = numericParams.find(r => r.val === minVal)!.label;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ padding: '64px 16px 24px' }}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${isExiting ? 'opacity-0' : 'opacity-100'}`}
        style={{ background: 'rgba(59,47,47,.28)', backdropFilter: 'blur(4px)' }}
      />

      {/* Modal shell — fixed height so flex children resolve to definite sizes,
          which lets the inner scroll container use overflow-y:auto correctly. */}
      <div
        className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[#fff8f0] ${isExiting ? 'animate-scale-out' : 'animate-scale-in'}`}
        style={{
          width: 'min(92vw, 800px)',
          height: 'min(80vh, 680px)',
          borderColor: 'rgba(61,90,53,.1)',
          boxShadow: '0 20px 56px rgba(59,47,47,.14)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── EDITION STAMP — dossier signature line ── */}
        <div
          className="flex-shrink-0"
          style={{ height: 3, background: 'linear-gradient(90deg, #3D5A35, #7a5a3f 60%, #5C4033)' }}
        />

        {/* ── RAISED HEADER BAND ── */}
        <div
          className="flex items-start justify-between flex-shrink-0"
          style={{
            padding: '12px 18px 12px',
            background: 'linear-gradient(180deg, #f4ead9, #efe1cd)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.75), 0 4px 10px rgba(92,64,51,.10)',
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[4px]">
              <h2 className="font-serif text-[22px] font-[500] text-[#3B2F2F] leading-[1.15] tracking-[-0.01em]">
                {entry.name}
              </h2>
              {/* Inline chips */}
              <div className="flex flex-wrap gap-[5px]">
                <span
                  className="inline-flex items-center gap-[5px] text-[10.5px] font-medium px-[9px] py-[3px] rounded-full"
                  style={{ background: 'rgba(255,248,240,.85)', border: '1px solid rgba(92,64,51,.14)', color: '#5C4033' }}
                >
                  <span className="inline-block shrink-0" style={{ width: 5, height: 5, borderRadius: '50%', background: '#3D5A35' }} />
                  {entry.type}
                </span>
                <span
                  className="inline-flex items-center gap-[5px] text-[10.5px] font-medium px-[9px] py-[3px] rounded-full"
                  style={{ background: 'rgba(255,248,240,.85)', border: '1px solid rgba(92,64,51,.14)', color: '#5C4033' }}
                >
                  <span className="inline-block shrink-0" style={{ width: 5, height: 5, borderRadius: '50%', background: '#c98a3d' }} />
                  {entry.level}
                </span>
                {entry.company && (
                  <span
                    className="inline-flex items-center text-[10.5px] font-medium px-[9px] py-[3px] rounded-full"
                    style={{ background: 'rgba(255,248,240,.85)', border: '1px solid rgba(92,64,51,.14)', color: '#5C4033' }}
                  >
                    {entry.company}
                  </span>
                )}
              </div>
            </div>
            {/* Byline — the single home for session metadata (date · mode · interviewer) */}
            <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px] mt-[8px]">
              <span className="inline-flex items-center gap-[5px]">
                <CalendarDays className="w-[11px] h-[11px]" style={{ color: 'rgba(92,64,51,.42)' }} />
                <span className="text-[10.5px] font-semibold text-[#3B2F2F]">{fmtDate(entry.date)}</span>
              </span>
              <span className="text-[10px]" style={{ color: 'rgba(92,64,51,.30)' }}>·</span>
              <span className="inline-flex items-center gap-[5px]">
                {sessionMode === 'Remote'
                  ? <Wifi className="w-[11px] h-[11px]" style={{ color: 'rgba(92,64,51,.42)' }} />
                  : <Monitor className="w-[11px] h-[11px]" style={{ color: 'rgba(92,64,51,.42)' }} />}
                <span className="text-[10.5px]" style={{ color: 'rgba(92,64,51,.56)' }}>{sessionMode}</span>
              </span>
              <span className="text-[10px]" style={{ color: 'rgba(92,64,51,.30)' }}>·</span>
              <span className="inline-flex items-center gap-[5px]">
                <User className="w-[11px] h-[11px]" style={{ color: 'rgba(92,64,51,.42)' }} />
                {entry.interviewerName
                  ? <span className="text-[10.5px]" style={{ color: 'rgba(92,64,51,.56)' }}>{entry.interviewerName}</span>
                  : <span className="text-[10.5px] italic" style={{ color: 'rgba(92,64,51,.42)' }}>Interviewer name not available</span>}
              </span>
            </div>
          </div>
          {/* Header actions — delete + close */}
          <div className="flex items-center gap-[7px] ml-[12px] shrink-0 mt-[2px]">
            {/* Delete session */}
            <button
              onClick={() => { setDeleteError(null); setConfirmDelete(true); }}
              aria-label="Delete this session"
              title="Delete this session"
              className="w-[20px] h-[20px] rounded-full flex items-center justify-center transition-colors duration-150"
              style={{ background: 'rgba(217,208,196,.5)', color: '#5C4033' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#b4543e'; (e.currentTarget as HTMLElement).style.color = '#F0EBE3'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(217,208,196,.5)'; (e.currentTarget as HTMLElement).style.color = '#5C4033'; }}
            >
              <Trash2 className="w-[10px] h-[10px]" />
            </button>
            {/* Close button */}
            <button
              onClick={handleClose}
              aria-label="Close"
              className="w-[20px] h-[20px] rounded-full flex items-center justify-center transition-colors duration-150"
              style={{ background: 'rgba(217,208,196,.5)', color: '#5C4033' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3B2F2F'; (e.currentTarget as HTMLElement).style.color = '#F0EBE3'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(217,208,196,.5)'; (e.currentTarget as HTMLElement).style.color = '#5C4033'; }}
            >
              <X className="w-[10px] h-[10px]" />
            </button>
          </div>
        </div>

        {/* ── TAB BAR ── */}
        <div
          className="flex flex-shrink-0 px-[16px] bg-[#fff8f0]"
          style={{ borderBottom: '1px solid rgba(92,64,51,.07)' }}
        >
          {(['overview', 'transcript', 'notes'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`text-[12px] py-[10px] px-[14px] border-b-2 transition-all duration-150 tracking-[.06em] uppercase ${
                activeTab === tab
                  ? 'text-[#3D5A35] font-semibold'
                  : 'border-transparent font-medium'
              }`}
              style={activeTab === tab ? { borderColor: '#3D5A35' } : { color: 'rgba(92,64,51,.42)' }}
            >
              {tab === 'overview' ? 'OVERVIEW' : tab === 'transcript' ? 'TRANSCRIPT' : 'NOTES'}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ──
            flex-basis: 0 gives the outer div a definite pixel height from the
            flex algorithm (= modal height minus header + tabs + audio bar).
            The inner div fills it with absolute inset-0 so overflow-y:auto has
            a concrete height to scroll against. maxHeight:'100%' does NOT work
            reliably when the parent only has a flex-computed height. */}
        <div className="relative overflow-hidden min-h-0" style={{ flex: '1 1 0' }}>
          <div
            key={tabKey}
            ref={scrollRef}
            onScroll={handleContentScroll}
            className="overflow-y-auto animate-tab-in"
            style={{ scrollbarWidth: 'none', position: 'absolute', inset: 0 }}
          >
            <style>{`
              div::-webkit-scrollbar{display:none}
              .cdo-notes::-webkit-scrollbar{display:block;width:3px}
              .cdo-notes::-webkit-scrollbar-track{background:transparent}
              .cdo-notes::-webkit-scrollbar-thumb{background:rgba(92,64,51,0.15);border-radius:9px}
              .cdo-notes::-webkit-scrollbar-thumb:hover{background:rgba(92,64,51,0.28)}
              .cdo-notes{scrollbar-width:thin;scrollbar-color:rgba(92,64,51,0.15) transparent}
              @keyframes cdo-hint-fade-in{from{opacity:0}to{opacity:1}}
              @keyframes cdo-hint-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
              .cdo-ring-fill{transition:stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)}
              @media(prefers-reduced-motion:reduce){.cdo-ring-fill{transition:none}}
            `}</style>

            {/* ── OVERVIEW TAB ──
                Stacked full-width bands: PERFORMANCE on top, INTERVIEWER
                FEEDBACK below. Session metadata lives ONLY in the header
                byline. The feedback band flex-grows so the two bands always
                end flush with the bottom of the content area — empty states
                render as dashed panels instead of leaving ragged blank space.
                Covers all four hasScore × hasFeedback combinations. */}
            {activeTab === 'overview' && (
              <div className="flex flex-col p-[18px_24px] pb-[22px]" style={{ height: '100%' }}>

                {/* Band 1 — Performance (scored: ring + parameter bars / unscored: dashed strip) */}
                <div className="shrink-0">
                  <SectionLabel>Performance</SectionLabel>
                  {hasScore ? (
                    <div className="flex items-center gap-[24px] py-[4px]">
                      <ScoreRing value={scoreVal} ready={paramsReady} />
                      <div className="self-stretch shrink-0" style={{ width: 1, background: 'rgba(92,64,51,.10)' }} />
                      <div className="flex-1 min-w-0">
                        {paramRows.map(({ label, val }) => (
                          <ParamBar
                            key={label}
                            label={label}
                            score={val}
                            ready={paramsReady}
                            tag={label === strongestLabel ? 'strongest' : label === focusLabel ? 'focus' : null}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-[12px] rounded-[12px]"
                      style={{ border: '1.5px dashed rgba(92,64,51,.20)', background: 'rgba(244,237,227,.35)', padding: '14px 16px' }}
                    >
                      <div
                        className="flex items-center justify-center rounded-full shrink-0"
                        style={{ width: 26, height: 26, border: '1.5px dashed rgba(92,64,51,.30)', color: 'rgba(92,64,51,.40)' }}
                      >
                        <Minus className="w-[11px] h-[11px]" />
                      </div>
                      <span className="font-serif italic text-[13px]" style={{ color: 'rgba(92,64,51,.55)' }}>
                        This session wasn&apos;t scored.
                      </span>
                    </div>
                  )}
                </div>

                {/* Band divider */}
                <div className="shrink-0" style={{ height: 1, background: 'rgba(92,64,51,.08)', margin: '16px 0 14px' }} />

                {/* Band 2 — Interviewer Feedback (fills remaining height) */}
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="flex items-baseline justify-between">
                    <SectionLabel>Interviewer Feedback</SectionLabel>
                    {hasFeedback && entry.interviewerName && (
                      <span className="text-[10.5px]" style={{ color: 'rgba(92,64,51,.48)' }}>
                        by <span className="font-semibold" style={{ color: 'rgba(92,64,51,.72)' }}>{entry.interviewerName}</span>
                      </span>
                    )}
                  </div>
                  {hasFeedback ? (
                    <>
                      {/* The clamped text box is its OWN positioning context, so the
                          bottom fade lives inside it and can never overlap the "Read
                          full feedback" link below. Fade + link only render when the
                          text actually overflows the space this band was given. */}
                      <div
                        ref={feedbackBoxRef}
                        className="text-[12.5px] leading-[1.7] rounded-[8px] px-[14px] py-[12px]"
                        style={{
                          color: 'rgba(92,64,51,.82)',
                          background: 'rgba(61,90,53,.06)',
                          flex: '1 1 0',
                          minHeight: 0,
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        {renderNotesLines(entry.notes?.trim() ?? '')}
                        {feedbackOverflows && (
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            height: 40, pointerEvents: 'none',
                            background: 'linear-gradient(to bottom, rgba(242,247,238,0), rgba(242,247,238,.97))',
                          }} />
                        )}
                      </div>
                      {feedbackOverflows && (
                        <button
                          className="mt-[8px] self-start text-[11px] font-semibold"
                          style={{ color: '#3D5A35' }}
                          onClick={() => setFeedbackOpen(true)}
                        >
                          Read full feedback →
                        </button>
                      )}
                    </>
                  ) : (
                    <div
                      className="flex-1 flex flex-col items-center justify-center gap-[10px] rounded-[12px]"
                      style={{ border: '1.5px dashed rgba(92,64,51,.20)', background: 'rgba(244,237,227,.35)', minHeight: 110 }}
                    >
                      <div className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: 'rgba(92,64,51,.06)' }}>
                        <Feather className="w-[18px] h-[18px]" style={{ color: 'rgba(92,64,51,.40)' }} />
                      </div>
                      <span className="font-serif italic text-[13.5px]" style={{ color: 'rgba(92,64,51,.55)' }}>
                        No written feedback yet.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TRANSCRIPT TAB ── */}
            {activeTab === 'transcript' && (
              <div className="p-[18px_20px] pb-[40px]">
                <SectionLabel>Transcript</SectionLabel>

                {entry.hasTranscript && turns.length > 0 && (
                  <div className="flex flex-col gap-[10px]">
                    {(transcriptStatus === 'partial' || localPartialRecording) && (
                      <div
                        className="text-[12px] leading-[1.65] px-[12px] py-[9px] rounded-[7px] mb-[3px]"
                        style={{ color: 'rgba(92,64,51,.52)', background: 'rgba(217,208,196,.1)', border: '1px solid rgba(217,208,196,.32)' }}
                      >
                        {localPartialRecording
  ? "Only part of this recording came through, since the candidate's window closed partway through."
  : transcriptReason === 'interviewer_interrupted'
                          ? 'The interviewer disconnected mid-session so their audio cuts off partway through.'
                          : transcriptReason === 'candidate_interrupted'
                            ? 'Your connection dropped mid-session, so your audio cuts off partway through.'
                            : transcriptReason === 'candidate_never_recorded' || transcriptReason === 'candidate_transcription_failed'
                              ? "Your side wasn't recorded this time, so the transcript only covers the interviewer."
                              : 'Only your audio was captured this time, so the transcript only covers your side.'}
                      </div>
                    )}
                    {turns.map((turn, i) => {
                      // S1/S2 come from ElevenLabs diarized local sessions.
                      // Candidate/Interviewer come from remote dual-mic sessions.
                      // S1 and Candidate are styled as the "right" bubble (candidate-side);
                      // S2 and Interviewer are styled as the "left" bubble (interviewer-side).
                      const isRight = turn.speaker === 'Candidate' || turn.speaker === 'S1';
                      const isDiarized = turn.speaker === 'S1' || turn.speaker === 'S2';
                      const avatarLabel = isDiarized
                        ? turn.speaker
                        : (turn.speaker === 'Candidate' ? 'C' : 'I');
                      const displayLabel = isDiarized
                        ? turn.speaker
                        : (turn.speaker === 'Candidate' ? 'You' : 'Interviewer');
                      return (
                        <div
                          key={i}
                          className={`flex gap-[8px] items-start animate-turn-in ${isRight ? 'flex-row-reverse' : ''}`}
                          style={{ animationDelay: `${Math.min(i * 28, 260)}ms` }}
                        >
                          <div
                            className="w-[24px] h-[24px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-[16px]"
                            style={
                              isRight
                                ? { background: 'rgba(92,64,51,.13)', color: '#5C4033', border: '1px solid rgba(92,64,51,.24)' }
                                : { background: 'rgba(61,90,53,.16)', color: '#3D5A35', border: '1px solid rgba(61,90,53,.30)' }
                            }
                          >
                            {avatarLabel}
                          </div>
                          <div className={`flex flex-col max-w-[80%] ${isRight ? 'items-end' : 'items-start'}`}>
                            <span
                              className="text-[9px] font-semibold uppercase tracking-[.07em] mb-[3px] px-[2px]"
                              style={{ color: isRight ? 'rgba(92,64,51,.46)' : 'rgba(61,90,53,.60)' }}
                            >
                              {displayLabel}
                            </span>
                            <div
                              className="px-[13px] py-[10px] text-[12.5px] leading-[1.65]"
                              style={
                                isRight
                                  ? { color: '#3B2F2F', background: 'rgba(92,64,51,.055)', border: '1px solid rgba(92,64,51,.13)', borderRadius: '12px 12px 3px 12px' }
                                  : { color: '#33402E', background: 'rgba(61,90,53,.075)', border: '1px solid rgba(61,90,53,.17)', borderLeft: '2.5px solid rgba(61,90,53,.34)', borderRadius: '4px 12px 12px 4px' }
                              }
                            >
                              {turn.text}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(transcriptStatus === 'processing' || transcriptStatus === 'pending') && (
                  <div
                    className="px-[14px] py-[12px] rounded-[7px] text-[12px] leading-[1.65]"
                    style={{ color: 'rgba(92,64,51,.62)', background: 'rgba(61,90,53,.04)', border: '1px solid rgba(61,90,53,.09)' }}
                  >
                    Generating your transcript right now. It'll show up here automatically once it's done. Still not here after 5 minutes? Check back shortly, it's likely just running a little behind.
                  </div>
                )}

                {transcriptStatus === 'failed' && (
                  <div
                    className="px-[12px] py-[10px] rounded-[7px]"
                    style={{ background: 'rgba(217,208,196,.10)', border: '1px solid rgba(217,208,196,.32)' }}
                  >
                    <p className="text-[12px] leading-[1.65]" style={{ color: 'rgba(92,64,51,.62)' }}>
                      Transcript didn't come through. The audio might have been too short or mostly silent.
                    </p>
                  </div>
                )}

                {!entry.hasTranscript && !transcriptStatus && (
                  <p className="text-[12px]" style={{ color: 'rgba(92,64,51,.48)' }}>
                    No transcript available for this session.
                  </p>
                )}
                {entry.hasAudio && !entry.hasTranscript && transcriptStatus === null && (
                  <p className="text-[12px] leading-[1.6]" style={{ color: 'rgba(92,64,51,.48)' }}>
                    Transcript wasn't generated for this recording.
                  </p>
                )}
              </div>
            )}

            {/* ── NOTES TAB ── (kept identical to original) */}
            {activeTab === 'notes' && (
              <div className="p-[18px_20px] pb-[40px]">
                <p className="text-[12px] mb-[16px]" style={{ color: 'rgba(92,64,51,.48)' }}>
                  Photos of your handwritten notes and frameworks from this case.
                </p>

                {localUrls.length > 0 && (
                  <div className="flex flex-wrap gap-[9px] mb-[14px]">
                    {localUrls.map((url, i) => (
                      <div
                        key={i}
                        onClick={() => setExpandedUrl(url)}
                        className="group relative w-[92px] h-[92px] rounded-[8px] overflow-hidden cursor-pointer transition-all duration-150"
                        style={{ background: 'rgba(217,208,196,.18)', border: '1px solid rgba(217,208,196,.40)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(59,47,47,.10)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                      >
                        <img src={url} alt={`Note ${i + 1}`} className="w-full h-full object-cover" />
                        <div
                          className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-[4px] py-[6px] opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0"
                          style={{ background: 'linear-gradient(to top, rgba(59,47,47,.62) 0%, rgba(59,47,47,.0) 100%)', backdropFilter: 'blur(2px)' }}
                          onClick={e => { e.stopPropagation(); setReplaceIdx(i); replaceInputRef.current?.click(); }}
                        >
                          <RefreshCw className="w-[11px] h-[11px] text-white/80" />
                          <span className="text-[9px] font-semibold text-white/80 tracking-[.04em]">Replace</span>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); void removePhoto(i); }}
                          aria-label="Remove photo"
                          className="absolute top-[4px] right-[4px] w-[16px] h-[16px] rounded-full flex items-center justify-center transition-all duration-150"
                          style={{ background: 'rgba(255,248,240,.72)', border: '1px solid rgba(59,47,47,.12)', color: 'rgba(59,47,47,.55)', backdropFilter: 'blur(4px)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3B2F2F'; (e.currentTarget as HTMLElement).style.color = '#F0EBE3'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,248,240,.72)'; (e.currentTarget as HTMLElement).style.color = 'rgba(59,47,47,.55)'; (e.currentTarget as HTMLElement).style.transform = ''; }}
                        >
                          <X className="w-[8px] h-[8px]" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={e => { void handleReplaceInput(e); }} />

                <div
                  onDragEnter={() => setDragging(true)}
                  onDragOver={e => e.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-[7px] rounded-[10px] py-[30px] cursor-pointer transition-all duration-200 w-full"
                  style={{ border: `1.5px dashed ${dragging ? '#3D5A35' : 'rgba(61,90,53,.20)'}`, background: dragging ? 'rgba(61,90,53,.04)' : 'transparent' }}
                  onMouseEnter={e => { if (!dragging) { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(61,90,53,.34)'; (e.currentTarget as HTMLElement).style.background = 'rgba(61,90,53,.025)'; } }}
                  onMouseLeave={e => { if (!dragging) { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(61,90,53,.20)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
                >
                  {uploading
                    ? <Loader2 className="w-[18px] h-[18px] animate-spin" style={{ color: 'rgba(92,64,51,.38)' }} />
                    : <Upload className="w-[16px] h-[16px]" style={{ color: 'rgba(92,64,51,.25)' }} />
                  }
                  <p className="text-[11px] font-medium" style={{ color: 'rgba(59,47,47,.62)' }}>
                    {uploading ? 'Uploading...' : localUrls.length > 0 ? 'Add another photo' : 'Drop your photo here'}
                  </p>
                  <p className="text-[10px]" style={{ color: 'rgba(92,64,51,.32)' }}>
                    {uploading ? 'Hang on a moment' : 'or click to browse. PNG, JPG, HEIC up to 10 MB.'}
                  </p>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
                {uploadError && (
                  <p className="text-[10.5px] mt-[10px]" style={{ color: 'rgba(92,64,51,.62)' }}>{uploadError}</p>
                )}
              </div>
            )}
          </div>

          {/* Scroll-hint fade — pinned to the bottom of the content region */}
          <div
            className={`absolute bottom-0 left-0 right-0 pointer-events-none transition-all duration-500 ${showScrollHint ? 'animate-scroll-hint' : ''}`}
            style={{ height: showScrollHint ? '34px' : '16px', background: 'linear-gradient(to bottom, rgba(255,248,240,0), #fff8f0)', zIndex: 2 }}
          />
        </div>

        {/* ── MERGED AUDIO GENERATING (Remote session, merge still running) ── */}
        {audioMergePending && (
          <div
            className="flex-shrink-0 px-[16px] pt-[9px] pb-[10px]"
            style={{ borderTop: '1px solid rgba(92,64,51,.07)', background: 'linear-gradient(180deg, rgba(92,64,51,.012) 0%, rgba(92,64,51,.028) 100%)' }}
          >
            <div className="flex items-center gap-[9px]">
              <span
                className="w-[13px] h-[13px] rounded-full shrink-0 animate-spin"
                style={{ border: '1.5px solid rgba(61,90,53,.22)', borderTopColor: '#3D5A35' }}
              />
              <span className="text-[10.5px] font-medium" style={{ color: 'rgba(92,64,51,.62)' }}>
                Stitching your audio together, check back in 5
              </span>
            </div>
          </div>
        )}

        {/* ── SINGLE-SIDE AUDIO REASON (only one side had usable audio) ── */}
        {!audioMergePending && (mergedAudioStatus === 'single_side' || localPartialRecording) && hasAudio && (
          <div
            className="flex-shrink-0 px-[16px] pt-[9px]"
            style={{ background: 'linear-gradient(180deg, rgba(92,64,51,.012) 0%, rgba(92,64,51,.028) 100%)' }}
          >
            <p className="text-[10.5px] leading-[1.5]" style={{ color: 'rgba(92,64,51,.55)' }}>
              {localPartialRecording
  ? "Only part of this recording came through, since the candidate's window closed partway through."
  : entry.mergedAudioReason === 'interviewer_declined'
                ? "Your interviewer skipped sharing their mic, so here's your side of the conversation."
                : entry.mergedAudioReason === 'interviewer_no_audio'
                ? "Looks like your interviewer's side never came through, so here's your side of the conversation."
                : "Your side of the recording didn't come through, so here's your interviewer's side."}
            </p>
          </div>
        )}

        {/* ── NO AUDIO AT ALL (neither side had usable audio) ── */}
        {!audioMergePending && (audioResolvedNone || localAudioResolvedNone) && (
          <div
            className="flex-shrink-0 px-[16px] py-[10px]"
            style={{ borderTop: '1px solid rgba(92,64,51,.07)', background: 'linear-gradient(180deg, rgba(92,64,51,.012) 0%, rgba(92,64,51,.028) 100%)' }}
          >
            <p className="text-[10.5px] font-medium" style={{ color: 'rgba(92,64,51,.48)' }}>
              No audio for this session.
            </p>
          </div>
        )}

        {/* ── AUDIO MERGE FAILED (both sides had usable audio, but stitching them together didn't work) ── */}
        {!audioMergePending && audioResolvedFailed && (
          <div
            className="flex-shrink-0 px-[16px] py-[10px]"
            style={{ borderTop: '1px solid rgba(92,64,51,.07)', background: 'linear-gradient(180deg, rgba(92,64,51,.012) 0%, rgba(92,64,51,.028) 100%)' }}
          >
            <p className="text-[10.5px] font-medium" style={{ color: 'rgba(92,64,51,.48)' }}>
              Audio couldn't be generated for this session.
            </p>
          </div>
        )}

        {/* ── AUDIO PLAYER (persistent, flex-shrink-0) ── */}
        {hasAudio && (
          <div
            className="flex-shrink-0 px-[16px] pt-[9px] pb-[10px]"
            style={{ borderTop: '1px solid rgba(92,64,51,.07)', background: 'linear-gradient(180deg, rgba(92,64,51,.012) 0%, rgba(92,64,51,.028) 100%)' }}
          >
            <div className="flex items-center gap-[11px]">
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 transition-all duration-200${!hasPlayedOnce ? ' animate-play-pulse' : ''}`}
                style={{ background: '#3D5A35', color: '#fff8f0', boxShadow: '0 2px 8px rgba(61,90,53,.28)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#33502c'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.06)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#3D5A35'; (e.currentTarget as HTMLElement).style.transform = ''; }}
              >
                {isPlaying ? <Pause className="w-[11px] h-[11px]" /> : <Play className="w-[11px] h-[11px] ml-[1.5px]" />}
              </button>

              <div
                className="group relative flex items-center gap-[2.5px] flex-1 min-w-0 cursor-pointer"
                style={{ height: '26px' }}
                onClick={onWaveClick}
              >
                {WAVE_HEIGHTS.map((h, i) => {
                  const barStart = i / WAVE_HEIGHTS.length;
                  const barEnd = (i + 1) / WAVE_HEIGHTS.length;
                  const frac = playedRatio <= barStart ? 0 : playedRatio >= barEnd ? 1 : (playedRatio - barStart) / (barEnd - barStart);
                  const played = `rgba(61,90,53,${0.32 + 0.20 * frac})`;
                  const unplayed = 'rgba(92,64,51,.13)';
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-full transition-all duration-300 ease-out"
                      style={{
                        height: `${Math.round(h * 1.35)}px`,
                        background: frac >= 1 ? played : frac <= 0 ? unplayed : `linear-gradient(to right, ${played} ${frac * 100}%, ${unplayed} ${frac * 100}%)`,
                        transformOrigin: 'center',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scaleY(1.22)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
                    />
                  );
                })}
                {duration > 0 && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${playedRatio * 100}%`, width: '1.5px', height: '24px', borderRadius: '1px', background: 'rgba(61,90,53,.55)', boxShadow: '0 0 4px rgba(61,90,53,.25)', transition: 'left .1s linear' }}
                  />
                )}
              </div>

              <span className="text-[9.5px] tabular-nums whitespace-nowrap shrink-0 font-medium" style={{ color: 'rgba(92,64,51,.42)' }}>
                {fmtTime(currentTime)} <span style={{ color: 'rgba(92,64,51,.26)' }}>/</span> {duration > 0 ? fmtTime(duration) : '···'}
              </span>

              <div className="flex items-center gap-[2px] shrink-0">
                {[1, 1.25, 1.5, 2].map(r => {
                  const active = playbackRate === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setSpeed(r)}
                      className="text-[8.5px] px-[5.5px] py-[2px] rounded-full font-semibold transition-all duration-150"
                      style={active
                        ? { background: 'rgba(61,90,53,.12)', color: '#3D5A35', border: '1px solid rgba(61,90,53,.26)' }
                        : { color: 'rgba(92,64,51,.34)', border: '1px solid transparent' }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'rgba(92,64,51,.6)'; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'rgba(92,64,51,.34)'; }}
                    >
                      {r}x
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />}
      </div>

      {/* ── FEEDBACK OVERLAY (portal, centered above modal) ── */}
      {feedbackOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ padding: '72px 10px 10px' }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 animate-lightbox-bg-in"
            style={{ background: 'rgba(59,47,47,.30)', backdropFilter: 'blur(3px)' }}
            onClick={() => setFeedbackOpen(false)}
          />
          {/* Panel */}
          <div
            className="relative z-10 flex flex-col animate-lightbox-in"
            style={{
              maxWidth: '560px',
              width: '90vw',
              maxHeight: '72vh',
              borderRadius: '16px',
              overflow: 'hidden',
              background: 'linear-gradient(165deg, #eef3e8, #e6eede)',
              border: '1px solid rgba(61,90,53,.22)',
              boxShadow: '0 24px 60px rgba(59,47,47,.20)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-[22px] pt-[18px] pb-[10px] flex-shrink-0">
              <SectionLabel>Interviewer Feedback</SectionLabel>
              <button
                onClick={() => setFeedbackOpen(false)}
                className="w-[20px] h-[20px] rounded-full flex items-center justify-center transition-colors duration-150"
                style={{ background: 'rgba(217,208,196,.5)', color: '#5C4033' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3B2F2F'; (e.currentTarget as HTMLElement).style.color = '#F0EBE3'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(217,208,196,.5)'; (e.currentTarget as HTMLElement).style.color = '#5C4033'; }}
              >
                <X className="w-[10px] h-[10px]" />
              </button>
            </div>
            {/* Scrollable body */}
            <div
              className="overflow-y-auto px-[22px] pb-[20px] cdo-notes text-[13px] leading-[1.75]"
              style={{ color: 'rgba(92,64,51,.85)' }}
            >
              {renderNotesLines(entry.notes?.trim() ?? '')}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── DELETE CONFIRMATION ── */}
      {confirmDelete && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center"
          style={{ padding: '24px 16px' }}
          onClick={() => { if (!deleting) setConfirmDelete(false); }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 animate-lightbox-bg-in"
            style={{ background: 'rgba(59,47,47,.34)', backdropFilter: 'blur(4px)' }}
          />
          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex flex-col overflow-hidden animate-scale-in"
            style={{
              width: 'min(90vw, 380px)',
              borderRadius: '16px',
              background: '#fff8f0',
              border: '1px solid rgba(180,84,62,.22)',
              boxShadow: '0 24px 60px rgba(59,47,47,.20)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ height: 2, background: 'linear-gradient(90deg, #b4543e 0%, rgba(180,84,62,.12) 100%)' }} />
            <div className="px-[22px] pt-[18px] pb-[18px] flex flex-col gap-[12px]">
              <h3 className="font-serif text-[19px] font-[500] leading-[1.2] tracking-[-0.01em]" style={{ color: '#3B2F2F' }}>
                Delete this session?
              </h3>
              <p className="text-[12.5px] leading-[1.6]" style={{ color: 'rgba(92,64,51,.72)' }}>
                <span className="font-semibold" style={{ color: '#3B2F2F' }}>{entry.name}</span>
                {' '}and its score, feedback, transcript and recording will be permanently
                removed from your history. This can&apos;t be undone.
              </p>
              {deleteError && (
                <p className="text-[11.5px] leading-[1.5]" style={{ color: '#b4543e' }}>{deleteError}</p>
              )}
              <div className="flex justify-end items-center gap-[8px] mt-[2px]">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="px-[14px] py-[8px] rounded-full text-[11px] font-semibold uppercase tracking-[.1em] transition-colors duration-150 disabled:opacity-50"
                  style={{ background: 'rgba(217,208,196,.5)', color: '#5C4033' }}
                  onMouseEnter={e => { if (!deleting) (e.currentTarget as HTMLElement).style.background = 'rgba(217,208,196,.75)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(217,208,196,.5)'; }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleDelete(); }}
                  disabled={deleting}
                  className="inline-flex items-center gap-[6px] px-[14px] py-[8px] rounded-full text-[11px] font-semibold uppercase tracking-[.1em] transition-colors duration-150 disabled:opacity-70"
                  style={{ background: '#b4543e', color: '#F8F1E7', border: '1px solid rgba(180,84,62,.9)' }}
                  onMouseEnter={e => { if (!deleting) (e.currentTarget as HTMLElement).style.background = '#9d4634'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#b4543e'; }}
                >
                  {deleting
                    ? <><Loader2 className="w-[11px] h-[11px] animate-spin" /> Deleting</>
                    : <><Trash2 className="w-[11px] h-[11px]" /> Delete</>}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── PHOTO LIGHTBOX ── */}
      {expandedUrl && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ padding: '4vh 4vw' }}
          onClick={closeLightbox}
        >
          <div
            className={lightboxExiting ? 'animate-lightbox-bg-out' : 'animate-lightbox-bg-in'}
            style={{ position: 'absolute', inset: 0, background: 'rgba(255,248,240,.55)', backdropFilter: 'blur(22px) saturate(115%)', WebkitBackdropFilter: 'blur(22px) saturate(115%)' }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
            aria-label="Close photo"
            className={`absolute top-[18px] right-[20px] z-[2] flex items-center gap-[6px] rounded-full px-[12px] py-[7px] text-[11px] font-semibold transition-all duration-150 ${lightboxExiting ? 'animate-lightbox-bg-out' : 'animate-lightbox-bg-in'}`}
            style={{ color: 'rgba(59,47,47,.74)', background: 'rgba(255,255,255,.55)', border: '1px solid rgba(92,64,51,.14)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', boxShadow: '0 4px 16px rgba(59,47,47,.10)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.8)'; (e.currentTarget as HTMLElement).style.color = '#3B2F2F'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.55)'; (e.currentTarget as HTMLElement).style.color = 'rgba(59,47,47,.74)'; }}
          >
            <X className="w-[13px] h-[13px]" />
            Close
          </button>
          <span
            className="absolute bottom-[20px] left-1/2 -translate-x-1/2 z-[2] rounded-full px-[12px] py-[5px] text-[10.5px] font-medium select-none pointer-events-none transition-all duration-500"
            style={{ color: 'rgba(59,47,47,.62)', background: 'rgba(255,255,255,.5)', border: '1px solid rgba(92,64,51,.10)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', opacity: showZoomHint && !lightboxExiting ? 1 : 0 }}
          >
            {zoomed ? 'Move to pan, click to zoom out' : 'Click to zoom in'}
          </span>
          <div
            className={`relative z-[1] ${lightboxExiting ? 'animate-lightbox-out' : 'animate-lightbox-in'}`}
            style={{ cursor: zoomed ? 'zoom-out' : 'zoom-in', maxWidth: '92vw', maxHeight: '90vh' }}
            onClick={(e) => { e.stopPropagation(); setZoomed(z => !z); }}
            onMouseMove={handleZoomMove}
            onMouseLeave={() => zoomed && setZoomXY({ x: 50, y: 50 })}
          >
            <img
              src={expandedUrl}
              alt="Case notes"
              draggable={false}
              className="block select-none transition-transform duration-200 ease-out rounded-[12px]"
              style={{ maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', transform: zoomed ? `scale(${ZOOM_SCALE})` : 'scale(1)', transformOrigin: `${zoomXY.x}% ${zoomXY.y}%`, boxShadow: '0 24px 70px rgba(59,47,47,.22)', border: '1px solid rgba(255,255,255,.6)', background: '#fff8f0' }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

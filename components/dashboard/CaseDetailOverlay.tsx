'use client';

import React, {
  useState, useEffect, useRef, useMemo, useCallback,
  type ChangeEvent, type DragEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  X, RefreshCw, Upload, Loader2, Play, Pause,
  CalendarDays, Wifi, User,
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

function ParamBar({ label, score, ready }: { label: string; score: number | null; ready: boolean }) {
  return (
    <div className="flex items-center gap-[7px] mb-[6px]">
      <span className="text-[10px] font-medium w-[58px] text-right shrink-0" style={{ color: 'rgba(92,64,51,.46)' }}>
        {label}
      </span>
      <div className="flex-1 h-[3px] rounded-full" style={{ background: 'rgba(217,208,196,.40)' }}>
        <div
          className="h-full rounded-full transition-all duration-[900ms] ease-out"
          style={{
            width: ready && score != null ? `${(score / 5) * 100}%` : '0%',
            background: 'rgba(61,90,53,.42)',
          }}
        />
      </div>
      <span className="text-[10px] font-semibold w-[14px] text-right shrink-0 tabular-nums" style={{ color: 'rgba(59,47,47,.78)' }}>
        {score != null ? score : '--'}
      </span>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  text,
  textStyle,
}: {
  icon: React.ElementType;
  text: string;
  textStyle?: React.CSSProperties;
}) {
  return (
    <div className="flex items-center gap-[7px] mb-[5px]">
      <div className="w-[12px] h-[12px] shrink-0 flex items-center justify-center">
        <Icon className="w-full h-full" style={{ color: 'rgba(92,64,51,.42)' }} />
      </div>
      <span className="text-[10.5px] leading-none" style={textStyle ?? { color: 'rgba(92,64,51,.56)' }}>
        {text}
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
  initialTab = 'session',
}: {
  entry: DashboardCaseEntry;
  onClose: () => void;
  initialTab?: 'session' | 'notes';
}) {
  const [isExiting, setIsExiting]     = useState(false);
  // Map legacy 'session' → 'overview'; 'notes' → 'notes'
  const [activeTab, setActiveTab]     = useState<'overview' | 'transcript' | 'notes'>(
    initialTab === 'notes' ? 'notes' : 'overview'
  );
  const [tabKey, setTabKey]           = useState(0);
  const [paramsReady, setParamsReady] = useState(false);
  const displayScore = useCountUp(entry.isUnrated ? null : (entry.score ?? null));

  // Feedback overlay
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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

  // Re-measure feedback overflow when the notes text or the active tab changes.
  useEffect(() => {
    const el = feedbackBoxRef.current;
    if (!el) { setFeedbackOverflows(false); return; }
    const t = setTimeout(() => {
      setFeedbackOverflows(el.scrollHeight - el.clientHeight > 6);
    }, 120);
    return () => clearTimeout(t);
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
  // instead. Once merge completes, mergedAudioUrl is used; failed/Same Device
  // sessions fall back to the single track as before.
  const audioMergePending = entry.audioMergePending;
  const audioUrl         = audioMergePending ? null : (entry.mergedAudioUrl ?? entry.audioUrl ?? null);
  const hasAudio         = !audioMergePending && entry.hasAudio && !!audioUrl;
  const transcriptStatus = entry.transcriptStatus ?? null;
  const transcriptReason = entry.transcriptReason ?? null;
  const scoreVal         = entry.isUnrated ? null : (entry.score ?? null);
  const sessionMode      = entry.sessionMode;
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

  // ESC closes modal (only when lightbox and feedback overlay are both closed)
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !expandedUrl && !feedbackOpen) handleClose();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [handleClose, expandedUrl, feedbackOpen]);

  // Audio effects
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let seekingForDuration = false;
    const tryResolveDuration = () => {
      const d = audio.duration;
      if (isFinite(d) && d > 0) { setDuration(d); return; }
      if (!seekingForDuration) { seekingForDuration = true; audio.currentTime = 1e101; }
    };
    const onDurationChange = () => {
      const d = audio.duration;
      if (!isFinite(d) || d <= 0) return;
      setDuration(d);
      if (seekingForDuration) { seekingForDuration = false; audio.currentTime = 0; }
    };
    const onTime = () => {
      if (seekingForDuration) return;
      setCurrentTime(audio.currentTime);
      const d = audio.duration;
      if (isFinite(d) && d > 0) setDuration(prev => prev || d);
    };
    const onEnd = () => {
      setIsPlaying(false);
      if (audio.currentTime > 0) setDuration(prev => prev || audio.currentTime);
    };
    audio.addEventListener('loadedmetadata', tryResolveDuration);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    if (audio.readyState >= 1) tryResolveDuration();
    return () => {
      audio.removeEventListener('loadedmetadata', tryResolveDuration);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

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
    if (isSafari && !hasPlayedOnce) {
      // Safari blocks play() on unloaded cross-origin audio — load first,
      // then play once the browser signals it has enough data.
      setHasPlayedOnce(true);
      a.load();
      const onReady = () => {
        a.removeEventListener('canplay', onReady);
        void a.play().then(() => setIsPlaying(true)).catch(() => {});
      };
      a.addEventListener('canplay', onReady);
      return;
    }
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
  // Shared JSX blocks for Overview tab
  // ─────────────────────────────────────────────────────────────

  const sessionDetailsBlock = (
    <div>
      <SectionLabel>Session Details</SectionLabel>
      <div>
        <div className="flex items-center gap-[8px] py-[7px]" style={{ borderBottom: '1px solid rgba(92,64,51,.09)' }}>
          <CalendarDays className="w-[12px] h-[12px] shrink-0" style={{ color: 'rgba(92,64,51,.42)' }} />
          <span className="text-[12.5px] font-semibold text-[#3B2F2F]">{fmtDate(entry.date)}</span>
        </div>
        <div className="flex items-center gap-[8px] py-[7px]" style={{ borderBottom: '1px solid rgba(92,64,51,.09)' }}>
          {sessionMode === 'Remote'
            ? <Wifi className="w-[12px] h-[12px] shrink-0" style={{ color: 'rgba(92,64,51,.42)' }} />
            : <User className="w-[12px] h-[12px] shrink-0" style={{ color: 'rgba(92,64,51,.42)' }} />
          }
          <span className="text-[12.5px]" style={{ color: 'rgba(92,64,51,.62)' }}>{sessionMode}</span>
        </div>
        <div className="flex items-center gap-[8px] py-[7px]">
          <User className="w-[12px] h-[12px] shrink-0" style={{ color: 'rgba(92,64,51,.42)' }} />
          <span className="text-[12.5px]" style={{ color: 'rgba(92,64,51,.62)' }}>
            {entry.interviewerName ?? <em>Interviewer name not available</em>}
          </span>
        </div>
      </div>
    </div>
  );

  const paramRows = [
    { label: 'Structure',  val: entry.structure },
    { label: 'Delivery',   val: entry.delivery },
    { label: 'Analysis',   val: entry.analysis },
    { label: 'Creativity', val: entry.creativity },
  ];

  const color = scoreVal ? scoreColor(scoreVal) : '#3D5A35';

  const scoreBlockFull = (
    <div>
      <SectionLabel>Score</SectionLabel>
      <div className="flex flex-col items-center">
        <div
          className="w-[126px] h-[126px] rounded-full inline-flex flex-col items-center justify-center"
          style={{ border: `2px solid ${color}`, boxShadow: `0 0 18px ${color}12` }}
        >
          <span className="font-serif text-[44px] font-[500] leading-none tabular-nums" style={{ color }}>
            {entry.isUnrated ? '--' : displayScore}
          </span>
          <span className="text-[10px] mt-[3px]" style={{ color: 'rgba(92,64,51,.42)' }}>out of 5</span>
        </div>
        <div style={{ borderTop: '1px solid rgba(92,64,51,.09)', marginTop: 16, paddingTop: 14, width: '100%' }}>
          {paramRows.map(({ label, val }) => (
            <div key={label} className="flex items-center gap-[8px] mb-[8px] last:mb-0">
              <span className="text-[10px] font-medium w-[58px] shrink-0 text-right" style={{ color: 'rgba(92,64,51,.46)' }}>{label}</span>
              <div className="flex-1 h-[4px] rounded-full" style={{ background: 'rgba(217,208,196,.40)' }}>
                {val != null ? (
                  <div className="h-full rounded-full transition-all duration-[900ms] ease-out"
                    style={{ width: paramsReady ? `${(val / 5) * 100}%` : '0%', background: 'rgba(61,90,53,.85)' }} />
                ) : (
                  <div className="h-full rounded-full" style={{ background: 'repeating-linear-gradient(45deg, rgba(92,64,51,.06) 0 4px, transparent 4px 8px)' }} />
                )}
              </div>
              {val != null
                ? <span className="text-[10px] font-semibold w-[14px] text-right shrink-0 tabular-nums" style={{ color: 'rgba(59,47,47,.78)' }}>{val}</span>
                : <span className="text-[10px] italic shrink-0" style={{ color: 'rgba(92,64,51,.42)', fontSize: '10px' }}>--</span>
              }
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const scoreBlockCompact = (
    <div>
      <SectionLabel>Score</SectionLabel>
      <div className="flex flex-col items-center">
        <div
          className="w-[112px] h-[112px] rounded-full inline-flex flex-col items-center justify-center"
          style={{ border: `2px solid ${color}`, boxShadow: `0 0 18px ${color}12` }}
        >
          <span className="font-serif text-[38px] font-[500] leading-none tabular-nums" style={{ color }}>
            {entry.isUnrated ? '--' : displayScore}
          </span>
          <span className="text-[10px] mt-[3px]" style={{ color: 'rgba(92,64,51,.42)' }}>out of 5</span>
        </div>
        <div style={{ borderTop: '1px solid rgba(92,64,51,.09)', marginTop: 16, paddingTop: 14, width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}>
            {paramRows.map(({ label, val }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-[4px]">
                  <span className="text-[10px] font-medium" style={{ color: 'rgba(92,64,51,.46)' }}>{label}</span>
                  {val != null
                    ? <span className="text-[10px] font-semibold tabular-nums" style={{ color: 'rgba(59,47,47,.78)' }}>{val}</span>
                    : <span className="text-[10px] italic" style={{ color: 'rgba(92,64,51,.42)' }}>--</span>
                  }
                </div>
                <div className="h-[4px] rounded-full" style={{ background: 'rgba(217,208,196,.40)', maxWidth: '130px' }}>
                  {val != null ? (
                    <div className="h-full rounded-full transition-all duration-[900ms] ease-out"
                      style={{ width: paramsReady ? `${(val / 5) * 100}%` : '0%', background: 'rgba(61,90,53,.85)' }} />
                  ) : (
                    <div className="h-full rounded-full"
                      style={{ background: 'repeating-linear-gradient(45deg, rgba(92,64,51,.06) 0 4px, transparent 4px 8px)' }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const feedbackBlock = (
    <div>
      <SectionLabel>Interviewer Feedback</SectionLabel>
      {/* The clamped text box is its OWN positioning context, so the bottom
          fade lives inside it and can never overlap the "Read full feedback"
          link below. Fade + link only render when the text actually overflows. */}
      <div
        ref={feedbackBoxRef}
        className="text-[12.5px] leading-[1.7] rounded-r-[7px] px-[14px] py-[12px]"
        style={{
          color: 'rgba(92,64,51,.82)',
          background: 'rgba(61,90,53,.05)',
          borderLeft: '3px solid rgba(61,90,53,.30)',
          maxHeight: '172px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {renderNotesLines(entry.notes?.trim() ?? '')}
        {/* bottom fade — inside the box, only when clipped */}
        {feedbackOverflows && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 40, pointerEvents: 'none',
            borderRadius: '0 0 7px 0',
            background: 'linear-gradient(to bottom, rgba(240,244,236,0), rgba(240,244,236,.96))',
          }} />
        )}
      </div>
      {feedbackOverflows && (
        <button
          className="mt-[8px] text-[11px] font-semibold"
          style={{ color: '#3D5A35' }}
          onClick={() => setFeedbackOpen(true)}
        >
          Read full feedback →
        </button>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ padding: '72px 10px 10px' }}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${isExiting ? 'opacity-0' : 'opacity-100'}`}
        style={{ background: 'rgba(59,47,47,.28)', backdropFilter: 'blur(4px)' }}
      />

      {/* Modal shell — auto height, content-hugging */}
      <div
        className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[#fff8f0] ${isExiting ? 'animate-scale-out' : 'animate-scale-in'}`}
        style={{
          width: 'min(96vw, 1000px)',
          maxHeight: 'calc(100vh - 84px)',
          borderColor: 'rgba(61,90,53,.1)',
          boxShadow: '0 20px 56px rgba(59,47,47,.14)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── RAISED HEADER BAND ── */}
        <div
          className="flex items-start justify-between flex-shrink-0"
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(180deg, #f4ead9, #efe1cd)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.75), 0 4px 10px rgba(92,64,51,.10)',
          }}
        >
          <div className="min-w-0">
            <span className="eyebrow !mb-0 !text-[9.5px]">Case Review</span>
            <h2 className="font-serif text-[28px] font-[500] text-[#3B2F2F] leading-[1.1] tracking-[-0.01em] mt-[2px]">
              {entry.name}
            </h2>
            {/* Chips */}
            <div className="flex flex-wrap gap-[7px] mt-[12px]">
              {/* Type */}
              <span
                className="inline-flex items-center gap-[6px] text-[11px] font-medium px-[11px] py-[5px] rounded-full"
                style={{ background: '#fff8f0', border: '1px solid rgba(92,64,51,.14)', color: '#5C4033' }}
              >
                <span className="inline-block shrink-0" style={{ width: 6, height: 6, borderRadius: '50%', background: '#3D5A35' }} />
                {entry.type}
              </span>
              {/* Difficulty */}
              <span
                className="inline-flex items-center gap-[6px] text-[11px] font-medium px-[11px] py-[5px] rounded-full"
                style={{ background: '#fff8f0', border: '1px solid rgba(92,64,51,.14)', color: '#5C4033' }}
              >
                <span className="inline-block shrink-0" style={{ width: 6, height: 6, borderRadius: '50%', background: '#c98a3d' }} />
                {entry.level}
              </span>
              {/* Company (nullable) */}
              {entry.company && (
                <span
                  className="inline-flex items-center text-[11px] font-medium px-[11px] py-[5px] rounded-full"
                  style={{ background: '#fff8f0', border: '1px solid rgba(92,64,51,.14)', color: '#5C4033' }}
                >
                  {entry.company}
                </span>
              )}
            </div>
          </div>
          {/* Close button */}
          <button
            onClick={handleClose}
            className="ml-[12px] w-[20px] h-[20px] rounded-full flex items-center justify-center transition-colors duration-150 shrink-0 mt-[2px]"
            style={{ background: 'rgba(217,208,196,.5)', color: '#5C4033' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3B2F2F'; (e.currentTarget as HTMLElement).style.color = '#F0EBE3'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(217,208,196,.5)'; (e.currentTarget as HTMLElement).style.color = '#5C4033'; }}
          >
            <X className="w-[10px] h-[10px]" />
          </button>
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
            Flow-based (not flex-1 + absolute) so the modal hugs its content.
            The modal shell is capped at calc(100vh - 84px); this region takes
            whatever height is left after the header/tabs/audio bar and scrolls
            internally only when the content is taller than that. */}
        <div className="relative overflow-hidden min-h-0" style={{ flex: '1 1 auto' }}>
          <div
            key={tabKey}
            ref={scrollRef}
            onScroll={handleContentScroll}
            className="overflow-y-auto animate-tab-in"
            style={{ scrollbarWidth: 'none', maxHeight: '100%', minHeight: 0 }}
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
            `}</style>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <div className="p-[20px_24px] pb-[28px]">

                {/* State A: hasFeedback && hasScore — 2-col, left=details+feedback, right=score */}
                {hasFeedback && hasScore && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px' }}>
                    <div>
                      {sessionDetailsBlock}
                      <div style={{ marginTop: 22 }}>
                        {feedbackBlock}
                      </div>
                    </div>
                    <div>{scoreBlockFull}</div>
                  </div>
                )}

                {/* State B: !hasFeedback && hasScore — 2-col, left=details, right=compact score */}
                {!hasFeedback && hasScore && (
                  <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: '32px', alignItems: 'start' }}>
                    <div>{sessionDetailsBlock}</div>
                    <div>{scoreBlockCompact}</div>
                  </div>
                )}

                {/* State C: hasFeedback && !hasScore — 2-col, left=details, right=feedback stretched */}
                {hasFeedback && !hasScore && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', alignItems: 'stretch' }}>
                    <div>{sessionDetailsBlock}</div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {feedbackBlock}
                    </div>
                  </div>
                )}

                {/* State D: !hasFeedback && !hasScore — centered single card */}
                {!hasFeedback && !hasScore && (
                  <div style={{ maxWidth: '440px', margin: '0 auto' }}>
                    <div style={{
                      background: '#fffdfa',
                      border: '1px solid rgba(92,64,51,.12)',
                      borderRadius: '14px',
                      padding: '16px 18px',
                    }}>
                      {sessionDetailsBlock}
                    </div>
                    <div style={{
                      marginTop: 14,
                      border: '1px dashed rgba(92,64,51,.18)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                    }}>
                      <span className="text-[12px] italic" style={{ color: 'rgba(92,64,51,.5)' }}>
                        No feedback or score recorded yet for this session.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TRANSCRIPT TAB ── */}
            {activeTab === 'transcript' && (
              <div className="p-[18px_20px] pb-[40px]">
                <SectionLabel>Transcript</SectionLabel>

                {entry.hasTranscript && turns.length > 0 && (
                  <div className="flex flex-col gap-[10px]" style={{ maxHeight: 'min(440px, calc(100vh - 260px))', overflowY: 'auto', scrollbarWidth: 'none' }}>
                    {(transcriptStatus === 'partial') && (
                      <div
                        className="text-[12px] leading-[1.65] px-[12px] py-[9px] rounded-[7px] mb-[3px]"
                        style={{ color: 'rgba(92,64,51,.52)', background: 'rgba(217,208,196,.1)', border: '1px solid rgba(217,208,196,.32)' }}
                      >
                        {transcriptReason === 'interviewer_interrupted'
                          ? 'The interviewer disconnected mid-session so their audio cuts off partway through.'
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
                    Generating your transcript right now. It'll show up here automatically once it's done.
                  </div>
                )}

                {transcriptStatus === 'failed' && (
                  <div
                    className="px-[12px] py-[10px] rounded-[7px]"
                    style={{ background: 'rgba(217,208,196,.10)', border: '1px solid rgba(217,208,196,.32)' }}
                  >
                    {retryQueued ? (
                      <p className="text-[12px] leading-[1.65]" style={{ color: 'rgba(92,64,51,.62)' }}>
                        Retry queued. Your transcript will appear here once it's ready.
                      </p>
                    ) : (
                      <>
                        <p className="text-[12px] leading-[1.65]" style={{ color: 'rgba(92,64,51,.62)' }}>
                          Transcript didn't come through. The audio might have been too short or mostly silent.
                        </p>
                        {entry.hasAudio && entry.lobbyId && (
                          <div className="mt-[8px] flex items-center gap-[7px]">
                            <button
                              onClick={() => void handleRetry()}
                              disabled={retrying}
                              className="inline-flex items-center gap-[5px] px-[10px] py-[5px] rounded-full text-[10px] font-semibold tracking-[.02em] transition-all duration-150 disabled:opacity-60 hover:opacity-80"
                              style={{ background: 'rgba(217,208,196,.18)', border: '1px solid rgba(92,64,51,.14)', color: 'rgba(92,64,51,.62)' }}
                            >
                              {retrying
                                ? <><Loader2 className="w-[10px] h-[10px] animate-spin" />Queuing...</>
                                : <><RefreshCw className="w-[10px] h-[10px]" />Try again</>
                              }
                            </button>
                            {retryError && (
                              <span className="text-[10px]" style={{ color: 'rgba(92,64,51,.52)' }}>{retryError}</span>
                            )}
                          </div>
                        )}
                      </>
                    )}
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
                Merged audio is being generated…
              </span>
            </div>
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
                className={`w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 transition-all duration-200${!hasPlayedOnce ? ' animate-play-pulse' : ''}`}
                style={{ background: isPlaying ? 'rgba(61,90,53,.13)' : 'rgba(92,64,51,.08)', color: '#3D5A35', border: `1px solid ${isPlaying ? 'rgba(61,90,53,.28)' : 'rgba(92,64,51,.16)'}` }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(61,90,53,.18)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(61,90,53,.34)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.06)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isPlaying ? 'rgba(61,90,53,.13)' : 'rgba(92,64,51,.08)'; (e.currentTarget as HTMLElement).style.borderColor = isPlaying ? 'rgba(61,90,53,.28)' : 'rgba(92,64,51,.16)'; (e.currentTarget as HTMLElement).style.transform = ''; }}
              >
                {isPlaying ? <Pause className="w-[10px] h-[10px]" /> : <Play className="w-[10px] h-[10px] ml-[1.5px]" />}
              </button>

              <div
                className="group relative flex items-center gap-[2.5px] flex-1 min-w-0 cursor-pointer"
                style={{ height: '22px' }}
                onClick={onWaveClick}
              >
                {WAVE_HEIGHTS.map((h, i) => {
                  const barStart = i / WAVE_HEIGHTS.length;
                  const barEnd = (i + 1) / WAVE_HEIGHTS.length;
                  const frac = playedRatio <= barStart ? 0 : playedRatio >= barEnd ? 1 : (playedRatio - barStart) / (barEnd - barStart);
                  const played = `rgba(61,90,53,${0.30 + 0.18 * frac})`;
                  const unplayed = 'rgba(92,64,51,.10)';
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-full transition-all duration-300 ease-out"
                      style={{
                        height: `${h}px`,
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
                    style={{ left: `${playedRatio * 100}%`, width: '1.5px', height: '20px', borderRadius: '1px', background: 'rgba(61,90,53,.55)', boxShadow: '0 0 4px rgba(61,90,53,.25)', transition: 'left .1s linear' }}
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

        {audioUrl && <audio ref={audioRef} src={audioUrl} preload={isSafari ? 'none' : 'auto'} className="hidden" />}
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

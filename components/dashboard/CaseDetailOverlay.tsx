'use client';

import React, {
  useState, useEffect, useRef, useMemo, useCallback,
  type ChangeEvent, type DragEvent,
} from 'react';
import {
  X, RefreshCw, Upload, ChevronLeft, Loader2, Play, Pause,
  CalendarDays, Wifi, User, Headphones, Images, FileCheck,
  Clock, AlertCircle,
} from 'lucide-react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage, waitForAuthUser } from '@/lib/firebase/config';
import { apiPost } from '@/lib/api/client';
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

type Speaker = 'Candidate' | 'Interviewer' | 'Unknown';
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
    if (cand)      { flush(); speaker = 'Candidate';   if (cand[1]) lines.push(cand[1]); }
    else if (intv) { flush(); speaker = 'Interviewer'; if (intv[1]) lines.push(intv[1]); }
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

// 80 bar heights; flex-1 bars stretch to fill any panel width
const WAVE_HEIGHTS = [
  9,14,7,21,12,24,8,17,22,10,16,20,7,14,19,9,15,5,18,23,
  11,16,21,26,13,8,20,15,7,21,10,17,23,11,18,6,14,20,25,10,
  15,22,8,17,12,24,13,19,8,21,11,18,7,22,14,9,20,16,5,23,
  10,17,13,26,8,19,15,21,6,14,24,12,20,9,16,22,11,18,25,7,
];

// Section label used everywhere for consistent sizing
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[9px] uppercase tracking-[.14em] font-semibold text-[#3D5A35] mb-[8px]">
    {children}
  </p>
);

// ─────────────────────────────────────────────────────────────
// Score count-up hook
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Sidebar param bar
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Sidebar meta row - fixed icon slot keeps all rows aligned
// ─────────────────────────────────────────────────────────────
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
      <span
        className="text-[10.5px] leading-none"
        style={textStyle ?? { color: 'rgba(92,64,51,.56)' }}
      >
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
  const [activeTab, setActiveTab]     = useState<'session' | 'notes'>(initialTab);
  const [tabKey, setTabKey]           = useState(0);
  const [paramsReady, setParamsReady] = useState(false);
  const displayScore = useCountUp(entry.isUnrated ? null : (entry.score ?? null));

  // One-time scroll hint: shows a subtle bobbing chevron until the user
  // scrolls the content area for the first time (only when it overflows).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [hasScrolled, setHasScrolled]       = useState(false);

  // Audio
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Click-to-zoom + pan for the expanded note image
  const [zoomed, setZoomed]       = useState(false);
  const [zoomXY, setZoomXY]       = useState({ x: 50, y: 50 }); // transform-origin %
  const ZOOM_SCALE = 2.2;

  // Reset zoom whenever we open a different image or leave the expanded view
  useEffect(() => { setZoomed(false); setZoomXY({ x: 50, y: 50 }); }, [expandedUrl]);

  const handleZoomMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setZoomXY({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  };

  // Derived
  const audioUrl         = entry.mergedAudioUrl ?? entry.audioUrl ?? null;
  const hasAudio         = entry.hasAudio && !!audioUrl;
  const transcriptStatus = entry.transcriptStatus ?? null;
  const transcriptReason = entry.transcriptReason ?? null;
  const scoreVal         = entry.isUnrated ? null : (entry.score ?? null);
  // mergedAudioUrl is only written for dual-mic remote sessions
  const sessionMode      = entry.mergedAudioUrl ? 'Remote' : 'Same Device';
  const playedCount      = duration > 0
    ? Math.floor((currentTime / duration) * WAVE_HEIGHTS.length)
    : 0;

  // ── Animate params on mount ──
  useEffect(() => {
    const t = setTimeout(() => setParamsReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // ── Show the scroll hint once, only if the content actually overflows ──
  // Re-checks whenever the tab switches (tabKey) so it can re-appear on a
  // longer tab the user hasn't scrolled yet. Once they scroll, it's gone.
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

  // ── Close with exit animation ──
  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(onClose, 210);
  }, [onClose]);

  // ── Escape key ──
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [handleClose]);

  // ── Audio events ──
  // Remote (merged) audio has proper MP4/WAV headers, so duration is
  // available immediately on loadedmetadata. Same-Device recordings are
  // raw WebM from MediaRecorder with no duration header — the browser
  // reports Infinity until it reads the whole file.
  //
  // Seek-to-end trick: setting currentTime = 1e101 after loadedmetadata
  // forces the browser to range-request the tail of the file. The browser
  // clamps to the real end and fires durationchange with the actual length.
  // We then reset currentTime to 0. The seekingForDuration flag suppresses
  // timeupdate callbacks during the trick so the UI doesn't flicker.
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

  // ── Tab switch ──
  const switchTab = (tab: 'session' | 'notes') => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setTabKey(k => k + 1);
  };

  // ── Audio controls ──
  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) { a.pause(); setIsPlaying(false); }
    else           { void a.play(); setIsPlaying(true); }
  };

  // Read duration from the element directly so seeking works immediately,
  // even before the React state has been updated.
  const seekTo = (ratio: number) => {
    const a = audioRef.current;
    if (!a) return;
    const dur = (a.duration && isFinite(a.duration) && a.duration > 0)
      ? a.duration
      : duration;
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

  const onScrubClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  };

  // ── Retry transcript ──
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

  // ── Upload photo ──
  const uploadFile = async (file: File | null | undefined) => {
    if (!file || uploading) return;
    setUploadError('');
    if (!file.type.startsWith('image/')) {
      setUploadError('Pick an image file (PNG, JPG, HEIC).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image must be under 10 MB.');
      return;
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
        storagePath: path,
        workspaceImageUrl: url,
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

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    // padding-top 72px keeps modal below the platform navbar
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

      {/* Modal shell — vh-relative height so it scales with the viewport */}
      <div
        className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[#fff8f0] shadow-2xl ${isExiting ? 'animate-scale-out' : 'animate-scale-in'}`}
        style={{
          width: 'min(97vw, 1080px)',
          height: 'min(74vh, 680px)',
          borderColor: 'rgba(61,90,53,.1)',
          boxShadow: '0 20px 56px rgba(59,47,47,.14)',
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── HEADER ── */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-[12px] flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(92,64,51,.07)' }}
        >
          <div className="flex items-center gap-[8px] min-w-0">
            <span className="eyebrow !mb-0 !text-[9px] shrink-0">case details</span>
            <span style={{ color: 'rgba(92,64,51,.18)', fontSize: 11 }}>·</span>
            <span className="font-serif text-[16px] font-[500] text-[#3B2F2F] tracking-[-0.01em] truncate">
              {entry.name}
            </span>
          </div>
          <div className="flex items-center gap-[5px] shrink-0">
            <span
              className="text-[9px] font-semibold tracking-[.05em] px-[8px] py-[3px] rounded-[5px]"
              style={{ background: 'rgba(217,208,196,.22)', border: '1px solid rgba(92,64,51,.1)', color: 'rgba(92,64,51,.58)' }}
            >
              {entry.type}
            </span>
            <span
              className="text-[9px] font-semibold tracking-[.05em] px-[8px] py-[3px] rounded-[5px]"
              style={{ background: 'rgba(217,208,196,.22)', border: '1px solid rgba(92,64,51,.1)', color: 'rgba(92,64,51,.58)' }}
            >
              {entry.level}
            </span>
            <button
              onClick={handleClose}
              className="ml-1 w-[20px] h-[20px] rounded-full flex items-center justify-center transition-colors duration-150"
              style={{ background: 'rgba(217,208,196,.5)', color: '#5C4033' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3B2F2F'; (e.currentTarget as HTMLElement).style.color = '#F0EBE3'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(217,208,196,.5)'; (e.currentTarget as HTMLElement).style.color = '#5C4033'; }}
            >
              <X className="w-[10px] h-[10px]" />
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── LEFT SIDEBAR ── */}
          <div
            className="w-[210px] shrink-0 flex flex-col gap-[11px] overflow-y-auto"
            style={{
              padding: '14px 15px',
              borderRight: '1px solid rgba(92,64,51,.06)',
              scrollbarWidth: 'none',
            }}
          >
            {/* Score ring */}
            <div
              className="text-center"
              style={{ paddingBottom: '11px', borderBottom: '1px solid rgba(92,64,51,.06)' }}
            >
              <div
                className="w-[64px] h-[64px] rounded-full inline-flex flex-col items-center justify-center"
                style={{
                  border: `1.5px solid ${scoreVal ? scoreColor(scoreVal) + '40' : 'rgba(61,90,53,.16)'}`,
                  boxShadow: scoreVal ? `0 0 14px ${scoreColor(scoreVal)}12` : 'none',
                }}
              >
                <span className="font-serif text-[27px] font-[500] text-[#3B2F2F] leading-none tabular-nums">
                  {entry.isUnrated ? '--' : displayScore}
                </span>
                {!entry.isUnrated && (
                  <span className="text-[8px] font-medium mt-[2px]" style={{ color: 'rgba(92,64,51,.40)' }}>
                    Out of 5
                  </span>
                )}
              </div>
              <p className="text-[8.5px] font-medium uppercase tracking-[.10em] mt-[6px]" style={{ color: 'rgba(92,64,51,.40)' }}>Overall Score</p>
            </div>

            {/* Parameter bars */}
            {!entry.isUnrated && (
              <div style={{ paddingBottom: '11px', borderBottom: '1px solid rgba(92,64,51,.06)' }}>
                <SectionLabel>Parameters</SectionLabel>
                <ParamBar label="Structure"  score={entry.structure}  ready={paramsReady} />
                <ParamBar label="Delivery"   score={entry.delivery}   ready={paramsReady} />
                <ParamBar label="Analysis"   score={entry.analysis}   ready={paramsReady} />
                <ParamBar label="Creativity" score={entry.creativity} ready={paramsReady} />
              </div>
            )}

            {/* Session meta */}
            <div style={{
              paddingBottom: localUrls.length > 0 ? '11px' : 0,
              borderBottom: localUrls.length > 0 ? '1px solid rgba(92,64,51,.06)' : 'none',
            }}>
              <SectionLabel>Session</SectionLabel>
              <MetaRow icon={CalendarDays} text={fmtDate(entry.date)} />
              <MetaRow icon={sessionMode === 'Remote' ? Wifi : User} text={sessionMode} />

              {(transcriptStatus === 'completed' || transcriptStatus === 'partial') && (
                <MetaRow icon={FileCheck} text="Transcript ready"
                  textStyle={{ color: 'rgba(61,90,53,.66)', fontWeight: 500, fontSize: '10.5px' }} />
              )}
              {(transcriptStatus === 'processing' || transcriptStatus === 'pending') && (
                <MetaRow icon={Clock} text="Generating..."
                  textStyle={{ color: 'rgba(92,64,51,.48)', fontSize: '10.5px' }} />
              )}
              {transcriptStatus === 'failed' && (
                <MetaRow icon={AlertCircle} text="No transcript"
                  textStyle={{ color: 'rgba(92,64,51,.44)', fontSize: '10.5px' }} />
              )}
              {hasAudio && <MetaRow icon={Headphones} text="Recording available" />}
            </div>

            {/* Notes count */}
            {localUrls.length > 0 && (
              <div>
                <SectionLabel>Notes</SectionLabel>
                <MetaRow
                  icon={Images}
                  text={`${localUrls.length} photo${localUrls.length !== 1 ? 's' : ''} uploaded`}
                />
              </div>
            )}
          </div>

          {/* ── RIGHT PANE ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">

            {/* Tab bar */}
            <div
              className="flex flex-shrink-0 px-[16px] bg-[#fff8f0]"
              style={{ borderBottom: '1px solid rgba(92,64,51,.07)' }}
            >
              {(['session', 'notes'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => switchTab(tab)}
                  className={`text-[12px] py-[10px] px-[12px] border-b-2 transition-all duration-150 tracking-[.01em] ${
                    activeTab === tab
                      ? 'text-[#3B2F2F] font-semibold'
                      : 'border-transparent font-medium'
                  }`}
                  style={
                    activeTab === tab
                      ? { borderColor: '#3D5A35' }
                      : { color: 'rgba(92,64,51,.42)' }
                  }
                >
                  {tab === 'session' ? 'Session' : 'Notes'}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 relative overflow-hidden min-h-0">
              <div
                key={tabKey}
                ref={scrollRef}
                onScroll={handleContentScroll}
                className="absolute inset-0 overflow-y-auto animate-tab-in"
                style={{ scrollbarWidth: 'none' }}
              >
                <style>{`div::-webkit-scrollbar{display:none}`}</style>

                {/* ── SESSION TAB ── */}
                {activeTab === 'session' && (
                  <div className="p-[18px_20px] flex flex-col gap-[20px] pb-[26px]">

                    {/* Interviewer feedback */}
                    <div>
                      <SectionLabel>Interviewer Feedback</SectionLabel>
                      {entry.notes?.trim() ? (
                        <p
                          className="text-[12.5px] leading-[1.75] rounded-r-[7px] px-[14px] py-[12px] whitespace-pre-line"
                          style={{
                            color: 'rgba(92,64,51,.82)',
                            background: 'rgba(61,90,53,.05)',
                            borderLeft: '3px solid rgba(61,90,53,.30)',
                          }}
                        >
                          {entry.notes.trim()}
                        </p>
                      ) : (
                        <p className="text-[12px] leading-[1.65] italic" style={{ color: 'rgba(92,64,51,.44)' }}>
                          Your interviewer didn&apos;t jot down any written feedback for this one.
                        </p>
                      )}
                    </div>

                    {/* Transcript */}
                    <div>
                      <SectionLabel>Transcript</SectionLabel>

                      {entry.hasTranscript && turns.length > 0 && (
                        <div className="flex flex-col gap-[10px]">
                          {(transcriptStatus === 'partial') && (
                            <div
                              className="text-[12px] leading-[1.65] px-[12px] py-[9px] rounded-[7px] mb-[3px]"
                              style={{
                                color: 'rgba(92,64,51,.52)',
                                background: 'rgba(217,208,196,.1)',
                                border: '1px solid rgba(217,208,196,.32)',
                              }}
                            >
                              {transcriptReason === 'interviewer_interrupted'
                                ? 'The interviewer disconnected mid-session so their audio cuts off partway through.'
                                : 'Only your audio was captured this time, so the transcript only covers your side.'}
                            </div>
                          )}
                          {turns.map((turn, i) => {
                            const isCandidate = turn.speaker === 'Candidate';
                            return (
                              <div
                                key={i}
                                className={`flex gap-[8px] items-start animate-turn-in ${isCandidate ? 'flex-row-reverse' : ''}`}
                                style={{ animationDelay: `${Math.min(i * 28, 260)}ms` }}
                              >
                                <div
                                  className="w-[24px] h-[24px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-[1px]"
                                  style={
                                    isCandidate
                                      ? { background: 'rgba(92,64,51,.14)', color: '#5C4033', border: '1px solid rgba(92,64,51,.22)' }
                                      : { background: 'rgba(61,90,53,.14)', color: '#3D5A35', border: '1px solid rgba(61,90,53,.22)' }
                                  }
                                >
                                  {isCandidate ? 'C' : 'I'}
                                </div>
                                <div
                                  className="max-w-[78%] px-[12px] py-[9px] text-[12.5px] leading-[1.65] text-[#3B2F2F]"
                                  style={
                                    isCandidate
                                      ? { background: 'rgba(217,208,196,.18)', border: '1px solid rgba(217,208,196,.40)', borderRadius: '11px 11px 3px 11px' }
                                      : { background: 'rgba(61,90,53,.06)', border: '1px solid rgba(61,90,53,.10)', borderRadius: '11px 11px 11px 3px' }
                                  }
                                >
                                  {turn.text}
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
                        <p className="text-[12px] leading-[1.6]" style={{ color: 'rgba(92,64,51,.48)' }}>
                          No transcript recorded for this session.
                        </p>
                      )}
                      {entry.hasAudio && !entry.hasTranscript && transcriptStatus === null && (
                        <p className="text-[12px] leading-[1.6]" style={{ color: 'rgba(92,64,51,.48)' }}>
                          Transcript wasn't generated for this recording.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── NOTES TAB ── */}
                {activeTab === 'notes' && (
                  <div className="p-[18px_20px]">
                    <p className="text-[12px] mb-[14px]" style={{ color: 'rgba(92,64,51,.48)' }}>
                      Photos of your handwritten notes and frameworks from this case.
                    </p>

                    {expandedUrl ? (
                      <div className="flex flex-col gap-[10px]">
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => setExpandedUrl(null)}
                            className="flex items-center gap-[5px] text-[10.5px] font-medium transition-colors duration-150 self-start"
                            style={{ color: 'rgba(92,64,51,.46)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#3B2F2F'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(92,64,51,.46)'}
                          >
                            <ChevronLeft className="w-[12px] h-[12px]" />
                            Back to all photos
                          </button>
                          <span className="text-[10px] font-medium" style={{ color: 'rgba(92,64,51,.40)' }}>
                            {zoomed ? 'Move to look around, click to zoom out' : 'Click the image to zoom in'}
                          </span>
                        </div>
                        <div
                          className="rounded-[9px] overflow-hidden"
                          style={{ border: '1px solid rgba(217,208,196,.45)', cursor: zoomed ? 'zoom-out' : 'zoom-in' }}
                          onClick={() => setZoomed(z => !z)}
                          onMouseMove={handleZoomMove}
                          onMouseLeave={() => zoomed && setZoomXY({ x: 50, y: 50 })}
                        >
                          <img
                            src={expandedUrl}
                            alt="Case notes"
                            draggable={false}
                            className="w-full object-contain select-none transition-transform duration-200 ease-out"
                            style={{
                              maxHeight: '460px',
                              transform: zoomed ? `scale(${ZOOM_SCALE})` : 'scale(1)',
                              transformOrigin: `${zoomXY.x}% ${zoomXY.y}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        {localUrls.length > 0 && (
                          <div className="flex flex-wrap gap-[7px] mb-[10px]">
                            {localUrls.map((url, i) => (
                              <div
                                key={i}
                                onClick={() => setExpandedUrl(url)}
                                className="w-[78px] h-[78px] rounded-[7px] overflow-hidden cursor-pointer transition-all duration-150"
                                style={{ background: 'rgba(217,208,196,.18)', border: '1px solid rgba(217,208,196,.40)' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(59,47,47,.09)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                              >
                                <img src={url} alt={`Note ${i + 1}`} className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        )}

                        <div
                          onDragEnter={() => setDragging(true)}
                          onDragOver={e => e.preventDefault()}
                          onDragLeave={() => setDragging(false)}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className="flex flex-col items-center justify-center gap-[6px] rounded-[9px] py-[22px] cursor-pointer transition-all duration-200"
                          style={{
                            border: `1.5px dashed ${dragging ? '#3D5A35' : 'rgba(61,90,53,.20)'}`,
                            background: dragging ? 'rgba(61,90,53,.04)' : 'transparent',
                          }}
                          onMouseEnter={e => { if (!dragging) { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(61,90,53,.34)'; (e.currentTarget as HTMLElement).style.background = 'rgba(61,90,53,.025)'; } }}
                          onMouseLeave={e => { if (!dragging) { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(61,90,53,.20)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
                        >
                          {uploading
                            ? <Loader2 className="w-[17px] h-[17px] animate-spin" style={{ color: 'rgba(92,64,51,.38)' }} />
                            : <Upload className="w-[15px] h-[15px]" style={{ color: 'rgba(92,64,51,.25)' }} />
                          }
                          <p className="text-[10.5px] font-medium" style={{ color: 'rgba(59,47,47,.62)' }}>
                            {uploading ? 'Uploading...' : localUrls.length > 0 ? 'Add another photo' : 'Drop your photo here'}
                          </p>
                          <p className="text-[9.5px]" style={{ color: 'rgba(92,64,51,.32)' }}>
                            {uploading ? 'Hang on a moment' : 'or click to browse. PNG, JPG, HEIC up to 10 MB.'}
                          </p>
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
                        {uploadError && (
                          <p className="text-[10.5px] mt-[8px]" style={{ color: 'rgba(92,64,51,.62)' }}>{uploadError}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Fade at bottom of scroll area. When there's more to read
                  and the user hasn't scrolled yet, the fade grows taller and
                  gently breathes once or twice as a symbol-free "more below"
                  cue, then settles back to the slim resting fade. */}
              <div
                className={`absolute bottom-0 left-0 right-0 pointer-events-none transition-all duration-500 ${showScrollHint ? 'animate-scroll-hint' : ''}`}
                style={{
                  height: showScrollHint ? '40px' : '20px',
                  background: 'linear-gradient(to bottom, rgba(255,248,240,0), #fff8f0)',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── AUDIO PLAYER ── */}
        {hasAudio && (
          <div
            className="flex-shrink-0 px-[14px] pt-[8px] pb-[9px] bg-[#fff8f0]"
            style={{ borderTop: '1px solid rgba(92,64,51,.06)' }}
          >
            {/* Play + waveform + time */}
            <div className="flex items-center gap-[8px]">
              <button
                onClick={togglePlay}
                className="w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 transition-all duration-150"
                style={{ background: '#3B2F2F', color: '#F0EBE3' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#5C4033'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.07)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#3B2F2F'; (e.currentTarget as HTMLElement).style.transform = ''; }}
              >
                {isPlaying ? <Pause className="w-[9px] h-[9px]" /> : <Play className="w-[9px] h-[9px] ml-[1px]" />}
              </button>

              {/* Waveform: flex-1 bars fill full width */}
              <div
                className="flex items-end gap-[2px] flex-1 min-w-0 cursor-pointer"
                style={{ height: '26px' }}
                onClick={onWaveClick}
              >
                {WAVE_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[1px] transition-all duration-150"
                    style={{
                      height: `${h}px`,
                      background: i < playedCount ? 'rgba(92,64,51,.30)' : i === playedCount ? 'rgba(92,64,51,.50)' : 'rgba(92,64,51,.08)',
                      transformOrigin: 'bottom',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scaleY(1.14)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
                  />
                ))}
              </div>

              {/* Duration display: shows ?? while loading so user knows it exists */}
              <span className="text-[9px] tabular-nums whitespace-nowrap shrink-0" style={{ color: 'rgba(92,64,51,.34)' }}>
                {fmtTime(currentTime)} / {duration > 0 ? fmtTime(duration) : '...'}
              </span>
            </div>

            {/* Scrubber: 34px left = play 26px + gap 8px */}
            <div
              className="relative rounded-[1px] cursor-pointer"
              style={{ height: '1.5px', margin: '4px 0 0 34px', background: 'rgba(217,208,196,.38)' }}
              onClick={onScrubClick}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-[1px]"
                style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%', background: 'rgba(92,64,51,.28)' }}
              />
              <div
                className="absolute w-[6px] h-[6px] rounded-full bg-[#3B2F2F]"
                style={{
                  top: '-2.5px',
                  left: duration > 0 ? `calc(${(currentTime / duration) * 100}% - 3px)` : '-3px',
                  transition: 'left .1s linear',
                }}
              />
            </div>

            {/* Speed pills */}
            <div className="flex items-center gap-[2px] mt-[5px] ml-[34px]">
              {[0.75, 1, 1.25, 1.5, 2].map(r => (
                <button
                  key={r}
                  onClick={() => setSpeed(r)}
                  className="text-[8.5px] px-[6px] py-[1.5px] rounded-[7px] font-medium transition-all duration-100"
                  style={
                    playbackRate === r
                      ? { background: '#3B2F2F', color: '#F0EBE3', border: '1px solid #3B2F2F' }
                      : { color: 'rgba(92,64,51,.33)', border: '1px solid rgba(92,64,51,.10)' }
                  }
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Audio element — preload="auto" ensures the full file is downloaded
            so Chrome can resolve WebM duration (which has no header metadata) */}
        {audioUrl && (
          <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />
        )}
      </div>
    </div>
  );
}

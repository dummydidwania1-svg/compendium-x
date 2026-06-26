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

// 80 heights - bars use flex-1 so they fill the panel at any width
const WAVE_HEIGHTS = [
  9,14,7,21,12,24,8,17,22,10,16,20,7,14,19,9,15,5,18,23,
  11,16,21,26,13,8,20,15,7,21,10,17,23,11,18,6,14,20,25,10,
  15,22,8,17,12,24,13,19,8,21,11,18,7,22,14,9,20,16,5,23,
  10,17,13,26,8,19,15,21,6,14,24,12,20,9,16,22,11,18,25,7,
];

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
    <div className="flex items-center gap-[6px] mb-[5px]">
      <span className="text-[10px] font-medium text-[#5C4033]/45 w-[58px] text-right shrink-0">
        {label}
      </span>
      <div className="flex-1 h-[2.5px] rounded-full bg-[#D9D0C4]/35">
        <div
          className="h-full rounded-full transition-all duration-[900ms] ease-out"
          style={{
            width: ready && score != null ? `${(score / 5) * 100}%` : '0%',
            background: 'rgba(61,90,53,.42)',
          }}
        />
      </div>
      <span className="text-[10px] font-semibold text-[#3B2F2F] w-[16px] text-right shrink-0 tabular-nums">
        {score != null ? score : '--'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sidebar meta row - consistent icon-slot + text
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
        className="text-[11px] leading-none"
        style={textStyle ?? { color: 'rgba(92,64,51,.52)' }}
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
}: {
  entry: DashboardCaseEntry;
  onClose: () => void;
}) {
  const [isExiting, setIsExiting]     = useState(false);
  const [activeTab, setActiveTab]     = useState<'session' | 'notes'>('session');
  const [tabKey, setTabKey]           = useState(0);
  const [paramsReady, setParamsReady] = useState(false);
  const displayScore = useCountUp(entry.isUnrated ? null : (entry.score ?? null));

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

  // Derived
  const audioUrl         = entry.mergedAudioUrl ?? entry.audioUrl ?? null;
  const hasAudio         = entry.hasAudio && !!audioUrl;
  const transcriptStatus = entry.transcriptStatus ?? null;
  const transcriptReason = entry.transcriptReason ?? null;
  const scoreVal         = entry.isUnrated ? null : (entry.score ?? null);
  // mergedAudioUrl is only set for dual-mic remote sessions
  const sessionMode      = entry.mergedAudioUrl ? 'Remote' : 'Solo';
  const playedCount      = duration > 0
    ? Math.floor((currentTime / duration) * WAVE_HEIGHTS.length)
    : 0;

  // ── Animate params on mount ──
  useEffect(() => {
    const t = setTimeout(() => setParamsReady(true), 80);
    return () => clearTimeout(t);
  }, []);

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
  // Listen for loadedmetadata AND durationchange so duration is always captured,
  // even when the browser defers network requests until first play.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncDuration = () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      // Grab duration opportunistically on each timeupdate as a fallback
      if (audio.duration && isFinite(audio.duration)) setDuration(d => d || audio.duration);
    };
    const onEnd = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);

    // If metadata already loaded before we mounted (cached audio), grab it now
    if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);

    return () => {
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
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

  // Read duration directly from the element so seeking works even before
  // the React state has been updated by loadedmetadata.
  const seekTo = (ratio: number) => {
    const a = audioRef.current;
    if (!a) return;
    const dur = a.duration && isFinite(a.duration) ? a.duration : duration;
    if (!dur) return;
    const t = Math.max(0, Math.min(ratio, 1)) * dur;
    a.currentTime = t;
    setCurrentTime(t);
    if (!duration && isFinite(a.duration)) setDuration(a.duration);
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
    // Outer container: fixed over full screen, but top padding keeps content
    // below the platform navbar (~68px) so the modal header is never hidden.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ padding: '74px 10px 10px' }}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${isExiting ? 'opacity-0' : 'opacity-100'}`}
        style={{ background: 'rgba(59,47,47,.28)', backdropFilter: 'blur(4px)' }}
      />

      {/* Modal shell */}
      <div
        className={`relative flex flex-col overflow-hidden rounded-2xl border bg-[#fff8f0] shadow-2xl ${isExiting ? 'animate-scale-out' : 'animate-scale-in'}`}
        style={{
          width: 'min(97vw, 1100px)',
          // Fill available height (viewport minus top padding 74px + bottom 10px)
          height: 'min(calc(100vh - 92px), 840px)',
          borderColor: 'rgba(61,90,53,.1)',
          boxShadow: '0 24px 64px rgba(59,47,47,.16)',
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── HEADER ── */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-[11px] flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(92,64,51,.07)' }}
        >
          <div className="flex items-center gap-[9px] min-w-0">
            <span className="eyebrow !mb-0 !text-[9px] shrink-0">case details</span>
            <span className="text-[10px]" style={{ color: 'rgba(92,64,51,.2)' }}>·</span>
            <span className="font-serif text-[15px] font-[500] text-[#3B2F2F] tracking-[-0.01em] truncate">
              {entry.name}
            </span>
          </div>
          <div className="flex items-center gap-[6px] shrink-0">
            <span
              className="text-[8.5px] font-semibold tracking-[.06em] px-[8px] py-[3px] rounded-[5px]"
              style={{ background: 'rgba(217,208,196,.22)', border: '1px solid rgba(92,64,51,.1)', color: 'rgba(92,64,51,.55)' }}
            >
              {entry.type}
            </span>
            <span
              className="text-[8.5px] font-semibold tracking-[.06em] px-[8px] py-[3px] rounded-[5px]"
              style={{ background: 'rgba(217,208,196,.22)', border: '1px solid rgba(92,64,51,.1)', color: 'rgba(92,64,51,.55)' }}
            >
              {entry.level}
            </span>
            <span className="text-[9.5px] font-medium tabular-nums ml-1" style={{ color: 'rgba(92,64,51,.3)' }}>
              {entry.isUnrated ? 'Unrated' : `${entry.score} / 5`}
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
            className="w-[200px] shrink-0 flex flex-col gap-[11px] overflow-y-auto"
            style={{
              padding: '14px 13px',
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
                className="w-[72px] h-[72px] rounded-full inline-flex flex-col items-center justify-center"
                style={{
                  border: `1.5px solid ${scoreVal ? scoreColor(scoreVal) + '30' : 'rgba(61,90,53,.18)'}`,
                  boxShadow: scoreVal ? `0 0 16px ${scoreColor(scoreVal)}10` : 'none',
                  transition: 'box-shadow .6s ease',
                }}
              >
                <span className="font-serif text-[32px] font-[500] text-[#3B2F2F] leading-none tabular-nums">
                  {entry.isUnrated ? '--' : displayScore}
                </span>
                {!entry.isUnrated && (
                  <span className="text-[9px] font-medium mt-[2px]" style={{ color: 'rgba(92,64,51,.3)' }}>
                    out of 5
                  </span>
                )}
              </div>
              <p className="text-[8.5px] mt-[5px]" style={{ color: 'rgba(92,64,51,.28)' }}>overall score</p>
            </div>

            {/* Parameter bars */}
            {!entry.isUnrated && (
              <div style={{ paddingBottom: '11px', borderBottom: '1px solid rgba(92,64,51,.06)' }}>
                <p className="text-[8.5px] uppercase tracking-[.13em] font-semibold text-[#3D5A35] mb-[7px]">
                  Parameters
                </p>
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
              <p className="text-[8.5px] uppercase tracking-[.13em] font-semibold text-[#3D5A35] mb-[7px]">
                Session
              </p>

              <MetaRow icon={CalendarDays} text={fmtDate(entry.date)} />
              <MetaRow
                icon={sessionMode === 'Remote' ? Wifi : User}
                text={sessionMode}
              />

              {(transcriptStatus === 'completed' || transcriptStatus === 'partial') && (
                <MetaRow
                  icon={FileCheck}
                  text="Transcript ready"
                  textStyle={{ color: 'rgba(61,90,53,.65)', fontWeight: 500, fontSize: '11px' }}
                />
              )}
              {(transcriptStatus === 'processing' || transcriptStatus === 'pending') && (
                <MetaRow
                  icon={Clock}
                  text="Generating..."
                  textStyle={{ color: 'rgba(92,64,51,.42)', fontSize: '11px' }}
                />
              )}
              {transcriptStatus === 'failed' && (
                <MetaRow
                  icon={AlertCircle}
                  text="No transcript"
                  textStyle={{ color: 'rgba(92,64,51,.38)', fontSize: '11px' }}
                />
              )}

              {hasAudio && (
                <MetaRow icon={Headphones} text="Recording available" />
              )}
            </div>

            {/* Notes count */}
            {localUrls.length > 0 && (
              <div>
                <p className="text-[8.5px] uppercase tracking-[.13em] font-semibold text-[#3D5A35] mb-[7px]">
                  Notes
                </p>
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
                  className={`text-[11px] py-[9px] px-[12px] border-b-2 transition-all duration-150 tracking-[.01em] ${
                    activeTab === tab
                      ? 'text-[#3B2F2F] border-[#3B2F2F]/55 font-semibold'
                      : 'border-transparent font-medium'
                  }`}
                  style={activeTab !== tab ? { color: 'rgba(92,64,51,.38)' } : {}}
                >
                  {tab === 'session' ? 'Session' : 'Notes'}
                </button>
              ))}
            </div>

            {/* Tab content wrapper */}
            <div className="flex-1 relative overflow-hidden min-h-0">
              <div
                key={tabKey}
                className="absolute inset-0 overflow-y-auto animate-tab-in"
                style={{ scrollbarWidth: 'none' }}
              >
                <style>{`div::-webkit-scrollbar{display:none}`}</style>

                {/* ── SESSION TAB ── */}
                {activeTab === 'session' && (
                  <div className="p-[16px_18px] flex flex-col gap-[20px] pb-[28px]">

                    {/* Summary */}
                    <div>
                      <p className="text-[9.5px] uppercase tracking-[.13em] font-semibold text-[#3D5A35] mb-[10px]">
                        Summary
                      </p>
                      <p
                        className="text-[12px] leading-[1.75] rounded-r-[7px] px-[14px] py-[11px]"
                        style={{
                          color: 'rgba(92,64,51,.72)',
                          background: 'rgba(61,90,53,.045)',
                          borderLeft: '2px solid rgba(61,90,53,.22)',
                        }}
                      >
                        {entry.summary || 'No summary yet for this case.'}
                      </p>
                    </div>

                    {/* Transcript */}
                    <div>
                      <p className="text-[9.5px] uppercase tracking-[.13em] font-semibold text-[#3D5A35] mb-[10px]">
                        Transcript
                      </p>

                      {entry.hasTranscript && turns.length > 0 && (
                        <div className="flex flex-col gap-[8px]">
                          {(transcriptStatus === 'partial') && (
                            <div
                              className="text-[11.5px] leading-[1.7] px-[13px] py-[9px] rounded-[8px] mb-[4px]"
                              style={{
                                color: 'rgba(92,64,51,.55)',
                                background: 'rgba(217,208,196,.12)',
                                border: '1px solid rgba(217,208,196,.35)',
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
                                className={`flex gap-[7px] items-start animate-turn-in ${isCandidate ? 'flex-row-reverse' : ''}`}
                                style={{ animationDelay: `${Math.min(i * 30, 280)}ms` }}
                              >
                                <div
                                  className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0 mt-[1px]"
                                  style={
                                    isCandidate
                                      ? { background: 'rgba(217,208,196,.38)', color: 'rgba(92,64,51,.65)', border: '1px solid rgba(217,208,196,.55)' }
                                      : { background: 'rgba(61,90,53,.1)', color: '#3D5A35', border: '1px solid rgba(61,90,53,.14)' }
                                  }
                                >
                                  {isCandidate ? 'C' : 'I'}
                                </div>

                                <div
                                  className="max-w-[74%] px-[11px] py-[8px] text-[11.5px] leading-[1.65] text-[#3B2F2F]"
                                  style={
                                    isCandidate
                                      ? {
                                          background: 'rgba(217,208,196,.18)',
                                          border: '1px solid rgba(217,208,196,.38)',
                                          borderRadius: '10px 10px 3px 10px',
                                        }
                                      : {
                                          background: 'rgba(61,90,53,.055)',
                                          border: '1px solid rgba(61,90,53,.09)',
                                          borderRadius: '10px 10px 10px 3px',
                                        }
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
                          className="px-[13px] py-[11px] rounded-[8px] text-[12px] leading-[1.7]"
                          style={{
                            color: 'rgba(92,64,51,.58)',
                            background: 'rgba(61,90,53,.04)',
                            border: '1px solid rgba(61,90,53,.1)',
                          }}
                        >
                          Generating your transcript right now. It'll show up here automatically once it's done.
                        </div>
                      )}

                      {transcriptStatus === 'failed' && (
                        <div
                          className="px-[13px] py-[11px] rounded-[8px]"
                          style={{
                            background: 'rgba(217,208,196,.12)',
                            border: '1px solid rgba(217,208,196,.38)',
                          }}
                        >
                          {retryQueued ? (
                            <p className="text-[12px] leading-[1.7]" style={{ color: 'rgba(92,64,51,.58)' }}>
                              Retry queued. Your transcript will appear here once it's ready.
                            </p>
                          ) : (
                            <>
                              <p className="text-[12px] leading-[1.7]" style={{ color: 'rgba(92,64,51,.58)' }}>
                                Transcript didn't come through. The audio might have been too short or mostly silent.
                              </p>
                              {entry.hasAudio && entry.lobbyId && (
                                <div className="mt-[9px] flex items-center gap-[8px]">
                                  <button
                                    onClick={() => void handleRetry()}
                                    disabled={retrying}
                                    className="inline-flex items-center gap-[5px] px-[11px] py-[6px] rounded-full text-[10.5px] font-semibold tracking-[.02em] transition-all duration-150 disabled:opacity-60 hover:opacity-80"
                                    style={{
                                      background: 'rgba(217,208,196,.2)',
                                      border: '1px solid rgba(92,64,51,.15)',
                                      color: 'rgba(92,64,51,.65)',
                                    }}
                                  >
                                    {retrying
                                      ? <><Loader2 className="w-[11px] h-[11px] animate-spin" />Queuing...</>
                                      : <><RefreshCw className="w-[11px] h-[11px]" />Try again</>
                                    }
                                  </button>
                                  {retryError && (
                                    <span className="text-[10.5px]" style={{ color: 'rgba(92,64,51,.55)' }}>
                                      {retryError}
                                    </span>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {!entry.hasTranscript && !transcriptStatus && (
                        <p className="text-[12px]" style={{ color: 'rgba(92,64,51,.38)' }}>
                          No transcript recorded for this session.
                        </p>
                      )}
                      {entry.hasAudio && !entry.hasTranscript && transcriptStatus === null && (
                        <p className="text-[12px]" style={{ color: 'rgba(92,64,51,.45)' }}>
                          Transcript wasn't generated for this recording.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── NOTES TAB ── */}
                {activeTab === 'notes' && (
                  <div className="p-[16px_18px]">
                    <p className="text-[11px] mb-[12px]" style={{ color: 'rgba(92,64,51,.38)' }}>
                      Photos of your handwritten notes and frameworks from this case.
                    </p>

                    {expandedUrl ? (
                      <div className="flex flex-col gap-[10px]">
                        <button
                          onClick={() => setExpandedUrl(null)}
                          className="flex items-center gap-[5px] text-[11px] font-medium transition-colors duration-150 self-start"
                          style={{ color: 'rgba(92,64,51,.5)' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#3B2F2F'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(92,64,51,.5)'}
                        >
                          <ChevronLeft className="w-[13px] h-[13px]" />
                          Back to all photos
                        </button>
                        <div
                          className="rounded-[10px] overflow-hidden"
                          style={{ border: '1px solid rgba(217,208,196,.5)' }}
                        >
                          <img
                            src={expandedUrl}
                            alt="Case notes"
                            className="w-full object-contain"
                            style={{ maxHeight: '520px' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        {localUrls.length > 0 && (
                          <div className="flex flex-wrap gap-[8px] mb-[12px]">
                            {localUrls.map((url, i) => (
                              <div
                                key={i}
                                onClick={() => setExpandedUrl(url)}
                                className="w-[84px] h-[84px] rounded-[8px] overflow-hidden cursor-pointer transition-all duration-150"
                                style={{
                                  background: 'rgba(217,208,196,.2)',
                                  border: '1px solid rgba(217,208,196,.45)',
                                }}
                                onMouseEnter={e => {
                                  (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)';
                                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(59,47,47,.1)';
                                }}
                                onMouseLeave={e => {
                                  (e.currentTarget as HTMLElement).style.transform = '';
                                  (e.currentTarget as HTMLElement).style.boxShadow = '';
                                }}
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
                          className="flex flex-col items-center justify-center gap-[7px] rounded-[10px] py-[26px] cursor-pointer transition-all duration-200"
                          style={{
                            border: `1.5px dashed ${dragging ? '#3D5A35' : 'rgba(61,90,53,.22)'}`,
                            background: dragging ? 'rgba(61,90,53,.05)' : 'transparent',
                          }}
                          onMouseEnter={e => {
                            if (!dragging) {
                              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(61,90,53,.38)';
                              (e.currentTarget as HTMLElement).style.background = 'rgba(61,90,53,.03)';
                            }
                          }}
                          onMouseLeave={e => {
                            if (!dragging) {
                              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(61,90,53,.22)';
                              (e.currentTarget as HTMLElement).style.background = 'transparent';
                            }
                          }}
                        >
                          {uploading
                            ? <Loader2 className="w-[20px] h-[20px] animate-spin" style={{ color: 'rgba(92,64,51,.4)' }} />
                            : <Upload className="w-[18px] h-[18px]" style={{ color: 'rgba(92,64,51,.28)' }} />
                          }
                          <p className="text-[11px] font-medium" style={{ color: 'rgba(59,47,47,.65)' }}>
                            {uploading ? 'Uploading...' : localUrls.length > 0 ? 'Add another photo' : 'Drop your photo here'}
                          </p>
                          <p className="text-[10px]" style={{ color: 'rgba(92,64,51,.35)' }}>
                            {uploading ? 'Hang on a moment' : 'or click to browse. PNG, JPG, HEIC up to 10 MB.'}
                          </p>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileInput}
                        />
                        {uploadError && (
                          <p className="text-[11px] mt-[9px]" style={{ color: 'rgba(92,64,51,.65)' }}>
                            {uploadError}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom fade */}
              <div
                className="absolute bottom-0 left-0 right-0 h-[24px] pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, rgba(255,248,240,0), #fff8f0)' }}
              />
            </div>
          </div>
        </div>

        {/* ── AUDIO PLAYER ── */}
        {hasAudio && (
          <div
            className="flex-shrink-0 px-[16px] pt-[9px] pb-[11px] bg-[#fff8f0]"
            style={{ borderTop: '1px solid rgba(92,64,51,.06)' }}
          >
            {/* Play + waveform + time */}
            <div className="flex items-center gap-[9px]">
              <button
                onClick={togglePlay}
                className="w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 transition-all duration-150"
                style={{ background: '#3B2F2F', color: '#F0EBE3' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#5C4033'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.07)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#3B2F2F'; (e.currentTarget as HTMLElement).style.transform = ''; }}
              >
                {isPlaying
                  ? <Pause className="w-[10px] h-[10px]" />
                  : <Play className="w-[10px] h-[10px] ml-[1px]" />
                }
              </button>

              {/* Waveform bars - flex-1 fills all available horizontal space */}
              <div
                className="flex items-end gap-[2px] flex-1 min-w-0 cursor-pointer"
                style={{ height: '28px' }}
                onClick={onWaveClick}
              >
                {WAVE_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[1px] transition-all duration-150"
                    style={{
                      height: `${h}px`,
                      background:
                        i < playedCount
                          ? 'rgba(92,64,51,.32)'
                          : i === playedCount
                            ? 'rgba(92,64,51,.52)'
                            : 'rgba(92,64,51,.09)',
                      transformOrigin: 'bottom',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scaleY(1.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
                  />
                ))}
              </div>

              <span className="text-[10px] tabular-nums whitespace-nowrap shrink-0" style={{ color: 'rgba(92,64,51,.35)' }}>
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
            </div>

            {/* Scrubber - 37px left offset = play button 28px + gap 9px */}
            <div
              className="relative rounded-[1px] cursor-pointer"
              style={{
                height: '1.5px',
                margin: '5px 0 0 37px',
                background: 'rgba(217,208,196,.4)',
              }}
              onClick={onScrubClick}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-[1px]"
                style={{
                  width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
                  background: 'rgba(92,64,51,.3)',
                }}
              />
              <div
                className="absolute w-[7px] h-[7px] rounded-full bg-[#3B2F2F]"
                style={{
                  top: '-3px',
                  left: duration > 0 ? `calc(${(currentTime / duration) * 100}% - 3.5px)` : '-3.5px',
                  transition: 'left .1s linear',
                }}
              />
            </div>

            {/* Speed pills */}
            <div className="flex items-center gap-[3px] mt-[6px] ml-[37px]">
              {[0.75, 1, 1.25, 1.5, 2].map(r => (
                <button
                  key={r}
                  onClick={() => setSpeed(r)}
                  className="text-[9px] px-[7px] py-[2px] rounded-[8px] font-medium transition-all duration-100"
                  style={
                    playbackRate === r
                      ? { background: '#3B2F2F', color: '#F0EBE3', border: '1px solid #3B2F2F' }
                      : { color: 'rgba(92,64,51,.35)', border: '1px solid rgba(92,64,51,.1)' }
                  }
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hidden audio element */}
        {audioUrl && (
          <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />
        )}
      </div>
    </div>
  );
}

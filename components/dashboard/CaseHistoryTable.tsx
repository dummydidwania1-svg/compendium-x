'use client';

import { createPortal } from 'react-dom';
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Eye, ImageUp, Image, ChevronDown, ChevronUp, ArrowUpDown, X, FileText, Headphones, AlignLeft, RefreshCw } from 'lucide-react';
import { filterDashboardEntries } from '@/lib/dashboard/live';
import { useDashboard } from './DashboardContext';
import { apiPost } from '@/lib/api/client';
import SnapshotOverlay from './SnapshotOverlay';

// ── Utility: format date as "Mar 12, 2026" ──
const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const formatDateStr = (dateStr: string): string => {
  return formatDate(dateStr);
};

const stripTranscriptTimestamps = (value: string): string =>
  value
    .replace(/\[\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*\]/g, '')
    .replace(/\(\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*\)/g, '')
    .replace(/<\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*>/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();

const ROW_HEIGHT = 68;
const MAX_VISIBLE_ROWS = 6;

const IconButton = ({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: React.ElementType;
  label?: string;
  onClick: () => void;
  variant?: 'default' | 'accent' | 'muted';
}) => {
  const variantClass =
  variant === 'accent'
    ? 'text-[#3D5A35]/55 hover:text-[#3D5A35] hover:bg-[#3D5A35]/10'
    : variant === 'muted'
    ? 'text-[#5C4033]/30 hover:text-[#5C4033]/60 hover:bg-[#D9D0C4]/30'
    : 'text-[#5C4033]/60 hover:text-[#3B2F2F] hover:bg-[#D9D0C4]/40';

return (
  <div className="flex flex-col items-center gap-0.5">
    <button
      onClick={onClick}
      className={`p-1.5 rounded-md active:scale-90 transition-all ${variantClass}`}
    >
        <Icon size={14} />
      </button>
      <span className="text-[7px] text-[#5C4033]/40 font-medium tracking-wide">
        {label}
      </span>
    </div>
  );
};

// ── Case Detail Overlay ──
const CaseDetailOverlay = ({ entry, onClose }: { entry: any; onClose: () => void }) => {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryQueued, setRetryQueued] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const transcriptText = stripTranscriptTimestamps(entry.transcript || entry.transcriptPreview || '');
  const transcriptStatus: string | null = entry.transcriptStatus ?? null;
  const transcriptError: string | null = entry.transcriptError ?? null;
  const lobbyId: string | null = entry.lobbyId ?? null;

  const handleRetryTranscript = async () => {
    if (!lobbyId || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/recording/retry-transcript`, {});
      setRetryQueued(true);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Could not queue transcript retry.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-[#3B2F2F]/30 backdrop-blur-sm" />
      <div
        className="relative bg-[#fff8f0]/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#5C4033]/12 w-full max-w-3xl animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
      
      {/* Header */}
<div className="flex items-center justify-between px-4 py-3 border-b border-[#5C4033]/10">
  <div className="flex items-center gap-2 min-w-0">
    <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[#5C4033]/55 shrink-0">
      CASE DETAILS
    </span>
    <span className="text-[10px] text-[#5C4033]/30 shrink-0">·</span>
    <span className="text-xs font-semibold text-[#3B2F2F] truncate">
      {entry.name}
    </span>
  </div>
  <div className="flex items-center gap-2.5 shrink-0 ml-2">
    <span className="text-[9px] font-medium text-[#5C4033]/30 tabular-nums tracking-wide">
      {entry.score} / 5
    </span>
    <button
      onClick={onClose}
      className="w-5 h-5 flex items-center justify-center rounded-full bg-[#D9D0C4]/50 text-[#5C4033] hover:bg-[#3B2F2F] hover:text-[#F0EBE3] transition-colors"
    >
      <X className="w-2.5 h-2.5" />
    </button>
  </div>
</div>

      {/* Meta tags */}
      <div className="px-4 pt-3 flex gap-1.5">
        <span className="text-[9px] font-semibold bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/65 px-2 py-[3px] rounded-md">{entry.type}</span>
        <span className="text-[9px] font-medium bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/55 px-2 py-[3px] rounded-md">{entry.level}</span>
        <span className="text-[9px] font-medium bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/50 px-2 py-[3px] rounded-md">{formatDateStr(entry.date)}</span>
        <span className="text-[9px] font-medium bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/50 px-2 py-[3px] rounded-md">Score: {entry.score}</span>
      </div>

      {/* Content sections */}
      <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto custom-scrollbar">
        {/* Summary */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlignLeft className="w-3 h-3 text-[#5C4033]/50" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Summary</p>
          </div>
          <p className="text-xs text-[#5C4033]/80 leading-relaxed">
            {entry.summary || 'No summary available for this case yet.'}
          </p>
        </div>

        {/* Transcript */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText className="w-3 h-3 text-[#5C4033]/50" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Transcript</p>
          </div>
          {entry.hasTranscript ? (
            <div className="rounded-lg border border-[#CFC2B1] bg-[#EEE6DA] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[#5C4033]/70 italic">
                  {transcriptText ? 'Transcript available.' : 'Transcript metadata is available.'}
                </p>
                {transcriptText ? (
                  <button
                    onClick={() => setShowTranscript((current) => !current)}
                    className="shrink-0 rounded-full border border-[#D7CABA] bg-[#FBF6EF] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5C4033]/68 transition hover:border-[#B7A387] hover:bg-[#F3EBDF] hover:text-[#3D5A35]"
                  >
                    {showTranscript ? 'Hide' : 'View'}
                  </button>
                ) : null}
              </div>
              {showTranscript && transcriptText ? (
                <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-[#D7CABA] bg-[#F8F1E8] p-3 custom-scrollbar">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#5C4033]/78">{transcriptText}</p>
                </div>
              ) : null}
            </div>
          ) : transcriptStatus === 'processing' || transcriptStatus === 'pending' ? (
            <div className="rounded-lg border border-[#CFC2B1] bg-[#EEE6DA] p-3">
              <p className="text-xs italic text-[#5C4033]/70">
                Transcript is still being generated. Check back in a minute — it appears here automatically when ready.
              </p>
            </div>
          ) : transcriptStatus === 'failed' ? (
            <div className="rounded-lg border border-[#D9C2A8] bg-[#FBF1E1] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[#92400e]">
                {retryQueued ? 'Transcript queued' : 'Transcript not generated'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#5C4033]/80">
                {retryQueued
                  ? 'Your retry is processing in the background. The transcript will appear here automatically when ready.'
                  : transcriptError
                    ? transcriptError
                    : 'We couldn’t generate a transcript for this recording. The audio may have been too short or mostly silent.'}
              </p>
              {!retryQueued && entry.hasAudio && lobbyId ? (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => void handleRetryTranscript()}
                    disabled={retrying}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#D7CABA] bg-[#FBF6EF] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5C4033]/78 transition hover:border-[#B7A387] hover:bg-[#F3EBDF] hover:text-[#3D5A35] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`} />
                    {retrying ? 'Queuing…' : 'Retry transcript'}
                  </button>
                  {retryError ? (
                    <span className="text-[10px] text-[#92400e]">{retryError}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : entry.hasAudio ? (
            <p className="text-xs text-[#5C4033]/55 italic">
              Transcript not generated for this recording.
            </p>
          ) : (
            <p className="text-xs text-[#5C4033]/40">No transcript recorded.</p>
          )}
        </div>

        {/* Audio */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Headphones className="w-3 h-3 text-[#5C4033]/50" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Audio</p>
          </div>
          {entry.hasAudio && entry.audioUrl ? (
            <div className="rounded-lg border border-[#CFC2B1] bg-[#EEE6DA] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[#5C4033]/70 italic">Audio recording available.</p>
                <button
                  onClick={() => setShowAudioPlayer((current) => !current)}
                  className="shrink-0 rounded-full border border-[#D7CABA] bg-[#FBF6EF] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5C4033]/68 transition hover:border-[#B7A387] hover:bg-[#F3EBDF] hover:text-[#3D5A35]"
                >
                  {showAudioPlayer ? 'Hide' : 'Play'}
                </button>
              </div>
              {showAudioPlayer ? (
                <div className="mt-3 rounded-md border border-[#D7CABA] bg-[#F8F1E8] p-3">
                  <audio
                    controls
                    src={entry.audioUrl}
                    className="w-full rounded-full"
                    style={{ filter: 'sepia(18%) saturate(82%) hue-rotate(345deg) brightness(0.98)' }}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-[#5C4033]/40">No audio recorded.</p>
          )}
        </div>
      </div>
    </div>
  </div>
  );
};

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
interface Filters {
  types: string[];
  levels: string[];
  time: string;
  customStart: string;
  customEnd: string;
}

// ── Sort types ──
type SortField = 'name' | 'date' | 'score';
type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'name', label: 'Case' },
  { field: 'date', label: 'Date' },
  { field: 'score', label: 'Score' },
];

const CaseHistoryTable = ({ filters }: { filters: Filters }) => {
  const { entries } = useDashboard();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [detailEntry, setDetailEntry] = useState<any>(null);
  const [snapshotEntry, setSnapshotEntry] = useState<any>(null);
  const [sortField, setSortField] = useState<SortField>('date');
const [sortDir, setSortDir] = useState<SortDir>('desc');
const [showSortMenu, setShowSortMenu] = useState(false);
const sortBtnRef = useRef<HTMLDivElement>(null);
const canUseDOM = typeof document !== 'undefined';

// Close sort menu on outside click
useEffect(() => {
  if (!showSortMenu) return;
  const handleClick = (e: MouseEvent) => {
    if (sortBtnRef.current && !sortBtnRef.current.contains(e.target as Node)) {
      setShowSortMenu(false);
    }
  };
  document.addEventListener('mousedown', handleClick);
  return () => document.removeEventListener('mousedown', handleClick);
}, [showSortMenu]);

// ── Filter logic (same as CaseScoreCard) ──
const filteredCases = useMemo(() => {
  const normalizedFilters = {
    ...filters,
    time:
      filters.time === '7d'
        ? 'last7'
        : filters.time === '30d'
          ? 'last30'
          : filters.time === '90d'
            ? 'custom'
            : filters.time,
  };

  if (filters.time === '90d') {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 90);
    normalizedFilters.customStart = start.toISOString().slice(0, 10);
    normalizedFilters.customEnd = end.toISOString().slice(0, 10);
  }

  return filterDashboardEntries(entries, normalizedFilters);
}, [entries, filters]);

const sortedCases = useMemo(() => {
  const arr = [...filteredCases];

  arr.sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortField === 'date') {
      cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (sortField === 'score') {
      cmp = a.score - b.score;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return arr;
}, [filteredCases, sortField, sortDir]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const check = () => {
      setCanScroll(el.scrollHeight > el.clientHeight);
      setIsAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
    };

    check();
    el.addEventListener('scroll', check);
    return () => el.removeEventListener('scroll', check);
  }, []);

  const maxHeight = MAX_VISIBLE_ROWS * ROW_HEIGHT + 40;

  return (
    <>
      <div className="glass-card p-6 flex flex-col overflow-hidden">
        {/* Header */}
<div className="mb-4 flex items-start justify-between">
  <div>
    <div className="eyebrow !mb-1 flex items-center">PRACTICE LOG</div>
    <h3 className="text-sm font-medium text-[#3B2F2F] tracking-tight">All Cases</h3>
  </div>

  {/* Sort trigger */}
  <div className="relative" ref={sortBtnRef}>
    <button
      onClick={() => setShowSortMenu((v) => !v)}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium tracking-wide transition-all duration-200 ${
        showSortMenu
          ? 'bg-[#D9D0C4]/40 text-[#3B2F2F]'
          : 'text-[#5C4033]/40 hover:text-[#5C4033]/70 hover:bg-[#D9D0C4]/20'
      }`}
    >
      <ArrowUpDown className="w-3 h-3" />
      <span className="hidden sm:inline">
        {SORT_OPTIONS.find((o) => o.field === sortField)?.label}
      </span>
      {sortDir === 'asc' ? (
        <ChevronUp className="w-2.5 h-2.5 opacity-50" />
      ) : (
        <ChevronDown className="w-2.5 h-2.5 opacity-50" />
      )}
    </button>

    {/* ── Sort dropdown — glass popover ── */}
    {showSortMenu && (
      <div className="absolute right-0 top-full mt-1.5 z-30 w-[160px] rounded-xl border border-[#D9D0C4]/40 bg-[#fff8f0]/95 backdrop-blur-xl shadow-lg overflow-hidden animate-scale-in">
        <div className="px-2.5 pt-2.5 pb-1">
          <span className="text-[8px] uppercase tracking-widest font-semibold text-[#5C4033]/35">
            Sort by
          </span>
        </div>

        {SORT_OPTIONS.map((opt) => {
          const isActive = sortField === opt.field;
          return (
            <button
              key={opt.field}
              onClick={() => {
                if (isActive) {
                  // Toggle direction if already selected
                  setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                } else {
                  setSortField(opt.field);
                  // Smart defaults: date → desc, others → asc
                  setSortDir(opt.field === 'date' ? 'desc' : 'asc');
                }
                setShowSortMenu(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-[#3B2F2F] bg-[#D9D0C4]/25'
                  : 'text-[#5C4033]/60 hover:text-[#3B2F2F] hover:bg-[#D9D0C4]/15'
              }`}
            >
              <span>{opt.label}</span>
              {isActive && (
                <span className="flex items-center gap-0.5 text-[9px] text-[#3D5A35] font-semibold">
                  {sortDir === 'asc' ? '↑ ASC' : '↓ DESC'}
                </span>
              )}
            </button>
          );
        })}

{/* Reset to default */}
{(sortField !== 'date' || sortDir !== 'desc') && (
  <button
    onClick={() => {
      setSortField('date');
      setSortDir('desc');
      setShowSortMenu(false);
    }}
    className="w-full flex items-center justify-center gap-1 px-2.5 py-1.5 border-t border-[#5C4033]/[0.06] text-[9px] font-medium text-[#5C4033]/35 hover:text-[#5C4033]/60 hover:bg-[#D9D0C4]/10 transition-colors"
  >
    <X className="w-2.5 h-2.5" />
    Reset
  </button>
)}
      </div>
    )}
  </div>
</div>

        {/* Scrollable table */}
        <div
  ref={scrollRef}
  className="overflow-y-auto overflow-x-hidden"
  style={{
    height: `${maxHeight}px`,
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  }}
>
          <style>{`div::-webkit-scrollbar { display: none; }`}</style>

          {sortedCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#5C4033]/40">
              <Eye className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm font-medium">No entries yet</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-fixed">
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[22%]" />
                <col className="w-[16%]" />
                <col className="w-[24%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#fff8f0]/95 backdrop-blur-sm">
                <tr className="border-b border-[#5C4033]/10">
                  <th className="py-3 px-3 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Case</th>
                  <th className="py-3 px-3 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Date</th>
                  <th className="py-3 px-3 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60 text-center">Score</th>
                  <th className="py-3 px-3 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60 text-center">Assets</th>
                </tr>
              </thead>
              <tbody>
                {sortedCases.map((entry, i) => (
                  <tr
                    key={entry.id}
                    className={`group transition-colors hover:bg-[#D9D0C4]/20 ${
                      i % 2 === 0 ? 'bg-transparent' : 'bg-[#D9D0C4]/5'
                    }`}
                  >
                    {/* Case name + tags */}
                    <td className="py-3 px-3">
                      <p className="text-xs font-medium text-[#3B2F2F] leading-snug truncate" title={entry.name}>
                        {entry.name}
                      </p>
                      <div className="flex gap-1 mt-1">
                        <span className="text-[8px] font-semibold bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/60 hover:text-[#3B2F2F] hover:bg-[#D9D0C4]/28 px-1.5 py-[3px] rounded-md whitespace-nowrap transition-colors">
                        {entry.type}
                        </span>
                        <span className="text-[8px] font-medium bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/50 hover:text-[#3B2F2F] hover:bg-[#D9D0C4]/28 px-1.5 py-[3px] rounded-md whitespace-nowrap transition-colors">
                        {entry.level}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-xs text-[#5C4033]/70 tabular-nums whitespace-nowrap align-middle">
  {formatDate(entry.date)}
</td>
                    {/* Score */}
                    <td className="py-3 px-3 text-xs text-[#5C4033]/70 text-center tabular-nums align-middle">
  {entry.score}
</td>

                    {/* Assets — two icon buttons with micro-labels */}
                    <td className="py-3 px-3 align-middle">
<div className="flex items-center justify-center gap-3">
                        <div className="flex flex-col items-center gap-0.5">
                        <IconButton
                            icon={Eye}
                            onClick={() => setDetailEntry(entry)}
                            variant="default"
                        />
                        <span className="text-[7px] text-[#5C4033]/30 font-medium leading-none">Details</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                        <IconButton
                            icon={entry.hasSnapshot ? Image : ImageUp}
                            onClick={() => setSnapshotEntry(entry)}
                            variant={entry.hasSnapshot ? 'accent' : 'muted'}
                        />
                        <span className="text-[7px] text-[#5C4033]/30 font-medium leading-none">
                            {entry.hasSnapshot ? 'Notes' : 'Upload'}
                        </span>
                        </div>
                    </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Scroll hint */}
        {canScroll && !isAtBottom && (
          <div className="relative pt-1">
            <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-[#fff8f0] to-transparent pointer-events-none" />
            <div className="flex justify-center">
              <ChevronDown className="w-3.5 h-3.5 text-[#5C4033]/25 animate-bounce" />
            </div>
          </div>
        )}

        {/* Footer */}
        {sortedCases.length > 0 && (
          <div className="mt-auto pt-3">
            <div className="border-t border-[#5C4033]/[0.06]" />
            <div className="pt-3">
              <span className="text-[10px] font-medium text-[#5C4033]/35 tracking-wide">
                {sortedCases.length} entries
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Overlays — portaled to body so they cover the entire dashboard */}
    {detailEntry && canUseDOM && createPortal(
    <CaseDetailOverlay entry={detailEntry} onClose={() => setDetailEntry(null)} />,
    document.body
    )}
    {snapshotEntry && canUseDOM && createPortal(
    <SnapshotOverlay entry={snapshotEntry} onClose={() => setSnapshotEntry(null)} />,
    document.body
    )}
    </>
  );
};

export default CaseHistoryTable;

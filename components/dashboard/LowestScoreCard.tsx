'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Eye, ImageUp, Image, X, ChevronDown, ChevronRight, FileText, Headphones, AlignLeft } from 'lucide-react';
import { COLORS } from '@/lib/constants';
import { createPortal } from 'react-dom';
import { filterDashboardEntries } from '@/lib/dashboard/live';
import { useDashboard } from './DashboardContext';
import SnapshotOverlay from './SnapshotOverlay';

// ── Score colour using dashboard palette ──
const scoreColor = (score: number): string => {
  if (score >= 3.5) return COLORS.accent;
  if (score >= 2.5) return COLORS.warm;
  return COLORS.dark;
};

// ── Date formatter (same as CaseHistoryTable) ──
const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

// ── Icon button (SAME as CaseHistoryTable — includes label) ──
const IconButton = ({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: React.ElementType;
  label: string;
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

// ── Case Detail Overlay (SAME as CaseHistoryTable) ──
const CaseDetailOverlay = ({ entry, onClose }: { entry: any; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-[#3B2F2F]/30 backdrop-blur-sm" />
    <div
      className="relative bg-[#fff8f0]/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#5C4033]/12 w-full max-w-3xl animate-scale-in overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
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
      <div className="px-4 pt-3 flex gap-1.5">
        <span className="text-[9px] font-semibold bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/65 px-2 py-[3px] rounded-md">{entry.type}</span>
        <span className="text-[9px] font-medium bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/55 px-2 py-[3px] rounded-md">{entry.level}</span>
        <span className="text-[9px] font-medium bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/50 px-2 py-[3px] rounded-md">{formatDate(entry.date)}</span>
        <span className="text-[9px] font-medium bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/50 px-2 py-[3px] rounded-md">Score: {entry.score}</span>
      </div>
      <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto custom-scrollbar">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlignLeft className="w-3 h-3 text-[#5C4033]/50" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Summary</p>
          </div>
          <p className="text-xs text-[#5C4033]/80 leading-relaxed">
            {entry.summary || 'No summary available for this case yet.'}
          </p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText className="w-3 h-3 text-[#5C4033]/50" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Transcript</p>
          </div>
          {entry.hasTranscript ? (
            <div className="bg-[#D9D0C4]/20 rounded-lg p-3">
              <p className="text-xs text-[#5C4033]/70 italic">Transcript available — click to expand in full view.</p>
            </div>
          ) : entry.transcriptStatus === 'processing' || entry.transcriptStatus === 'pending' ? (
            <p className="text-xs text-[#5C4033]/55 italic">Transcript still generating.</p>
          ) : entry.transcriptStatus === 'failed' ? (
            <p className="text-xs text-[#92400e]/80 italic">
              {entry.transcriptError || 'Transcript not generated — recording may have been too short or silent.'}
            </p>
          ) : (
            <p className="text-xs text-[#5C4033]/40">No transcript recorded.</p>
          )}
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Headphones className="w-3 h-3 text-[#5C4033]/50" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Audio</p>
          </div>
          {entry.hasAudio ? (
            <div className="bg-[#D9D0C4]/20 rounded-lg p-3">
              <p className="text-xs text-[#5C4033]/70 italic">Audio recording available.</p>
            </div>
          ) : (
            <p className="text-xs text-[#5C4033]/40">No audio recorded.</p>
          )}
        </div>
      </div>
    </div>
  </div>
);

// ── Score Overlay (glass backdrop, functional asset buttons) ──
const ScoreOverlay = ({
  title,
  score,
  cases,
  onClose,
}: {
  title: string;
  score: number;
  cases: any[];
  onClose: () => void;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [detailEntry, setDetailEntry] = useState<any>(null);
  const [snapshotEntry, setSnapshotEntry] = useState<any>(null);
  const canUseDOM = typeof document !== 'undefined';

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

  const ROW_HEIGHT = 68;
  const MAX_ROWS = 2;
  const maxHeight = MAX_ROWS * ROW_HEIGHT + 20;

  return (
    <>
      <div className="absolute inset-0 z-40 flex items-center justify-center p-6" onClick={onClose} style= {{cursor: 'default' }}>
        <div className="absolute inset-0 bg-[#fff8f0]/40 backdrop-blur-md" style= {{cursor: 'default'  }}/>

        <div
          className="relative bg-[#fff8f0]/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#5C4033]/12 w-full max-w-md max-h-[90%] animate-scale-in overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Compact single-row header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#5C4033]/10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[#5C4033]/55">
                {title}
              </span>
              <span className="text-[10px] text-[#5C4033]/30">·</span>
              <span className="text-xs font-semibold text-[#3B2F2F] tabular-nums">
                {score} / 5
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-medium text-[#5C4033]/30 tabular-nums tracking-wide">
                {cases.length} {cases.length === 1 ? 'entry' : 'entries'}
              </span>
              <button
                onClick={onClose}
                className="w-5 h-5 flex items-center justify-center rounded-full bg-[#D9D0C4]/50 text-[#5C4033] hover:bg-[#3B2F2F] hover:text-[#F0EBE3] transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="p-4">
            <div
              ref={scrollRef}
              className="overflow-y-auto overflow-x-hidden"
              style={{
                maxHeight: `${maxHeight}px`,
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              <style>{`div::-webkit-scrollbar { display: none; }`}</style>

              {cases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#5C4033]/40">
                  <Eye className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm font-medium">No entries</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse table-fixed">
                  <colgroup>
                    <col className="w-[45%]" />
                    <col className="w-[25%]" />
                    <col className="w-[30%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#fff8f0]">
                    <tr className="border-b border-[#5C4033]/10">
                      <th className="py-3 px-3 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Case</th>
                      <th className="py-3 px-3 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Date</th>
                      <th className="py-3 px-3 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60 text-center">Assets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((entry, i) => (
                      <tr
                        key={entry.id}
                        className={`group transition-colors hover:bg-[#D9D0C4]/20 ${
                          i % 2 === 0 ? 'bg-transparent' : 'bg-[#D9D0C4]/5'
                        }`}
                      >
                        <td className="py-3 px-3">
                          <p className="text-xs font-medium text-[#3B2F2F] leading-snug truncate" title={entry.name}>{entry.name}</p>
                          <div className="flex gap-1 mt-1">
                            <span className="text-[8px] font-semibold bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/60 hover:text-[#3B2F2F] hover:bg-[#D9D0C4]/28 px-1.5 py-[3px] rounded-md whitespace-nowrap transition-colors">{entry.type}</span>
                            <span className="text-[8px] font-medium bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/50 hover:text-[#3B2F2F] hover:bg-[#D9D0C4]/28 px-1.5 py-[3px] rounded-md whitespace-nowrap transition-colors">{entry.level}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-[#5C4033]/70 tabular-nums whitespace-nowrap align-middle">{formatDate(entry.date)}</td>
                        <td className="py-3 px-3 align-middle">
                          <div className="flex items-center justify-center gap-3">
                            <IconButton
                              icon={Eye}
                              label="Details"
                              onClick={() => setDetailEntry(entry)}
                              variant="default"
                            />
                            <IconButton
                              icon={entry.hasSnapshot ? Image : ImageUp}
                              label={entry.hasSnapshot ? 'Notes' : 'Upload'}
                              onClick={() => setSnapshotEntry(entry)}
                              variant={entry.hasSnapshot ? 'accent' : 'muted'}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {canScroll && !isAtBottom && (
              <div className="relative pt-1">
                <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-[#fff8f0] to-transparent pointer-events-none" />
                <div className="flex justify-center">
                  <ChevronDown className="w-3.5 h-3.5 text-[#5C4033]/25 animate-bounce" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overlays — portaled to body so they cover everything */}
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

// ══════════════════════════════════════════════
// MAIN CARD
// ══════════════════════════════════════════════
interface LowestScoreCardProps {
  filters: {
    types: string[];
    levels: string[];
    time: string;
    customStart: string;
    customEnd: string;
  };
}

const LowestScoreCard = ({ filters }: LowestScoreCardProps) => {
  const { entries } = useDashboard();
  const [showOverlay, setShowOverlay] = useState(false);

  const filteredCases = useMemo(() => {
    return filterDashboardEntries(entries, filters);
  }, [entries, filters]);

  const lowestScore = useMemo(() => {
    if (filteredCases.length === 0) return 0;
    return Math.min(...filteredCases.map((c) => c.score));
  }, [filteredCases]);

  const lowestCases = useMemo(() => {
    return filteredCases.filter((c) => c.score === lowestScore);
  }, [filteredCases, lowestScore]);

  const noData = filteredCases.length === 0;

  const [displayScore, setDisplayScore] = useState(0);
  useEffect(() => {
    const duration = 600;
    const start = performance.now();
    const target = lowestScore;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(+(eased * target).toFixed(1));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [lowestScore]);

  return (
    <>
      <div
        onClick={() => !noData && setShowOverlay(true)}
        className="glass-card p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-[#D9D0C4]/20 transition-all group min-h-[140px] hover:-translate-y-0.5 hover:shadow-lg duration-300 ease-out"
      >
        <div className="eyebrow !mb-0.5 justify-center text-[9px]">NEEDS WORK</div>
        <h3 className="text-[10px] font-semibold text-[#3B2F2F] tracking-tight text-center">
          Lowest Score
        </h3>

        {noData ? (
          <p className="text-xs text-[#5C4033]/50 text-center mt-2">No data</p>
        ) : (
          <>
            <div className="relative mt-1">
              <div
                className="absolute -inset-3 rounded-full opacity-15 blur-xl pointer-events-none"
                style= {{backgroundColor: scoreColor(lowestScore)}} 
              />
              <span className="relative font-serif text-2xl font-bold text-[#3B2F2F] group-hover:scale-105 transition-transform">
                {displayScore}
              </span>
            </div>
            <span className="text-[9px] text-[#5C4033]/40 mt-1 group-hover:text-[#5C4033]/60 transition-all tracking-wide flex items-center gap-0.5">
              View Details
              <ChevronRight className="w-2.5 h-2.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
            </span>
          </>
        )}
      </div>

      {showOverlay && (
        <ScoreOverlay
          title="LOWEST SCORE"
          score={lowestScore}
          cases={lowestCases}
          onClose={() => setShowOverlay(false)}
        />
      )}
    </>
  );
};

export default LowestScoreCard;

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, RefreshCw, Lock } from 'lucide-react';
import { precompute, type CoachFilters, type CoachMetrics } from '@/lib/coachPrecompute';
import { useDashboard, useIsPreview } from './DashboardContext';

interface CoachInsightProps {
  filters: CoachFilters;
}

/**
 * Coordinated public launch: the Coach is live, flipped together with the
 * Feedback Analyser and Goal Tracker. Set back to true to re-gate the surface
 * without touching the server route, auto-fire, or state handling below.
 */
const COACH_LOCKED = false;

interface CoachOutput {
  headline: string;
  insight: string;
  action: string;
}

const VERBS = ['Reading your numbers', 'Spotting trends', 'Checking streaks', 'Comparing levels', 'Almost there'];

// ── Filter signature: remounts and filter flips reuse the last result ─────────
function filterSignature(filters: CoachFilters): string {
  return JSON.stringify([
    filters.types,
    filters.levels,
    filters.time,
    filters.customStart ?? '',
    filters.customEnd ?? '',
  ]);
}

const CoachInsight = ({ filters }: CoachInsightProps) => {
  const { entries } = useDashboard();
  const isPreview = useIsPreview();
  const [hovered, setHovered] = useState(false);

  const ratedCount = useMemo(() => entries.filter((e) => !e.isUnrated).length, [entries]);
  const metrics: CoachMetrics | null = useMemo(
    () => (ratedCount > 0 ? precompute(entries, filters) : null),
    [entries, filters, ratedCount],
  );

  // Session cache: same filters + same data → no refire on remount.
  const signature = useMemo(
    () => `${filterSignature(filters)}|${entries.length}|${ratedCount}`,
    [filters, entries.length, ratedCount],
  );
  const cacheRef = useRef<{ sig: string; output: CoachOutput | null; message?: string }>({ sig: '', output: null });

  const [loading, setLoading] = useState(false);
  const [verbIdx, setVerbIdx] = useState(0);
  const [output, setOutput] = useState<CoachOutput | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [staleSig, setStaleSig] = useState(false);
  const inflightSigRef = useRef<string>('');

  // ── Loading verb cycle ──
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setVerbIdx((i) => i + 1), 900);
    return () => clearInterval(t);
  }, [loading]);

  const runAnalysis = useCallback(async () => {
    if (COACH_LOCKED) return;
    if (!metrics || loading || inflightSigRef.current === signature) return;

    if (cacheRef.current.sig === signature && cacheRef.current.output) {
      setOutput(cacheRef.current.output);
      setMessage(null);
      setError('');
      return;
    }

    if (metrics.filteredCount === 0) {
      // The prompt's own n=0 hard-stop, rendered locally without spending tokens.
      setOutput(null);
      setMessage('No cases match this filter. Adjust your filters or complete a case in this category.');
      return;
    }

    inflightSigRef.current = signature;
    setLoading(true);
    setError('');

    try {
      // Build CSV from ALL rated cases (the model compares filtered vs global).
      const casesCsv = metrics.allCases
        .map((c) => `${c.id},${c.date},${c.type},${c.level},${c.structure},${c.analysis},${c.creativity},${c.delivery}`)
        .join('\n');

      const res = await import('@/lib/api/client').then((m) =>
        m.apiPost<{ output: CoachOutput | null; message?: string }>('/api/coach-insight', {
          today: metrics.today,
          activeFiltersLabel: activeFiltersLabel(metrics),
          totalRatedCases: ratedCount,
          globalAvg: metrics.globalAvg,
          filteredCount: metrics.filteredCount,
          filteredAvg: metrics.filteredAvg,
          currentStreak: metrics.currentStreak,
          streakBreaks: metrics.streakBreaks,
          streakOverlapsFilter: metrics.streakOverlapsFilter,
          outliers: metrics.outliers.map((c) => ({
            id: c.id,
            date: c.date,
            type: c.type,
            level: c.level,
            structure: c.structure,
            analysis: c.analysis,
            creativity: c.creativity,
            delivery: c.delivery,
          })),
          casesCsv,
        }),
      );

      cacheRef.current = { sig: signature, output: res.output ?? null, message: res.message };
      setStaleSig(false);
      if (res.output) {
        setOutput(res.output);
        setMessage(res.message ?? null);
      } else {
        setOutput(null);
        setMessage(res.message ?? 'Your coach has nothing to flag right now.');
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.message.toLowerCase().includes('too many requests')
          ? 'You are going very fast — give it a few seconds and try again.'
          : 'Could not reach the coach just now. Try again in a moment.';
      setError(msg);
    } finally {
      setLoading(false);
      inflightSigRef.current = '';
    }
  }, [metrics, signature, loading, ratedCount]);

  // ── Original behaviour: auto-fire on mount, debounced on filter changes ──────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (COACH_LOCKED || isPreview || !metrics) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (firstRunRef.current) {
      firstRunRef.current = false;
      void runAnalysis();
      return;
    }
    // Data/filter changes after mount: mark cached result stale and debounce.
    if (cacheRef.current.sig !== signature) setStaleSig(true);
    debounceRef.current = setTimeout(() => void runAnalysis(), 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isPreview, metrics, runAnalysis, signature]);

  // ── States ──
  // Suite launch hold: original tombstone, byte-for-byte the parked design.
  if (COACH_LOCKED) {
    return (
      <div
        className="glass-card p-6 flex flex-col relative overflow-hidden group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <style>{`
          @keyframes _ci_lock_float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
          @keyframes _ci_lock_pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
          @keyframes _ci_ring       { 0%{transform:scale(1);opacity:0.35} 70%{transform:scale(2.2);opacity:0} 100%{transform:scale(2.2);opacity:0} }
          @keyframes _ci_ring2      { 0%{transform:scale(1);opacity:0.2} 70%{transform:scale(2.6);opacity:0} 100%{transform:scale(2.6);opacity:0} }
        `}</style>

        <div className="relative z-10 flex items-center justify-between mb-2">
          <div className="eyebrow !mb-0 flex items-center">
            <Sparkles className="w-3 h-3 mr-2 text-[#3D5A35]" />
            THE COACH
          </div>
        </div>

        <div className="flex flex-col gap-2.5 py-2 opacity-20 select-none pointer-events-none">
          <div className="h-3 w-3/4 rounded-full bg-[#5C4033]/20" />
          <div className="h-px bg-gradient-to-r from-[#5C4033]/12 via-[#5C4033]/6 to-transparent" />
          <div className="h-2.5 w-full rounded-full bg-[#5C4033]/12" />
          <div className="h-2.5 w-5/6 rounded-full bg-[#5C4033]/10" />
          <div className="h-2.5 w-4/6 rounded-full bg-[#5C4033]/8" />
          <div className="h-2.5 w-2/4 rounded-full bg-[#5C4033]/6" />
        </div>

        <div
          className="absolute left-0 right-0 bottom-0 flex flex-col items-center justify-center text-center px-6 gap-3 transition-all duration-400"
          style={{
            top: '44px',
            backdropFilter: hovered ? 'blur(52px) saturate(2.4)' : 'blur(36px) saturate(2.0)',
            WebkitBackdropFilter: hovered ? 'blur(52px) saturate(2.4)' : 'blur(36px) saturate(2.0)',
            background: hovered ? 'rgba(255,248,240,0.92)' : 'rgba(255,248,240,0.82)',
            borderRadius: '0 0 inherit inherit',
          }}
        >
          <div className="relative flex items-center justify-center" style={{ width: '40px', height: '40px' }}>
            <span className="absolute inset-0 rounded-full border border-[#3D5A35]/20"
              style={{ animation: '_ci_ring2 3.4s cubic-bezier(0.215,0.61,0.355,1) 0.6s infinite' }} />
            <span className="absolute inset-0 rounded-full border border-[#3D5A35]/30"
              style={{ animation: '_ci_ring 2.8s cubic-bezier(0.215,0.61,0.355,1) infinite' }} />
            <Lock
              className="relative z-10 transition-all duration-400"
              style={{
                width: hovered ? '18px' : '15px',
                height: hovered ? '18px' : '15px',
                color: hovered ? 'rgba(61,90,53,0.85)' : 'rgba(61,90,53,0.55)',
                animation: '_ci_lock_float 3s ease-in-out infinite, _ci_lock_pulse 3s ease-in-out infinite',
              }}
            />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <p
              className="font-semibold tracking-[0.1em] uppercase transition-all duration-400"
              style={{
                fontSize: hovered ? '11px' : '10px',
                color: hovered ? 'rgba(61,90,53,0.9)' : 'rgba(61,90,53,0.65)',
              }}
            >
              Coming Soon
            </p>
            <div
              className="h-px bg-[#3D5A35]/20 transition-all duration-500"
              style={{ width: hovered ? '52px' : '28px' }}
            />
            <p
              className="text-[9.5px] leading-relaxed transition-all duration-400"
              style={{
                color: 'rgba(92,64,51,0.5)',
                opacity: hovered ? 1 : 0.6,
                transform: hovered ? 'translateY(0)' : 'translateY(2px)',
              }}
            >
              We&apos;re building something here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isPreview) {
    return (
      <div className="glass-card p-6 flex flex-col">
        <HeaderRow />
        <p className="text-[11.5px] leading-relaxed text-[#5C4033]/55 mt-2">
          Sign in to see what your numbers say about your prep.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 flex flex-col relative overflow-hidden group">
      <style>{`
        @keyframes _ci_wave { 0%{transform:scaleY(0.4)} 100%{transform:scaleY(1)} }
        @keyframes _ci_fadein { from { opacity:0; transform:translateY(4px);} to {opacity:1; transform:translateY(0);} }
      `}</style>

      <div className="flex items-center justify-between mb-2">
        <HeaderRow />
        {!loading && output && (
          <button
            onClick={() => void runAnalysis()}
            disabled={loading}
            aria-label="Refresh coaching insight"
            title={staleSig ? 'Filters changed since this read' : 'Run another pass'}
            className="flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] font-semibold text-[#3D5A35]/55 hover:text-[#3D5A35]/85 transition-colors"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${staleSig ? 'animate-spin-slow' : ''}`} />
            {staleSig ? 'Refresh' : 'Rerun'}
          </button>
        )}
      </div>

      {/* Zero rated cases overall */}
      {ratedCount === 0 && !loading && (
        <p className="text-[11.5px] leading-relaxed text-[#5C4033]/55 mt-1">
          Your coach unlocks once you complete your first rated case.
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-3 py-2" style={{ animation: '_ci_fadein 0.3s ease forwards' }}>
          <div className="flex items-end gap-[3px] h-5">
            {[0.5, 0.75, 1, 0.85, 0.65, 0.8, 0.55].map((h, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full bg-[#3D5A35]"
                style={{ height: `${h * 18}px`, animation: `_ci_wave 1.1s ease-in-out ${i * 90}ms infinite alternate` }}
              />
            ))}
          </div>
          <p className="text-[11px] font-medium text-[#5C4033]/40 tracking-wide">{VERBS[verbIdx % VERBS.length]}…</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ animation: '_ci_fadein 0.4s ease forwards' }}>
          <p className="text-xs text-[#5C4033]/50 leading-relaxed mt-2 italic">{error}</p>
          <button
            onClick={() => void runAnalysis()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#3D5A35]/16 bg-[#fff8f0]/85 px-3 py-1.5 text-[9.5px] uppercase tracking-[0.12em] font-semibold text-[#3D5A35] hover:border-[#3D5A35]/30 transition-all"
          >
            Try again
          </button>
        </div>
      )}

      {/* Message-only state (filter mismatch / nothing to flag) */}
      {!loading && !error && message && !output && (
        <p
          className="text-[11.5px] italic leading-relaxed mt-2"
          style={{ color: 'rgba(92,64,51,.55)', animation: '_ci_fadein 0.4s ease forwards' }}
        >
          {message}
        </p>
      )}

      {/* Loaded content — headline / insight / action */}
      {!loading && !error && output && (
        <div style={{ animation: '_ci_fadein 0.4s ease forwards' }}>
          <h3 className="font-serif text-[15px] leading-snug text-[#3B2F2F]/90 mb-2">{output.headline}</h3>

          <div className="h-px mb-2.5 bg-gradient-to-r from-[#5C4033]/18 via-[#5C4033]/8 to-transparent" />

          <p className="text-xs text-[#5C4033]/70 leading-relaxed">{output.insight}</p>

          <div className="mt-3 border-t border-[#3D5A35]/8 pt-2.5 px-0">
            <p className="text-[11px] text-[#5C4033]/60 leading-relaxed italic">{output.action}</p>
          </div>

          {message && (
            <p className="text-[10px] text-[#5C4033]/45 mt-2.5 leading-relaxed">{message}</p>
          )}
        </div>
      )}
    </div>
  );
};

function HeaderRow() {
  return (
    <div className="eyebrow !mb-0 flex items-center">
      <Sparkles className="w-3 h-3 mr-2 text-[#3D5A35]" />
      THE COACH
    </div>
  );
}

function activeFiltersLabel(m: CoachMetrics): string {
  const f = m.activeFilters;
  const parts: string[] = [];
  parts.push(f.types.length > 0 ? `Type: ${f.types.join(', ')}` : 'Type: All');
  parts.push(f.levels.length > 0 ? `Level: ${f.levels.join(', ')}` : 'Level: All');
  if (f.time === 'all') parts.push('Time: All');
  else if (f.time === 'last7') parts.push('Time: Last 7 days');
  else if (f.time === 'last30') parts.push('Time: Last 30 days');
  else if (f.time === 'custom' && f.customStart && f.customEnd) parts.push(`Time: Custom (${f.customStart} to ${f.customEnd})`);
  return parts.join(' | ');
}

export default CoachInsight;
'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { precompute, type CoachFilters } from '@/lib/coachPrecompute';
import { buildSystemPrompt, buildUserMessage, callGemini, type SessionOutput } from '@/lib/geminiCoach';

const VERBS = ['Noodling', 'Casing', 'Analyzing', 'Connecting dots', 'Sizing up', 'Almost there'];

interface CoachInsightProps {
  filters: CoachFilters;
}

const CoachInsight = ({ filters }: CoachInsightProps) => {
  const apiKeyMissing = !(import.meta as any).env.VITE_VERTEX_COACH_API_KEY;

  const [loading, setLoading]         = useState(false);
  const [headline, setHeadline]       = useState('');
  const [insight, setInsight]         = useState('');
  const [action, setAction]           = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [verbIdx, setVerbIdx]         = useState(0);
  const [verbVisible, setVerbVisible] = useState(true);
  const [hasRequested, setHasRequested] = useState(false);
  const [lastAnalysedSignature, setLastAnalysedSignature] = useState<string | null>(null);

  const reqIdRef          = useRef(0);
  const sessionHistoryRef = useRef<SessionOutput[]>([]);
  const filtersSignature  = JSON.stringify([
    filters.types,
    filters.levels,
    filters.time,
    filters.customStart,
    filters.customEnd,
  ]);
  const hasContent = Boolean(headline || insight || action);
  const isStale = lastAnalysedSignature !== null && lastAnalysedSignature !== filtersSignature;
  const showCta = !loading && (!hasContent || isStale || Boolean(error));

  const ctaLabel = !hasContent
    ? 'Analyze current view'
    : isStale
      ? 'Refresh insight'
      : 'Re-analyze';

  const status = apiKeyMissing
    ? { dot: 'bg-[#C4A882]', label: 'API key not set' }
    : loading
      ? { dot: 'bg-[#C4A882] animate-pulse', label: 'Thinking' }
      : isStale
        ? { dot: 'bg-[#C4A882]', label: 'Needs refresh' }
        : hasContent
          ? { dot: 'bg-[#3D5A35]', label: 'Fresh' }
          : { dot: 'bg-[#3D5A35]', label: 'Ready' };

  // ── Verb animation — only while loading ──
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => {
      setVerbVisible(false);
      setTimeout(() => {
        setVerbIdx(i => (i + 1) % VERBS.length);
        setVerbVisible(true);
      }, 180);
    }, 800);
    return () => clearInterval(t);
    }, [loading]);

  const handleAnalyze = async () => {
    if (loading || apiKeyMissing) return;

    setHasRequested(true);
    setLoading(true);
    setError(null);

    const reqId = ++reqIdRef.current;

    try {
      const metrics = precompute(filters);
      const result = await callGemini(
        buildSystemPrompt(),
        buildUserMessage(metrics, sessionHistoryRef.current)
      );

      if (reqId !== reqIdRef.current) return;

      setHeadline(result.headline);
      setInsight(result.insight);
      setAction(result.action);
      setLastAnalysedSignature(filtersSignature);

      // Keep last 3 outputs for diversity rules (Steps 1j/1k/1l)
      sessionHistoryRef.current = [...sessionHistoryRef.current.slice(-2), result];
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load insight.');
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="glass-card p-6 flex flex-col relative overflow-hidden group">
      <style>{`
        @keyframes _wv { from { transform: scaleY(0.35); opacity: 0.25; } to { transform: scaleY(1); opacity: 0.65; } }
        @keyframes _ci { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Ambient glow ── */}
      <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-[#3D5A35]/4 blur-3xl pointer-events-none transition-all duration-1000 group-hover:bg-[#3D5A35]/6" />
      <div className="absolute -bottom-12 -left-8 w-40 h-40 rounded-full bg-[#D9D0C4]/6 blur-3xl pointer-events-none transition-all duration-1000 group-hover:bg-[#D9D0C4]/10" />

      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="eyebrow !mb-0 flex items-center">
          <Sparkles className="w-3 h-3 mr-2 text-[#3D5A35]" />
          AI COACH
          <span className="ml-2 text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight">PREVIEW</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-md border border-[#5C4033]/10 bg-[#D9D0C4]/18">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
            <span className="text-[8px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/55">
              {status.label}
            </span>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading || apiKeyMissing}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-[#3D5A35]/14 bg-[#fff8f0]/85 px-3 py-1.5 text-[9.5px] uppercase tracking-[0.12em] font-semibold text-[#3D5A35] hover:border-[#3D5A35]/28 hover:bg-[#3D5A35]/6 transition-all disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <span>{ctaLabel}</span>
            <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-end gap-[3px] h-5">
            {[0.5, 0.75, 1, 0.85, 0.65, 0.8, 0.55].map((h, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full bg-[#3D5A35]"
                style={{
                  height: `${h * 18}px`,
                  animation: `_wv 1.1s ease-in-out ${i * 90}ms infinite alternate`,
                }}
              />
            ))}
          </div>
          <p
            className="text-[11px] font-medium text-[#5C4033]/40 tracking-wide"
            style={{ opacity: verbVisible ? 1 : 0, transition: 'opacity 180ms ease' }}
          >
            {VERBS[verbIdx]}…
          </p>
        </div>
      )}

      {/* ── Error state ── */}
      {!loading && error && (
        <div style={{ animation: '_ci 0.4s ease forwards' }}>
          <p className="text-xs text-[#5C4033]/50 leading-relaxed mt-2 italic">{error}</p>
        </div>
      )}

      {/* ── Loaded content ── */}
      {!loading && hasContent && (
        <div style={{ animation: '_ci 0.4s ease forwards' }}>

          {/* Headline — maps to Line 1 of AI output */}
          <h3 className="leading-snug mb-2">{headline}</h3>

          {/* Fading gradient divider */}
          <div className="h-px mb-2.5 bg-gradient-to-r from-[#5C4033]/18 via-[#5C4033]/8 to-transparent" />

          {/* Insight body — maps to Line 2 of AI output */}
          <p className="text-xs text-[#5C4033]/70 leading-relaxed">{insight}</p>

          {/* Action box — maps to Line 3 of AI output */}
          <div className="mt-3 border-t border-[#3D5A35]/8 pt-2.5 px-0">
            <p className="text-[11px] text-[#5C4033]/60 leading-relaxed italic">{action}</p>
          </div>

        </div>
      )}

      {/* ── Idle / refresh CTA ── */}
      {showCta && (
        <div
          className="mt-4 rounded-2xl border border-[#5C4033]/8 bg-[#D9D0C4]/12 px-4 py-4"
          style={{ animation: '_ci 0.4s ease forwards' }}
        >
          <p className="text-[8px] uppercase tracking-[0.12em] font-semibold text-[#3D5A35]/48 mb-2">
            {apiKeyMissing
              ? 'Configuration needed'
              : isStale
                ? 'Filters changed'
                : hasRequested
                  ? 'Run another pass'
                  : 'Manual analysis'}
          </p>
          <p className="text-[11.5px] leading-relaxed text-[#5C4033]/68">
            {apiKeyMissing
              ? 'Add VITE_VERTEX_COACH_API_KEY to your environment to enable Coach Insight on Vertex AI.'
              : isStale
                ? 'Your dashboard filters changed after the last run. Refresh the insight whenever you want a new read.'
                : 'Coach Insight now stays idle until you ask for it, so you can control when each model call happens.'}
          </p>
          {!apiKeyMissing && (
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="mt-3 group inline-flex items-center gap-2 rounded-xl bg-[#3D5A35] px-3.5 py-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-[#fff8f0] hover:bg-[#3D5A35]/88 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" />
              <span>{ctaLabel}</span>
            </button>
          )}
        </div>
      )}

    </div>
  );
};

export default CoachInsight;

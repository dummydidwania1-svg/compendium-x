'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { apiPost } from '@/lib/api/client';
import type { GoalState } from '@/lib/goalTracker/engine';
import type { InsightDimension } from '@/lib/goalTracker/insightShapes';

/**
 * Replaces the deleted fake "Strategy insight" block entirely. Never
 * auto-renders — only fires on click. Full locked visual spec (idle / hover /
 * loading / result / failure), all states reusing existing platform
 * animations rather than inventing new ones.
 *
 * Every insight now ships with a call-to-action pair matched to its
 * dimension, rather than a passive sentence: cadencePace/frontBackLoading/
 * slipTiming open the Adjust Goal panel (cadence/total/deadline); perType
 * Stalling deep-links straight into practicing the specific neglected case
 * type. The "no" option is a plain dismiss — this is a nudge, not a nag.
 */
const LOADING_VERBS = ['Noticing', 'Sensing', 'Reading the rhythm', 'Weighing it up', 'Almost there']

type ButtonState = 'idle' | 'loading' | 'result'

interface Insight {
  text: string
  shapeId: string
  dimension: InsightDimension
  targetType: string | null
}

type InsightReason = 'zero_candidates' | 'retry_exhausted' | 'unavailable'

interface InsightResponse {
  insight: Insight | null
  reason?: InsightReason
}

const CTA_COPY: Record<InsightDimension, { primary: string; secondary: string }> = {
  cadencePace: { primary: 'Adjust my goal', secondary: "No, I'll stay the course" },
  frontBackLoading: { primary: 'Adjust my goal', secondary: "No, I'll catch up as-is" },
  slipTiming: { primary: 'Adjust my goal', secondary: "No, I'll stay the course" },
  perTypeStalling: { primary: 'Practice this now', secondary: "No, I'll get to it" },
  practiceNow: { primary: 'Log a case today', secondary: 'Not right now' },
}

/** Friendly copy for the deterministic empty case — never a silent revert. */
const REASON_COPY: Partial<Record<InsightReason, string>> = {
  zero_candidates: 'Not enough rhythm to read yet. Log a couple more cases and try again.',
}

export default function AskTrackerButton({
  goalState: _goalState,
  onAdjust,
}: {
  goalState: GoalState
  /** Opens the goal's Adjust panel (cadence/total/deadline), for the three dimensions whose fix is a config change. */
  onAdjust: () => void
}) {
  const router = useRouter()
  const [state, setState] = useState<ButtonState>('idle')
  const [insight, setInsight] = useState<Insight | null>(null)
  const [emptyReason, setEmptyReason] = useState<string | null>(null)
  const [verbIdx, setVerbIdx] = useState(0)
  const [hovered, setHovered] = useState(false)
  const lastShapeIdRef = useRef<string | null>(null)
  const verbIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startVerbCycle = () => {
    verbIntervalRef.current = setInterval(() => {
      setVerbIdx((i) => (i + 1) % LOADING_VERBS.length)
    }, 900)
  }
  const stopVerbCycle = () => {
    if (verbIntervalRef.current) clearInterval(verbIntervalRef.current)
    verbIntervalRef.current = null
  }

  const handleClick = async () => {
    setState('loading')
    setVerbIdx(0)
    setEmptyReason(null)
    startVerbCycle()
    try {
      const localMidnight = new Date()
      localMidnight.setHours(0, 0, 0, 0)
      const res = await apiPost<InsightResponse>('/api/goal-insight', {
        lastShownShapeId: lastShapeIdRef.current,
        localMidnightMs: localMidnight.getTime(),
      })
      stopVerbCycle()
      if (res.insight) {
        lastShapeIdRef.current = res.insight.shapeId
        setInsight(res.insight)
        setState('result')
      } else if (res.reason && REASON_COPY[res.reason]) {
        // Deterministic empty state (e.g. brand-new user): say so honestly in
        // place of the result card. Transient failures stay silent-revert.
        setEmptyReason(REASON_COPY[res.reason] ?? null)
        setState('idle')
      } else {
        setState('idle')
      }
    } catch {
      stopVerbCycle()
      setState('idle') // network/API error — silent revert, no error text shown
    }
  }

  const dismiss = () => {
    setInsight(null)
    setEmptyReason(null)
    setState('idle')
  }

  const handlePrimary = () => {
    if (!insight) return
    if (insight.dimension === 'perTypeStalling' || insight.dimension === 'practiceNow') {
      const params = insight.targetType ? `?type=${encodeURIComponent(insight.targetType)}` : ''
      router.push(`/repository${params}`)
      dismiss()
      return
    }
    onAdjust()
    dismiss()
  }

  // Deterministic empty-state message (muted helper text, house register).
  if (state === 'idle' && emptyReason) {
    return (
      <div className="flex items-start gap-1.5 px-3 py-2 w-full" style={{ animation: '_ci 0.4s ease forwards' }}>
        <Sparkles className="w-3 h-3 shrink-0 mt-[2px]" style={{ color: '#5C4033', opacity: 0.35 }} />
        <p className="text-[10px] text-[#5C4033]/50 leading-snug">{emptyReason}</p>
      </div>
    )
  }

  if (state === 'result' && insight) {
    const cta = CTA_COPY[insight.dimension]
    return (
      <div className="flex flex-col gap-2.5 px-3 py-2 w-full" style={{ animation: '_ci 0.4s ease forwards' }}>
        <div className="flex items-start gap-1.5">
          <Sparkles className="w-3 h-3 shrink-0 mt-[1px]" style={{ color: '#3D5A35', opacity: 0.75 }} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[7.5px] uppercase tracking-[0.12em] font-semibold text-[#3D5A35]/55">
              Insight
            </span>
            <p className="text-[11px] text-[#3B2F2F]/78 leading-snug">{insight.text}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-[18px]">
          <button
            onClick={handlePrimary}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors"
            style={{ background: 'rgba(61,90,53,0.12)', color: '#3D5A35' }}
          >
            {cta.primary}
          </button>
          <button
            onClick={dismiss}
            className="text-[10px] font-medium text-[#5C4033]/45 hover:text-[#5C4033]/70 transition-colors"
          >
            {cta.secondary}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="inline-flex items-center gap-1.5 rounded-full"
      style={{
        background: hovered && state === 'idle' ? 'rgba(61,90,53,0.10)' : 'rgba(61,90,53,0.06)',
        border: `1px solid ${hovered && state === 'idle' ? 'rgba(61,90,53,0.22)' : 'rgba(61,90,53,0.14)'}`,
        padding: '6px 12px',
        transition: 'all 0.2s ease',
        cursor: state === 'loading' ? 'not-allowed' : 'pointer',
      }}
    >
      <Sparkles
        className="w-3 h-3 shrink-0"
        style={{
          color: '#3D5A35',
          opacity: state === 'loading' ? 0.85 : hovered ? 0.9 : 0.7,
          transform: hovered && state === 'idle' ? 'scale(1.08) rotate(8deg)' : 'none',
          animation: state === 'loading' ? '_atb_pulse 1.4s ease-in-out infinite' : 'none',
          transition: 'transform 0.2s ease, opacity 0.2s ease',
        }}
      />
      <span
        className="text-[10px] font-semibold"
        style={{ color: '#3D5A35', opacity: hovered || state === 'loading' ? 1 : 0.7, transition: 'opacity 0.2s ease' }}
      >
        {state === 'loading' ? `${LOADING_VERBS[verbIdx]}...` : 'Ask Tracker'}
      </span>
      <style>{`
        @keyframes _atb_pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      `}</style>
    </button>
  )
}

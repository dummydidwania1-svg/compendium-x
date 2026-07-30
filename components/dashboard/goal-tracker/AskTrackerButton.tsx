'use client';

import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { apiPost } from '@/lib/api/client';
import type { GoalState } from '@/lib/goalTracker/engine';

/**
 * Replaces the deleted fake "Strategy insight" block entirely. Never
 * auto-renders — only fires on click. Full locked visual spec (idle / hover /
 * loading / result / failure), all states reusing existing platform
 * animations rather than inventing new ones.
 */
const LOADING_VERBS = ['Noticing', 'Sensing', 'Reading the rhythm', 'Weighing it up', 'Almost there']

type ButtonState = 'idle' | 'loading' | 'result'

interface InsightResponse {
  insight: { text: string; shapeId: string } | null
}

export default function AskTrackerButton({ goalState: _goalState }: { goalState: GoalState }) {
  const [state, setState] = useState<ButtonState>('idle')
  const [insightText, setInsightText] = useState<string | null>(null)
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
        setInsightText(res.insight.text)
        setState('result')
      } else {
        setState('idle') // zero-candidates or server-side retry-exhausted — silent revert
      }
    } catch {
      stopVerbCycle()
      setState('idle') // network/API error — also silent revert, no error text shown
    }
  }

  if (state === 'result' && insightText) {
    return (
      <div
        className="flex items-start gap-1.5 px-3 py-2"
        style={{ animation: '_ci 0.4s ease forwards' }}
      >
        <Sparkles className="w-3 h-3 shrink-0 mt-[1px]" style={{ color: '#3D5A35', opacity: 0.75 }} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[7.5px] uppercase tracking-[0.12em] font-semibold text-[#3D5A35]/55">
            Insight
          </span>
          <p className="text-[11px] text-[#3B2F2F]/78 leading-snug">{insightText}</p>
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

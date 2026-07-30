import { Flame } from 'lucide-react'
import type { PeriodHitResult } from '@/lib/goalTracker/engine'

/**
 * Visual Option C (§6) — streak-forward: flame icon + streak number + week
 * dots. Shared by Flow 4 (pure habit) and Flow 5's rhythm side. Solid-filled
 * flame per the locked icon-set note ("i-flame ... fixed to a proper
 * solid-filled flame silhouette, not a stroked outline") — lucide's `Flame`
 * is used with `fill="currentColor"` to get the solid silhouette rather than
 * the default stroke-only rendering.
 */
export default function StreakDots({
  currentStreak,
  bestStreak,
  recentPeriods,
}: {
  currentStreak: number
  bestStreak: number
  recentPeriods: PeriodHitResult[]
}) {
  const dots = recentPeriods.slice(-8)

  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div className="flex items-end gap-2">
        <Flame
          className="w-7 h-7"
          fill={currentStreak > 0 ? '#3D5A35' : '#5C4033'}
          style={{ color: currentStreak > 0 ? '#3D5A35' : 'rgba(92,64,51,0.25)', opacity: currentStreak > 0 ? 0.85 : 0.3 }}
        />
        <span className="text-3xl font-serif leading-none" style={{ color: '#3B2F2F' }}>
          {currentStreak}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/45">
        {currentStreak === 1 ? 'week streak' : 'week streak'}
      </span>
      {dots.length > 0 && (
        <div className="flex items-center gap-1 mt-1">
          {dots.map((p, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: p.hit ? '#3D5A35' : 'rgba(92,64,51,0.18)', opacity: p.hit ? 0.75 : 1 }}
            />
          ))}
        </div>
      )}
      {bestStreak > currentStreak && (
        <span className="text-[8px] text-[#5C4033]/35">Best: {bestStreak}</span>
      )}
    </div>
  )
}

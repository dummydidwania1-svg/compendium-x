import type { ScoreKey } from '@/lib/dashboard/types'

type SkillBalanceCardProps = {
  averages: Record<ScoreKey, number | null>
  momentum: Record<ScoreKey, number | null>
}

const SKILL_META: { key: ScoreKey; label: string; color: string }[] = [
  { key: 'structure', label: 'Structure', color: 'bg-blue-700' },
  { key: 'understanding', label: 'Understanding', color: 'bg-teal-700' },
  { key: 'delivery', label: 'Delivery', color: 'bg-amber-600' },
  { key: 'creativity', label: 'Creativity', color: 'bg-fuchsia-700' },
]

function momentumLabel(value: number | null): string {
  if (typeof value !== 'number') return 'No trend yet'
  const absolute = Math.abs(value).toFixed(2)
  if (value > 0) return `+${absolute} improving`
  if (value < 0) return `-${absolute} declining`
  return '0.00 stable'
}

function momentumTone(value: number | null): string {
  if (typeof value !== 'number') return 'text-stone-500'
  if (value > 0) return 'text-emerald-700'
  if (value < 0) return 'text-rose-700'
  return 'text-stone-500'
}

export function SkillBalanceCard({ averages, momentum }: SkillBalanceCardProps) {
  return (
    <section className="rounded-2xl border border-stone-300 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Skill Trends</p>
        <h2 className="text-xl font-serif text-stone-900 mt-2">Parameter Momentum</h2>
        <p className="mt-2 text-sm text-stone-500">Based on your latest attempts versus the prior set.</p>
      </div>

      <div className="space-y-5">
        {SKILL_META.map((item) => {
          const value = averages[item.key]
          const width = typeof value === 'number' ? `${Math.min(100, (value / 5) * 100)}%` : '0%'
          return (
            <div key={item.key}>
              <div className="flex items-center justify-between text-sm mb-2">
                <p className="text-stone-700 font-medium">{item.label}</p>
                <p className="text-stone-500">{typeof value === 'number' ? `${value.toFixed(2)} / 5` : 'N/A'}</p>
              </div>
              <div className="h-2.5 rounded-full bg-stone-200 overflow-hidden">
                <div className={`${item.color} h-full rounded-full`} style={{ width }} />
              </div>
              <p className={`mt-1 text-xs ${momentumTone(momentum[item.key])}`}>{momentumLabel(momentum[item.key])}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

import type { DashboardKpis } from '@/lib/dashboard/types'

type KpiCardsProps = {
  kpis: DashboardKpis
  streakDays: number
  lastAttempt: string
}

function prettySkillName(value: DashboardKpis['strongestSkill']) {
  if (!value) return 'N/A'
  if (value === 'structure') return 'Structure'
  if (value === 'understanding') return 'Understanding'
  if (value === 'delivery') return 'Delivery'
  return 'Creativity'
}

export function KpiCards({ kpis, streakDays, lastAttempt }: KpiCardsProps) {
  const averageLabel = typeof kpis.averageScore === 'number' ? `${kpis.averageScore.toFixed(2)} / 5` : 'N/A'

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <article className="rounded-2xl border border-stone-300 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Cases Completed</p>
        <p className="mt-3 text-3xl font-semibold text-stone-900">{kpis.totalCases}</p>
      </article>

      <article className="rounded-2xl border border-stone-300 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Average Score</p>
        <p className="mt-3 text-3xl font-semibold text-stone-900">{averageLabel}</p>
      </article>

      <article className="rounded-2xl border border-stone-300 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Strongest Dimension</p>
        <p className="mt-3 text-xl font-semibold text-emerald-700">{prettySkillName(kpis.strongestSkill)}</p>
      </article>

      <article className="rounded-2xl border border-stone-300 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Focus Area</p>
        <p className="mt-3 text-xl font-semibold text-amber-700">{prettySkillName(kpis.weakestSkill)}</p>
      </article>

      <article className="rounded-2xl border border-stone-300 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Practice Streak</p>
        <p className="mt-3 text-3xl font-semibold text-stone-900">{streakDays}</p>
        <p className="mt-1 text-xs text-stone-500">consecutive practice days</p>
      </article>

      <article className="rounded-2xl border border-stone-300 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Last Attempt</p>
        <p className="mt-3 text-sm font-semibold text-stone-900">{lastAttempt}</p>
      </article>
    </section>
  )
}

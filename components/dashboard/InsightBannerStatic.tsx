import type { DashboardKpis } from '@/lib/dashboard/types'

type InsightBannerStaticProps = {
  kpis: DashboardKpis
  filteredCount: number
}

function skillLabel(value: DashboardKpis['strongestSkill']) {
  if (!value) return 'N/A'
  if (value === 'structure') return 'Structure'
  if (value === 'understanding') return 'Understanding'
  if (value === 'delivery') return 'Delivery'
  return 'Creativity'
}

export function InsightBannerStatic({ kpis, filteredCount }: InsightBannerStaticProps) {
  const primary = skillLabel(kpis.strongestSkill)
  const focus = skillLabel(kpis.weakestSkill)

  return (
    <section className="rounded-2xl border border-stone-300 bg-[linear-gradient(120deg,#1f2937_0%,#111827_60%,#0f172a_100%)] text-stone-100 p-6 shadow-md relative overflow-hidden">
      <div className="absolute -top-16 -right-16 h-52 w-52 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="absolute -bottom-24 -left-20 h-52 w-52 rounded-full bg-teal-400/10 blur-3xl" />

      <div className="relative z-10 space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-300">Coach&apos;s Insight (Rule-Based)</p>
        <h2 className="text-2xl font-serif">Your strongest dimension is {primary}.</h2>
        <p className="max-w-3xl text-sm text-stone-300 leading-relaxed">
          Across {filteredCount} filtered cases, your current focus area is {focus}. Keep the next 3 practice sessions
          concentrated on this one dimension and track whether your baseline score stabilizes above 4.0.
        </p>
      </div>
    </section>
  )
}

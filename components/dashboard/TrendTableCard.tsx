import type { EvaluationRecord } from '@/lib/dashboard/types'

type TrendTableCardProps = {
  rows: EvaluationRecord[]
}

function formatDate(record: EvaluationRecord) {
  if (!record.createdAt) return 'Unknown'
  return record.createdAt.toDate().toLocaleDateString()
}

function asLabel(value: number | null) {
  return typeof value === 'number' ? value : '-'
}

function average(values: Array<number | null>): number | null {
  const clean = values.filter((value): value is number => typeof value === 'number')
  if (clean.length === 0) return null
  return clean.reduce((sum, value) => sum + value, 0) / clean.length
}

function overallScore(row: EvaluationRecord): number | null {
  return average([row.scores.structure, row.scores.understanding, row.scores.delivery, row.scores.creativity])
}

function sparklinePath(values: number[]): string {
  if (values.length === 0) return ''
  const width = 320
  const height = 64
  const stepX = values.length > 1 ? width / (values.length - 1) : 0
  return values
    .map((value, index) => {
      const x = index * stepX
      const y = height - (value / 5) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export function TrendTableCard({ rows }: TrendTableCardProps) {
  const summary = {
    structure: average(rows.map((row) => row.scores.structure)),
    understanding: average(rows.map((row) => row.scores.understanding)),
    delivery: average(rows.map((row) => row.scores.delivery)),
    creativity: average(rows.map((row) => row.scores.creativity)),
  }
  const overallSeries = rows.map((row) => overallScore(row)).filter((value): value is number => typeof value === 'number')
  const path = sparklinePath(overallSeries)
  const trendDirection =
    overallSeries.length >= 2 ? overallSeries[overallSeries.length - 1] - overallSeries[0] : 0
  const trendLabel =
    overallSeries.length < 2 ? 'Insufficient points' : trendDirection > 0 ? 'Upward trend' : trendDirection < 0 ? 'Downward trend' : 'Stable trend'
  const trendTone = trendDirection > 0 ? 'text-emerald-700' : trendDirection < 0 ? 'text-rose-700' : 'text-stone-600'

  return (
    <section className="rounded-2xl border border-stone-300 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Score Trends</p>
        <h2 className="text-xl font-serif text-stone-900 mt-2">Recent Performance Timeline</h2>
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-stone-500">Overall Score Trajectory</p>
            <p className={`text-xs font-medium ${trendTone}`}>{trendLabel}</p>
          </div>
          <div className="mt-2 h-16 w-full">
            {path ? (
              <svg viewBox="0 0 320 64" className="h-16 w-full">
                <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-stone-900" />
              </svg>
            ) : (
              <p className="text-xs text-stone-500">Not enough attempts to render trend.</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs text-stone-700">
            Structure: {typeof summary.structure === 'number' ? summary.structure.toFixed(2) : 'N/A'}
          </span>
          <span className="rounded border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs text-stone-700">
            Understanding: {typeof summary.understanding === 'number' ? summary.understanding.toFixed(2) : 'N/A'}
          </span>
          <span className="rounded border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs text-stone-700">
            Delivery: {typeof summary.delivery === 'number' ? summary.delivery.toFixed(2) : 'N/A'}
          </span>
          <span className="rounded border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs text-stone-700">
            Creativity: {typeof summary.creativity === 'number' ? summary.creativity.toFixed(2) : 'N/A'}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">No attempts in this filter window yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 uppercase text-xs tracking-[0.12em]">
                <th className="py-2 text-left font-medium">Date</th>
                <th className="py-2 text-left font-medium">Case</th>
                <th className="py-2 text-center font-medium">S</th>
                <th className="py-2 text-center font-medium">U</th>
                <th className="py-2 text-center font-medium">D</th>
                <th className="py-2 text-center font-medium">C</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-stone-100 text-stone-700">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDate(row)}</td>
                  <td className="py-2 pr-3">{row.caseTitle}</td>
                  <td className="py-2 text-center">{asLabel(row.scores.structure)}</td>
                  <td className="py-2 text-center">{asLabel(row.scores.understanding)}</td>
                  <td className="py-2 text-center">{asLabel(row.scores.delivery)}</td>
                  <td className="py-2 text-center">{asLabel(row.scores.creativity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

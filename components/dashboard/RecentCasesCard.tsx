'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FullHistoryModal } from './FullHistoryModal'
import type { EvaluationRecord } from '@/lib/dashboard/types'

type RecentCasesCardProps = {
  rows: EvaluationRecord[]
}

function formatDate(record: EvaluationRecord) {
  if (!record.createdAt) return 'Unknown'
  return record.createdAt.toDate().toLocaleString()
}

function overallScore(record: EvaluationRecord): string {
  const values = [
    record.scores.structure,
    record.scores.understanding,
    record.scores.delivery,
    record.scores.creativity,
  ].filter((value): value is number => typeof value === 'number')

  if (values.length === 0) return 'N/A'
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return `${mean.toFixed(2)} / 5`
}

export function RecentCasesCard({ rows }: RecentCasesCardProps) {
  const router = useRouter()
  const [historyOpen, setHistoryOpen] = useState(false)
  const previewRows = useMemo(() => rows.slice(0, 5), [rows])
  const scoreCells: { key: keyof EvaluationRecord['scores']; label: string }[] = [
    { key: 'structure', label: 'S' },
    { key: 'understanding', label: 'U' },
    { key: 'delivery', label: 'D' },
    { key: 'creativity', label: 'C' },
  ]

  const openReview = (row: EvaluationRecord) => {
    router.push(`/dashboard/evaluations/${row.id}`)
  }

  return (
    <>
      <section className="rounded-2xl border border-stone-300 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Recent Feedback</p>
            <h2 className="text-xl font-serif text-stone-900 mt-2">Latest Session Reviews</h2>
          </div>
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 transition"
          >
            View Full History
          </button>
        </div>

        {previewRows.length === 0 ? (
          <p className="text-sm text-stone-500">No completed cases yet. Start one from Practice mode.</p>
        ) : (
          <div className="space-y-3">
            {previewRows.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-stone-200 bg-stone-50 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-stone-900">{row.caseTitle}</h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.08em] text-stone-500">
                      {row.caseType ?? 'General'} • {row.industry ?? 'General'} • {formatDate(row)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                      Overall {overallScore(row)}
                    </span>
                    <button
                      onClick={() => openReview(row)}
                      className="rounded-md border border-cyan-700/40 bg-cyan-700/5 px-3 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-700/10 transition"
                    >
                      Review
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {scoreCells.map((cell) => {
                    const value = row.scores[cell.key]
                    return (
                      <span
                        key={cell.key}
                        className="rounded border border-stone-300 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700"
                      >
                        {cell.label}: {typeof value === 'number' ? `${value}/5` : 'N/A'}
                      </span>
                    )
                  })}
                </div>

                <p className="mt-3 text-sm text-stone-700">{row.notes}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <FullHistoryModal
        open={historyOpen}
        rows={rows}
        onClose={() => setHistoryOpen(false)}
        onReview={(row) => {
          setHistoryOpen(false)
          openReview(row)
        }}
      />
    </>
  )
}

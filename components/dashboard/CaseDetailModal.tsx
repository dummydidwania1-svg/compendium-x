'use client'

import { useEffect } from 'react'
import type { EvaluationRecord } from '@/lib/dashboard/types'

type CaseDetailModalProps = {
  record: EvaluationRecord | null
  onClose: () => void
}

function scoreLabel(value: number | null) {
  return typeof value === 'number' ? `${value} / 5` : 'N/A'
}

function formatDate(value: EvaluationRecord['createdAt']) {
  if (!value) return 'Unknown date'
  return value.toDate().toLocaleString()
}

export function CaseDetailModal({ record, onClose }: CaseDetailModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!record) return null

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-sm p-4 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-2xl border border-stone-300 bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Case Review</p>
            <h3 className="text-2xl font-serif text-stone-900">{record.caseTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 transition"
          >
            Close
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-stone-500">Date</p>
              <p className="mt-2 font-medium text-stone-900">{formatDate(record.createdAt)}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-stone-500">Type / Industry</p>
              <p className="mt-2 font-medium text-stone-900">
                {record.caseType ?? 'General'} / {record.industry ?? 'General'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-stone-500 mb-3">Parameter Scores</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="text-sm text-stone-700">Structure: <span className="font-semibold text-stone-900">{scoreLabel(record.scores.structure)}</span></p>
              <p className="text-sm text-stone-700">Understanding: <span className="font-semibold text-stone-900">{scoreLabel(record.scores.understanding)}</span></p>
              <p className="text-sm text-stone-700">Delivery: <span className="font-semibold text-stone-900">{scoreLabel(record.scores.delivery)}</span></p>
              <p className="text-sm text-stone-700">Creativity: <span className="font-semibold text-stone-900">{scoreLabel(record.scores.creativity)}</span></p>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-stone-500 mb-3">Interviewer Notes</p>
            <p className="text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">{record.notes}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

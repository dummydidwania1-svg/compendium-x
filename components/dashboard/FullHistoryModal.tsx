'use client'

import { useEffect } from 'react'
import type { EvaluationRecord } from '@/lib/dashboard/types'

type FullHistoryModalProps = {
  open: boolean
  rows: EvaluationRecord[]
  onClose: () => void
  onReview: (row: EvaluationRecord) => void
}

function formatDate(value: EvaluationRecord['createdAt']) {
  if (!value) return 'Unknown'
  return value.toDate().toLocaleDateString()
}

export function FullHistoryModal({ open, rows, onClose, onReview }: FullHistoryModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    if (open) {
      window.addEventListener('keydown', onKeyDown)
    }
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-sm p-4 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-5xl rounded-2xl border border-stone-300 bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Case History</p>
            <h3 className="text-2xl font-serif text-stone-900">All Evaluations</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-cyan-700/40 bg-cyan-700/5 px-3 py-1.5 text-sm font-medium text-cyan-900 hover:bg-cyan-700/10 transition"
          >
            Close
          </button>
        </div>

        <div className="p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 uppercase text-xs tracking-[0.12em]">
                <th className="py-2 text-left font-medium">Case</th>
                <th className="py-2 text-left font-medium">Date</th>
                <th className="py-2 text-left font-medium">Type</th>
                <th className="py-2 text-left font-medium">Industry</th>
                <th className="py-2 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-stone-100 text-stone-700">
                  <td className="py-3 pr-3 font-medium">{row.caseTitle}</td>
                  <td className="py-3 pr-3">{formatDate(row.createdAt)}</td>
                  <td className="py-3 pr-3">{row.caseType ?? 'General'}</td>
                  <td className="py-3 pr-3">{row.industry ?? 'General'}</td>
                  <td className="py-3">
                    <button
                      onClick={() => onReview(row)}
                      className="rounded-md border border-cyan-700/40 bg-cyan-700/5 px-3 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-700/10 transition"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

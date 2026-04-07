'use client'

import { useEffect, useState } from 'react'

type GoalTrackerCardProps = {
  totalCompleted: number
  targetCount: number
  onTargetSave: (nextTarget: number) => Promise<void>
  saving: boolean
}

export function GoalTrackerCard({
  totalCompleted,
  targetCount,
  onTargetSave,
  saving,
}: GoalTrackerCardProps) {
  const [editing, setEditing] = useState(false)
  const [draftTarget, setDraftTarget] = useState(String(targetCount))
  const [error, setError] = useState('')

  useEffect(() => {
    setDraftTarget(String(targetCount))
  }, [targetCount])

  const safeTarget = targetCount > 0 ? targetCount : 1
  const progress = Math.min(100, (totalCompleted / safeTarget) * 100)

  const handleSave = async () => {
    const parsed = Number.parseInt(draftTarget, 10)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
      setError('Target must be between 1 and 500.')
      return
    }

    setError('')
    await onTargetSave(parsed)
    setEditing(false)
  }

  return (
    <section className="rounded-2xl border border-stone-300 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Goal Tracker</p>
        <h2 className="text-xl font-serif text-stone-900 mt-2">Quality Reps</h2>
      </div>

      {editing ? (
        <div className="mb-3">
          <label className="block text-xs uppercase tracking-[0.12em] text-stone-500 mb-2">Set Target Cases</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={500}
              value={draftTarget}
              onChange={(event) => setDraftTarget(event.target.value)}
              className="w-24 rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-500"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-stone-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-stone-800 transition disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setDraftTarget(String(targetCount))
                setError('')
              }}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 transition"
            >
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <p className="text-sm text-stone-600">
          Target: <span className="font-semibold text-stone-900">{safeTarget}</span> completed cases
        </p>
      )}

      <p className="text-sm text-stone-600 mt-1">
        Current: <span className="font-semibold text-stone-900">{totalCompleted}</span>
      </p>

      <div className="mt-5">
        <div className="h-3 rounded-full bg-stone-200 overflow-hidden">
          <div className="h-full rounded-full bg-stone-900" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-stone-500">{progress.toFixed(1)}% complete</p>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-stone-500 mb-2">Next Milestone</p>
        <p className="text-sm text-stone-700">
          Reach {Math.min(safeTarget, totalCompleted + 5)} cases and review your trend before AI analysis is enabled.
        </p>
      </div>

      {!editing && (
        <button
          onClick={() => setEditing(true)}
          className="mt-4 rounded-md border border-cyan-700/40 bg-cyan-700/5 px-3 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-700/10 transition"
        >
          Edit Target
        </button>
      )}
    </section>
  )
}

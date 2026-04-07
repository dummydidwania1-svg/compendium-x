'use client'

import type { DashboardFilters } from '@/lib/dashboard/types'

type DashboardFilterBarProps = {
  filters: DashboardFilters
  caseTitleOptions: string[]
  caseTypeOptions: string[]
  industryOptions: string[]
  onFiltersChange: (next: DashboardFilters) => void
  onReset: () => void
}

export function DashboardFilterBar({
  filters,
  caseTitleOptions,
  caseTypeOptions,
  industryOptions,
  onFiltersChange,
  onReset,
}: DashboardFilterBarProps) {
  const activeFilters =
    (filters.caseTitle !== 'All' ? 1 : 0) +
    (filters.caseType !== 'All' ? 1 : 0) +
    (filters.industry !== 'All' ? 1 : 0) +
    (filters.dateWindow !== 'All' ? 1 : 0)

  return (
    <section className="rounded-2xl border border-stone-300 bg-white/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
          Drill Down {activeFilters > 0 ? `(${activeFilters})` : ''}
        </p>

        <label className="text-sm text-stone-700">
          <span className="mr-2 text-stone-500">Case</span>
          <select
            value={filters.caseTitle}
            onChange={(e) => onFiltersChange({ ...filters, caseTitle: e.target.value })}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-500"
          >
            <option value="All">All Cases</option>
            {caseTitleOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-stone-700">
          <span className="mr-2 text-stone-500">Case Type</span>
          <select
            value={filters.caseType}
            onChange={(e) => onFiltersChange({ ...filters, caseType: e.target.value })}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-500"
          >
            <option value="All">All</option>
            {caseTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-stone-700">
          <span className="mr-2 text-stone-500">Industry</span>
          <select
            value={filters.industry}
            onChange={(e) => onFiltersChange({ ...filters, industry: e.target.value })}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-500"
          >
            <option value="All">All</option>
            {industryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-stone-700">
          <span className="mr-2 text-stone-500">Window</span>
          <select
            value={filters.dateWindow}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                dateWindow: e.target.value as DashboardFilters['dateWindow'],
              })
            }
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-500"
          >
            <option value="All">All Time</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="180d">Last 180 Days</option>
          </select>
        </label>

        <button
          onClick={onReset}
          disabled={activeFilters === 0}
          className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Reset Filters
        </button>
      </div>
    </section>
  )
}

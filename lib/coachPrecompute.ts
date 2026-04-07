import { filterDashboardEntries, type DashboardCaseEntry, type DashboardWidgetFilters } from '@/lib/dashboard/live'

export type CoachFilters = DashboardWidgetFilters

export interface ParamAvg {
  structure: number
  analysis: number
  creativity: number
  delivery: number
  caseScore: number
}

export interface StreakInfo {
  length: number
  startDate: string
  endDate: string
}

export interface CoachMetrics {
  today: string
  allCases: DashboardCaseEntry[]
  filteredCases: DashboardCaseEntry[]
  filteredCount: number
  globalAvg: ParamAvg
  filteredAvg: ParamAvg | null
  currentStreak: StreakInfo
  streakBreaks: string[]
  streakOverlapsFilter: boolean
  outliers: DashboardCaseEntry[]
  activeFilters: CoachFilters
}

const mean = (arr: number[]): number =>
  arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0

function avgOf(cases: DashboardCaseEntry[]): ParamAvg {
  return {
    structure: mean(cases.map((c) => c.structure)),
    analysis: mean(cases.map((c) => c.analysis)),
    creativity: mean(cases.map((c) => c.creativity)),
    delivery: mean(cases.map((c) => c.delivery)),
    caseScore: mean(cases.map((c) => c.score)),
  }
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getFilterWindow(filters: CoachFilters, today: Date): { start: Date; end: Date } | null {
  if (filters.time === 'last7') {
    return { start: new Date(today.getTime() - 7 * 86400000), end: today }
  }
  if (filters.time === 'last30') {
    return { start: new Date(today.getTime() - 30 * 86400000), end: today }
  }
  if (filters.time === 'custom' && filters.customStart && filters.customEnd) {
    return {
      start: new Date(`${filters.customStart}T00:00:00`),
      end: new Date(`${filters.customEnd}T23:59:59`),
    }
  }
  return null
}

function computeStreak(cases: DashboardCaseEntry[], today: Date): StreakInfo {
  const caseDates = new Set(cases.map((c) => c.date))
  let streak = 0
  let startDate = ''
  const d = new Date(today)

  while (true) {
    const ds = toDateStr(d)
    if (caseDates.has(ds)) {
      streak += 1
      startDate = ds
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }

  return {
    length: streak,
    startDate: streak > 0 ? startDate : '',
    endDate: streak > 0 ? toDateStr(today) : '',
  }
}

function computeBreaks(cases: DashboardCaseEntry[]): string[] {
  const dates = [...new Set(cases.map((c) => c.date))].sort()
  const breaks: string[] = []

  for (let i = 0; i < dates.length - 1; i += 1) {
    const curr = new Date(`${dates[i]}T12:00:00`)
    const next = new Date(`${dates[i + 1]}T12:00:00`)
    const gap = Math.round((next.getTime() - curr.getTime()) / 86400000)
    for (let j = 1; j < gap; j += 1) {
      const b = new Date(curr)
      b.setDate(b.getDate() + j)
      breaks.push(toDateStr(b))
    }
  }

  return breaks
}

function checkStreakOverlap(streak: StreakInfo, filters: CoachFilters, today: Date): boolean {
  if (streak.length === 0) return false
  const window = getFilterWindow(filters, today)
  if (!window) return false
  const sStart = new Date(`${streak.startDate}T12:00:00`)
  const sEnd = new Date(`${streak.endDate}T12:00:00`)
  return sStart <= window.end && sEnd >= window.start
}

export function precompute(entries: DashboardCaseEntry[], filters: CoachFilters): CoachMetrics {
  const today = new Date()
  const todayStr = toDateStr(today)
  const allCases = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const filteredCases = filterDashboardEntries(allCases, filters)
  const globalAvg = avgOf(allCases)
  const filteredAvg = filteredCases.length > 0 ? avgOf(filteredCases) : null
  const streak = computeStreak(allCases, today)
  const breaks = computeBreaks(allCases)
  const overlaps = checkStreakOverlap(streak, filters, today)

  const outliers =
    filteredCases.length > 0 && filteredAvg
      ? filteredCases.filter(
          (c) =>
            c.structure <= filteredAvg.structure - 1.0 &&
            c.analysis <= filteredAvg.analysis - 1.0 &&
            c.creativity <= filteredAvg.creativity - 1.0 &&
            c.delivery <= filteredAvg.delivery - 1.0
        )
      : []

  return {
    today: todayStr,
    allCases,
    filteredCases,
    filteredCount: filteredCases.length,
    globalAvg,
    filteredAvg,
    currentStreak: streak,
    streakBreaks: breaks,
    streakOverlapsFilter: overlaps,
    outliers,
    activeFilters: filters,
  }
}

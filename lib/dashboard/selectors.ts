import type { Timestamp } from 'firebase/firestore'
import type { DashboardFilters, DashboardKpis, EvaluationRecord, ScoreKey } from './types'

const SCORE_KEYS: ScoreKey[] = ['structure', 'understanding', 'delivery', 'creativity']

function toMillis(timestamp?: Timestamp): number {
  return timestamp?.toMillis?.() ?? 0
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  const total = values.reduce((sum, value) => sum + value, 0)
  return total / values.length
}

function averageScore(record: EvaluationRecord): number | null {
  const values = SCORE_KEYS.map((key) => record.scores[key]).filter((value): value is number => typeof value === 'number')
  return average(values)
}

function withinDateWindow(record: EvaluationRecord, dateWindow: DashboardFilters['dateWindow']): boolean {
  if (dateWindow === 'All') return true
  const days = dateWindow === '7d' ? 7 : dateWindow === '30d' ? 30 : dateWindow === '90d' ? 90 : 180
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000
  return toMillis(record.createdAt) >= threshold
}

export function sortByNewest(records: EvaluationRecord[]): EvaluationRecord[] {
  return [...records].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
}

export function filterEvaluations(records: EvaluationRecord[], filters: DashboardFilters): EvaluationRecord[] {
  return records.filter((record) => {
    const caseTitleMatch = filters.caseTitle === 'All' || record.caseTitle === filters.caseTitle
    const caseTypeMatch = filters.caseType === 'All' || record.caseType === filters.caseType
    const industryMatch = filters.industry === 'All' || record.industry === filters.industry
    const dateMatch = withinDateWindow(record, filters.dateWindow)
    return caseTitleMatch && caseTypeMatch && industryMatch && dateMatch
  })
}

export function uniqueCaseTitles(records: EvaluationRecord[]): string[] {
  const values = Array.from(new Set(records.map((record) => record.caseTitle).filter((value) => value.trim().length > 0)))
  return values.sort((a, b) => a.localeCompare(b))
}

export function uniqueCaseTypes(records: EvaluationRecord[]): string[] {
  const values = Array.from(new Set(records.map((record) => record.caseType).filter((value): value is string => Boolean(value))))
  return values.sort((a, b) => a.localeCompare(b))
}

export function uniqueIndustries(records: EvaluationRecord[]): string[] {
  const values = Array.from(new Set(records.map((record) => record.industry).filter((value): value is string => Boolean(value))))
  return values.sort((a, b) => a.localeCompare(b))
}

export function computeSkillAverages(records: EvaluationRecord[]): Record<ScoreKey, number | null> {
  const valuesBySkill: Record<ScoreKey, number[]> = {
    structure: [],
    understanding: [],
    delivery: [],
    creativity: [],
  }

  for (const record of records) {
    for (const key of SCORE_KEYS) {
      const value = record.scores[key]
      if (typeof value === 'number') valuesBySkill[key].push(value)
    }
  }

  return {
    structure: average(valuesBySkill.structure),
    understanding: average(valuesBySkill.understanding),
    delivery: average(valuesBySkill.delivery),
    creativity: average(valuesBySkill.creativity),
  }
}

export function computeSkillMomentum(records: EvaluationRecord[], windowSize = 4): Record<ScoreKey, number | null> {
  const sorted = sortByNewest(records)
  const recent = sorted.slice(0, windowSize)
  const previous = sorted.slice(windowSize, windowSize * 2)
  const result: Record<ScoreKey, number | null> = {
    structure: null,
    understanding: null,
    delivery: null,
    creativity: null,
  }

  for (const key of SCORE_KEYS) {
    const recentValues = recent.map((row) => row.scores[key]).filter((value): value is number => typeof value === 'number')
    const prevValues = previous.map((row) => row.scores[key]).filter((value): value is number => typeof value === 'number')
    const recentAvg = average(recentValues)
    const prevAvg = average(prevValues)
    if (typeof recentAvg === 'number' && typeof prevAvg === 'number') {
      result[key] = recentAvg - prevAvg
    }
  }

  return result
}

export function computeKpis(records: EvaluationRecord[]): DashboardKpis {
  const skillAverages = computeSkillAverages(records)
  const recordAverages = records
    .map((record) => averageScore(record))
    .filter((value): value is number => typeof value === 'number')

  let strongestSkill: ScoreKey | null = null
  let weakestSkill: ScoreKey | null = null
  let strongestValue = Number.NEGATIVE_INFINITY
  let weakestValue = Number.POSITIVE_INFINITY

  for (const key of SCORE_KEYS) {
    const value = skillAverages[key]
    if (typeof value !== 'number') continue

    if (value > strongestValue) {
      strongestValue = value
      strongestSkill = key
    }
    if (value < weakestValue) {
      weakestValue = value
      weakestSkill = key
    }
  }

  return {
    totalCases: records.filter((r) => !r.isUnrated).length,
    averageScore: average(recordAverages),
    strongestSkill,
    weakestSkill,
  }
}

export function trendRows(records: EvaluationRecord[], limit = 12): EvaluationRecord[] {
  const newest = sortByNewest(records.filter((r) => !r.isUnrated)).slice(0, limit)
  return newest.reverse()
}

export function recentRows(records: EvaluationRecord[], limit = 8): EvaluationRecord[] {
  return sortByNewest(records.filter((r) => !r.isUnrated)).slice(0, limit)
}

function startOfDayMillis(timestamp?: Timestamp): number | null {
  if (!timestamp) return null
  const date = timestamp.toDate()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function practiceStreakDays(records: EvaluationRecord[]): number {
  const uniqueDays = Array.from(
    new Set(records.map((record) => startOfDayMillis(record.createdAt)).filter((value): value is number => value !== null))
  ).sort((a, b) => b - a)

  if (uniqueDays.length === 0) return 0

  let streak = 1
  for (let i = 1; i < uniqueDays.length; i += 1) {
    const diffDays = Math.round((uniqueDays[i - 1] - uniqueDays[i]) / (24 * 60 * 60 * 1000))
    if (diffDays === 1) {
      streak += 1
    } else {
      break
    }
  }

  return streak
}

export function lastAttemptLabel(records: EvaluationRecord[]): string {
  const newest = sortByNewest(records)[0]
  if (!newest?.createdAt) return 'No sessions yet'
  const date = newest.createdAt.toDate()
  return date.toLocaleString()
}

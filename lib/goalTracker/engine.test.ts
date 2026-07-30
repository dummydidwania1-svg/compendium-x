import { describe, it, expect } from 'vitest'
import {
  addCalendarMonths,
  classifyPaceBand,
  classifyPace,
  computeStreak,
  derivePeriods,
  parseDMY,
  resolveFlow,
} from './engine'

describe('resolveFlow', () => {
  it('flat + deadline -> Flow 1', () => {
    expect(resolveFlow({ goalKind: 'flat', hasEndDate: true, totalCases: 30 })).toBe(1)
  })
  it('flat + no deadline -> Flow 2', () => {
    expect(resolveFlow({ goalKind: 'flat', hasEndDate: false, totalCases: 50 })).toBe(2)
  })
  it('cadence + deadline -> Flow 3', () => {
    expect(resolveFlow({ goalKind: 'cadence', hasEndDate: true, totalCases: 12 })).toBe(3)
  })
  it('cadence + no deadline + no total -> Flow 4', () => {
    expect(resolveFlow({ goalKind: 'cadence', hasEndDate: false, totalCases: 0 })).toBe(4)
  })
  it('cadence + no deadline + with total -> Flow 5', () => {
    expect(resolveFlow({ goalKind: 'cadence', hasEndDate: false, totalCases: 40 })).toBe(5)
  })
})

describe('addCalendarMonths — real calendar months, not 30-day blocks', () => {
  it('Jan 15 + 1 month = Feb 15', () => {
    const result = addCalendarMonths(new Date(2026, 0, 15), 1)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(15)
  })
  it('Jan 31 + 1 month clamps to Feb 28 (non-leap year)', () => {
    const result = addCalendarMonths(new Date(2026, 0, 31), 1)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(28)
  })
  it('Jan 31 + 1 month clamps to Feb 29 (leap year 2028)', () => {
    const result = addCalendarMonths(new Date(2028, 0, 31), 1)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(29)
  })
  it('rolls year boundary correctly (Dec 15 + 1 month = Jan 15 next year)', () => {
    const result = addCalendarMonths(new Date(2026, 11, 15), 1)
    expect(result.getFullYear()).toBe(2027)
    expect(result.getMonth()).toBe(0)
    expect(result.getDate()).toBe(15)
  })
})

describe('classifyPaceBand — exact boundary values', () => {
  it('>= 1.15 is ahead', () => {
    expect(classifyPaceBand(1.15)).toBe('ahead')
    expect(classifyPaceBand(1.2)).toBe('ahead')
  })
  it('0.90 to <1.15 is onTrack', () => {
    expect(classifyPaceBand(0.9)).toBe('onTrack')
    expect(classifyPaceBand(1.14)).toBe('onTrack')
  })
  it('0.75 to <0.90 is slightlyBehind', () => {
    expect(classifyPaceBand(0.75)).toBe('slightlyBehind')
    expect(classifyPaceBand(0.89)).toBe('slightlyBehind')
  })
  it('0.50 to <0.75 is behind', () => {
    expect(classifyPaceBand(0.5)).toBe('behind')
    expect(classifyPaceBand(0.74)).toBe('behind')
  })
  it('<0.50 is atRisk', () => {
    expect(classifyPaceBand(0.49)).toBe('atRisk')
    expect(classifyPaceBand(0)).toBe('atRisk')
  })
})

describe('classifyPace — catch-up rounds up for display only', () => {
  it('rounds a fractional catch-up gap up (1.4 -> 2)', () => {
    // 30 cases over 30 days, 10 elapsed -> expect 10 done; only 6 done -> gap 4
    const start = new Date(2026, 0, 1)
    const end = new Date(2026, 0, 31)
    const today = new Date(2026, 0, 11) // 10 days elapsed
    const result = classifyPace(6, 30, start, end, today)
    expect(result.gap).toBeCloseTo(4, 5)
    expect(result.catchUpToday).toBe(4) // whole-number gap, no rounding needed here
  })
  it('rounds up a genuinely fractional gap', () => {
    const start = new Date(2026, 0, 1)
    const end = new Date(2026, 6, 1) // ~182 days, total 100 -> non-integer daily rate
    const today = new Date(2026, 0, 8) // 7 days elapsed
    const result = classifyPace(0, 100, start, end, today)
    expect(result.catchUpToday).toBe(Math.ceil(result.gap))
  })
})

describe('parseDMY', () => {
  it('parses a valid DD/MM/YYYY string', () => {
    const d = parseDMY('15/03/2026')
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(2)
    expect(d?.getDate()).toBe(15)
  })
  it('returns null for malformed input', () => {
    expect(parseDMY('')).toBeNull()
    expect(parseDMY('not a date')).toBeNull()
    expect(parseDMY('32/13/2026')).toBeNull()
  })
})

describe('derivePeriods — rolling weekly vs real-calendar monthly', () => {
  it('weekly periods are rolling 7-day blocks from startDate, not calendar weeks', () => {
    const start = new Date(2026, 0, 1) // a Thursday
    const through = new Date(2026, 0, 22)
    const periods = derivePeriods(start, 'weeks', 1, through)
    expect(periods[0].periodStart.getDate()).toBe(1)
    expect(periods[0].periodEnd.getDate()).toBe(8)
    expect(periods[1].periodStart.getDate()).toBe(8)
  })
  it('monthly periods cross a month boundary correctly via real calendar months', () => {
    const start = new Date(2026, 0, 15)
    const through = new Date(2026, 2, 20)
    const periods = derivePeriods(start, 'months', 1, through)
    expect(periods[0].periodEnd.getMonth()).toBe(1) // Feb
    expect(periods[0].periodEnd.getDate()).toBe(15)
    expect(periods[1].periodEnd.getMonth()).toBe(2) // Mar
    expect(periods[1].periodEnd.getDate()).toBe(15)
  })
})

describe('computeStreak — any miss resets to 0, no cadence-unit special-casing', () => {
  it('a single missed daily period resets the streak to 0', () => {
    const start = new Date(2026, 0, 1)
    const today = new Date(2026, 0, 5)
    // Hit day 1, 2, MISS day 3, hit day 4 -> current streak should be 1 (only day 4 counts, closed periods through "today" boundary)
    const dates = [
      new Date(2026, 0, 1),
      new Date(2026, 0, 2),
      new Date(2026, 0, 4),
    ]
    const result = computeStreak(dates, { unit: 'days', every: 1, count: 1 }, start, today)
    // Periods closed strictly before `today` (Jan 5): Jan1,2,3,4 - day3 missed breaks the streak,
    // so only day4's hit survives as the trailing streak.
    expect(result.currentStreak).toBe(1)
  })
  it('best streak persists across a reset', () => {
    const start = new Date(2026, 0, 1)
    const today = new Date(2026, 0, 8)
    // Hit days 1-4 (streak of 4), miss day 5, hit day 6-7
    const dates = [
      new Date(2026, 0, 1),
      new Date(2026, 0, 2),
      new Date(2026, 0, 3),
      new Date(2026, 0, 4),
      new Date(2026, 0, 6),
      new Date(2026, 0, 7),
    ]
    const result = computeStreak(dates, { unit: 'days', every: 1, count: 1 }, start, today)
    expect(result.bestStreak).toBe(4)
    expect(result.currentStreak).toBe(2)
  })
})

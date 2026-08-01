/**
 * Pure window-math helpers for the weekly KPI report. No I/O, no `new
 * Date()` calls buried inside — every function takes `referenceDate` as a
 * parameter so a manual test-send on any day of the week can simulate "as
 * if next Monday," and so this file stays unit-testable without mocking
 * the clock.
 *
 * All dates are UTC calendar dates (`YYYY-MM-DD` strings) — the report's
 * "week" is Monday-through-Saturday inclusive, Sunday deliberately excluded
 * per the locked spec.
 */

export interface DateWindow {
  /** 'YYYY-MM-DD', inclusive. */
  start: string
  /** 'YYYY-MM-DD', inclusive. */
  end: string
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function addDaysUtc(date: Date, days: number): Date {
  const copy = new Date(date.getTime())
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

/** ISO week-day: Monday=1 ... Sunday=7. */
function isoWeekday(date: Date): number {
  const day = date.getUTCDay() // Sunday=0 ... Saturday=6
  return day === 0 ? 7 : day
}

/**
 * The most recent complete Monday-Saturday window strictly before
 * `referenceDate`'s own current week — i.e. "last week" as seen from a
 * Monday-morning send. If `referenceDate` itself is a Monday, this is the
 * six days immediately prior (the week that just closed). For any other
 * weekday, it's still the most recently *completed* Mon-Sat block (so a
 * manual test-send on, say, a Saturday reports the prior full week, not the
 * in-progress one).
 */
export function priorWeekWindow(referenceDate: Date): DateWindow {
  const weekday = isoWeekday(referenceDate) // Monday=1..Sunday=7
  // Days back to the most recent Monday (0 if referenceDate is itself Monday).
  const daysSinceMonday = weekday - 1
  const thisWeekMonday = addDaysUtc(referenceDate, -daysSinceMonday)
  const priorMonday = addDaysUtc(thisWeekMonday, -7)
  const priorSaturday = addDaysUtc(priorMonday, 5)
  return { start: toDateKey(priorMonday), end: toDateKey(priorSaturday) }
}

/** The Monday-Saturday window immediately before `priorWeekWindow`, for WoW baselines. */
export function twoWeeksAgoWindow(referenceDate: Date): DateWindow {
  const prior = priorWeekWindow(referenceDate)
  const priorMonday = fromDateKey(prior.start)
  const twoAgoMonday = addDaysUtc(priorMonday, -7)
  const twoAgoSaturday = addDaysUtc(twoAgoMonday, 5)
  return { start: toDateKey(twoAgoMonday), end: toDateKey(twoAgoSaturday) }
}

/** Month-to-date: first of the current calendar month through `referenceDate`, inclusive. */
export function monthToDateWindow(referenceDate: Date): DateWindow {
  const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1))
  return { start: toDateKey(start), end: toDateKey(referenceDate) }
}

/** Same calendar-day-of-month range, but for the previous month — for MoM baselines. */
export function priorMonthToDateWindow(referenceDate: Date): DateWindow {
  const priorMonthDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1))
  const start = priorMonthDate
  // Clamp the "through" day to the prior month's own length (e.g. reference
  // day 31 in a 30-day prior month clamps to the 30th).
  const priorMonthLength = new Date(Date.UTC(priorMonthDate.getUTCFullYear(), priorMonthDate.getUTCMonth() + 1, 0)).getUTCDate()
  const throughDay = Math.min(referenceDate.getUTCDate(), priorMonthLength)
  const end = new Date(Date.UTC(priorMonthDate.getUTCFullYear(), priorMonthDate.getUTCMonth(), throughDay))
  return { start: toDateKey(start), end: toDateKey(end) }
}

/** Year-to-date: Jan 1 of the current year through `referenceDate`, inclusive. */
export function yearToDateWindow(referenceDate: Date): DateWindow {
  const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1))
  return { start: toDateKey(start), end: toDateKey(referenceDate) }
}

/** Same day-of-year range, but for the previous year — for YoY baselines. */
export function priorYearToDateWindow(referenceDate: Date): DateWindow {
  const start = new Date(Date.UTC(referenceDate.getUTCFullYear() - 1, 0, 1))
  const isLeapDay = referenceDate.getUTCMonth() === 1 && referenceDate.getUTCDate() === 29
  const priorYearIsLeap = (() => {
    const y = referenceDate.getUTCFullYear() - 1
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  })()
  const end = isLeapDay && !priorYearIsLeap
    ? new Date(Date.UTC(referenceDate.getUTCFullYear() - 1, 1, 28)) // clamp Feb 29 -> Feb 28
    : new Date(Date.UTC(referenceDate.getUTCFullYear() - 1, referenceDate.getUTCMonth(), referenceDate.getUTCDate()))
  return { start: toDateKey(start), end: toDateKey(end) }
}

/** ISO week key, e.g. '2026-W31', derived from any date within that ISO week. */
export function isoWeekKey(referenceDate: Date): string {
  // ISO week date algorithm: Thursday of the same week determines the ISO year.
  const target = new Date(referenceDate.getTime())
  const dayNr = isoWeekday(target)
  target.setUTCDate(target.getUTCDate() - dayNr + 4) // move to Thursday of this ISO week
  const isoYear = target.getUTCFullYear()
  const jan1 = new Date(Date.UTC(isoYear, 0, 1))
  const weekNum = Math.ceil(((target.getTime() - jan1.getTime()) / 86400000 + 1) / 7)
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`
}

/** All date keys (inclusive) in a window, in order — useful for reading daily-aggregate docs. */
export function eachDateKeyInWindow(window: DateWindow): string[] {
  const keys: string[] = []
  let cursor = fromDateKey(window.start)
  const endDate = fromDateKey(window.end)
  while (cursor.getTime() <= endDate.getTime()) {
    keys.push(toDateKey(cursor))
    cursor = addDaysUtc(cursor, 1)
  }
  return keys
}

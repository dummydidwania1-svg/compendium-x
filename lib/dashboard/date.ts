// Shared dashboard date parsing/formatting.
//
// Dashboard entries carry `date` as a LOCAL calendar string ('YYYY-MM-DD',
// built from local getters in lib/dashboard/live.ts). `new Date('YYYY-MM-DD')`
// parses that as UTC midnight, so reading it back through LOCAL getters shifts
// the displayed date one day EARLIER for anyone west of UTC. Date-only strings
// must therefore be parsed into a local-midnight Date; anything else (full
// ISO strings, timestamps) falls through to normal parsing.

export function parseDashboardDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Mar 9" → "09.03.2026" style display used across dashboard cards/tables. */
export function formatDashboardDateDot(value: string): string {
  const d = parseDashboardDate(value)
  if (!d) return value
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

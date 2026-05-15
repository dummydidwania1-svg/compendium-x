/**
 * Minimal structured request logger.
 *
 * Emits a single JSON line per API request to stdout so Vercel (and any other
 * log shipping target) can index it. Keep field names stable — the team will
 * grep these later.
 */
import 'server-only'

export interface RequestLogEntry {
  msg: 'api_request'
  route: string
  method: string
  status: number
  durationMs: number
  uid: string | null
  errorCode?: string
  errorMessage?: string
  /** Free-form extras a route may want to surface, e.g. { lobbyId: 'abc' }. */
  meta?: Record<string, unknown>
}

export function logRequest(entry: Omit<RequestLogEntry, 'msg'>): void {
  const line: RequestLogEntry = { msg: 'api_request', ...entry }
  // Single-line JSON: easy to grep, easy to parse, no PII beyond uid.
  console.log(JSON.stringify(line))
}

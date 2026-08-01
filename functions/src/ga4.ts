/**
 * Server-side GA4 Data API access for the weekly KPI report — all-visitor
 * demographics/device/traffic-source breakdowns that Firestore has no way
 * to answer (GA4 tracks every visitor, including those who never sign up).
 *
 * Explicitly separate from `signupGeo` (lib/firebase/schema.ts) which is a
 * one-time IP lookup captured only for users who actually create an
 * account — these functions cover the full visitor population instead.
 *
 * Uses a dedicated service account (GA4_SERVICE_ACCOUNT_KEY secret), not
 * GMAIL_SA_KEY — this key needs GA4 Viewer access on the property, a
 * different grant than Gmail domain-wide delegation. Requires a one-time
 * manual step: granting this service account's client_email Viewer access
 * on the GA4 property, in the GA4 Admin UI.
 *
 * Every exported function degrades gracefully (returns null + logs a
 * warning) if the secret is missing, the property isn't granted access yet,
 * or the API call fails for any reason — GA4 data is enrichment, never a
 * hard dependency for the rest of the report to send.
 */
import { BetaAnalyticsDataClient } from '@google-analytics/data'

// Set via `firebase functions:config` equivalent (Firebase secret) once the
// GA4 property is created — see Phase 5 of the KPI report plan for the
// manual setup step this depends on.
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID ?? ''

let cachedClient: BetaAnalyticsDataClient | null = null

/**
 * Resolves the GA4 client, logging exactly why it's unavailable when it is
 * — every silent-null return elsewhere in this file was previously
 * indistinguishable from a real API failure in the logs (both just
 * produced no output at all), which made "not configured" and "configured
 * but GA4 has no data yet" impossible to tell apart from Cloud Functions
 * logs. This function is now the single place that explains a null client.
 */
function getClient(): BetaAnalyticsDataClient | null {
  if (cachedClient) return cachedClient
  const saKeyJson = process.env.GA4_SERVICE_ACCOUNT_KEY
  if (!saKeyJson) {
    console.warn('[ga4] GA4_SERVICE_ACCOUNT_KEY secret missing — GA4-backed metrics will read as N/A')
    return null
  }
  if (!GA4_PROPERTY_ID) {
    console.warn('[ga4] GA4_PROPERTY_ID env var missing — GA4-backed metrics will read as N/A')
    return null
  }
  try {
    const saKey = JSON.parse(saKeyJson) as { client_email: string; private_key: string }
    cachedClient = new BetaAnalyticsDataClient({
      credentials: { client_email: saKey.client_email, private_key: saKey.private_key },
    })
    console.log('[ga4] client initialized', { clientEmail: saKey.client_email, propertyId: GA4_PROPERTY_ID })
    return cachedClient
  } catch (err) {
    console.error('[ga4] failed to parse GA4_SERVICE_ACCOUNT_KEY', err instanceof Error ? err.message : String(err))
    return null
  }
}

export interface Ga4DimensionBreakdown {
  dimensionValue: string
  metricValue: number
}

// A single report run fires ~18 GA4 calls at once (6 metrics x 3 time
// windows, all via Promise.all) — right after the Analytics Data API is
// freshly enabled on a project, or under a burst against a low initial
// quota, some of those concurrent calls can transiently fail
// (PERMISSION_DENIED during propagation, RESOURCE_EXHAUSTED on quota,
// UNAVAILABLE) even while sibling calls in the very same run succeed.
// Retrying transient failures with backoff makes GA4 metrics reliable on
// every run rather than only "eventually consistent after enough retries
// across separate report sends."
const RETRYABLE_MESSAGE_PATTERNS = [/PERMISSION_DENIED/i, /RESOURCE_EXHAUSTED/i, /UNAVAILABLE/i, /has not been used in project/i]

function isRetryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}

async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxAttempts || !isRetryable(err)) throw err
      const delayMs = 500 * 2 ** (attempt - 1) // 500ms, 1000ms, ...
      console.warn(`[ga4] ${label} attempt ${attempt} failed transiently, retrying in ${delayMs}ms`, err instanceof Error ? err.message : String(err))
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastErr
}

async function runSimpleReport(opts: {
  startDate: string
  endDate: string
  dimension: string
  metric: string
  limit?: number
}): Promise<Ga4DimensionBreakdown[] | null> {
  const client = getClient()
  if (!client) return null

  try {
    const [response] = await withRetry(`runReport(${opts.dimension})`, () =>
      client.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
        dimensions: [{ name: opts.dimension }],
        metrics: [{ name: opts.metric }],
        limit: opts.limit ?? 25,
      }),
    )

    const rows = (response.rows ?? []).map((row) => ({
      dimensionValue: row.dimensionValues?.[0]?.value ?? '(not set)',
      metricValue: Number(row.metricValues?.[0]?.value ?? 0),
    }))
    console.log('[ga4] runReport succeeded', { dimension: opts.dimension, metric: opts.metric, rowCount: rows.length, dateRange: `${opts.startDate}..${opts.endDate}` })
    return rows
  } catch (err) {
    console.error('[ga4] runReport failed', { dimension: opts.dimension, metric: opts.metric, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** Traffic-source breakdown (sessionDefaultChannelGroup) for all site visitors, not just signups. */
export async function getSignupSourceBreakdown(startDate: string, endDate: string) {
  return runSimpleReport({ startDate, endDate, dimension: 'sessionDefaultChannelGroup', metric: 'sessions' })
}

/** Device category (desktop/mobile/tablet) breakdown for all visitors. */
export async function getDeviceBreakdown(startDate: string, endDate: string) {
  return runSimpleReport({ startDate, endDate, dimension: 'deviceCategory', metric: 'sessions' })
}

/** Browser breakdown for all visitors. */
export async function getBrowserBreakdown(startDate: string, endDate: string) {
  return runSimpleReport({ startDate, endDate, dimension: 'browser', metric: 'sessions' })
}

/** Country breakdown for all visitors (distinct from signupGeo, which is signup-time-only). */
export async function getGeographyBreakdown(startDate: string, endDate: string) {
  return runSimpleReport({ startDate, endDate, dimension: 'country', metric: 'sessions' })
}

/** Average engagement time per session (seconds), across all visitors. */
export async function getAvgTimeOnSite(startDate: string, endDate: string): Promise<number | null> {
  const client = getClient()
  if (!client) return null

  try {
    const [response] = await withRetry('getAvgTimeOnSite', () =>
      client.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: 'averageSessionDuration' }],
      }),
    )
    const value = response.rows?.[0]?.metricValues?.[0]?.value
    const parsed = value != null ? Number(value) : null
    console.log('[ga4] getAvgTimeOnSite succeeded', { dateRange: `${startDate}..${endDate}`, seconds: parsed })
    return parsed
  } catch (err) {
    console.error('[ga4] getAvgTimeOnSite failed', err instanceof Error ? err.message : String(err))
    return null
  }
}

/** Total visitors (any session) in the window — includes people who never signed up. */
export async function getTotalVisitors(startDate: string, endDate: string): Promise<number | null> {
  const client = getClient()
  if (!client) return null

  try {
    const [response] = await withRetry('getTotalVisitors', () =>
      client.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: 'totalUsers' }],
      }),
    )
    const value = response.rows?.[0]?.metricValues?.[0]?.value
    const parsed = value != null ? Number(value) : null
    console.log('[ga4] getTotalVisitors succeeded', { dateRange: `${startDate}..${endDate}`, totalUsers: parsed })
    return parsed
  } catch (err) {
    console.error('[ga4] getTotalVisitors failed', err instanceof Error ? err.message : String(err))
    return null
  }
}

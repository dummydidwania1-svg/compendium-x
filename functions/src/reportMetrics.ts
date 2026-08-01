/**
 * Weekly KPI report aggregation engine. One function per metric/metric
 * group so a single failing metric never aborts the rest of the report —
 * every exported computer function is wrapped internally in try/catch and
 * returns a safe default (0 / null / empty array) on failure, logging the
 * error rather than throwing.
 *
 * Follows the existing `sessionMaintenanceSweep` precedent (functions/src/
 * index.ts) of reading whole/filtered collections into memory rather than
 * adding narrow composite indexes — current data volume is "low thousands,"
 * so this stays cheap and avoids index proliferation for report-only
 * queries that run once a week.
 */
import { getFirestore } from 'firebase-admin/firestore'
import type { DateWindow } from './reportDates.js'
import { eachDateKeyInWindow } from './reportDates.js'
import * as ga4 from './ga4.js'

function db() {
  return getFirestore()
}

/* -------------------------------------------------------------------------- */
/* Small local copies of client-side normalizers (functions/ is a separate    */
/* TS project, rootDir-scoped to its own src/ — can't import from lib/).      */
/* -------------------------------------------------------------------------- */

function normalizeWords(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function normalizeCaseType(value: string | null | undefined): string {
  if (!value) return 'General'
  return normalizeWords(value)
}

function normalizeDifficulty(value: string | null | undefined): string {
  if (!value) return 'General'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'easy') return 'Easy'
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'hard') return 'Hard'
  return normalizeWords(value)
}

function tsToMs(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis()
  }
  return null
}

function inWindowMs(ms: number | null, window: DateWindow): boolean {
  if (ms == null) return false
  const startMs = new Date(`${window.start}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${window.end}T23:59:59.999Z`).getTime()
  return ms >= startMs && ms <= endMs
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[reportMetrics] ${label} failed`, err instanceof Error ? err.message : String(err))
    return fallback
  }
}

/* -------------------------------------------------------------------------- */
/* Shared raw-data loaders (fetched once per report run, reused by many       */
/* individual metric computations below to avoid redundant reads).           */
/* -------------------------------------------------------------------------- */

export interface RawProfile {
  uid: string
  university: string | null
  createdAtMs: number | null
  pendingDeletion: boolean
  signupGeo?: { country?: string | null; region?: string | null; city?: string | null; source?: string }
  signupAttribution?: { utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; referrerHost?: string | null }
}

export interface RawSession {
  lobbyId: string
  candidateId: string
  status: string
  sessionMode: string
  caseId: string | null
  createdAtMs: number | null
  completedAtMs: number | null
  abandonedAtMs: number | null
  durationMs: number | null
  hasTranscript: boolean
}

export interface RawEvaluation {
  lobbyId: string | null
  candidateId: string
  caseType: string | null
  structureScore: number | null
  understandingScore: number | null
  deliveryScore: number | null
  creativityScore: number | null
  isUnrated: boolean
  createdAtMs: number | null
}

export interface RawCaseMeta {
  caseId: string
  caseType: string
  difficulty: string
}

export interface RawHeartbeat {
  uid: string
  dateKey: string
}

async function loadProfiles(): Promise<RawProfile[]> {
  const snap = await db().collection('profiles').get()
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      uid: d.id,
      university: typeof data.university === 'string' && data.university.trim() ? data.university.trim() : null,
      createdAtMs: tsToMs(data.createdAt),
      pendingDeletion: data.pendingDeletion === true,
      signupGeo: data.signupGeo ?? undefined,
      signupAttribution: data.signupAttribution ?? undefined,
    }
  })
}

async function loadSessions(): Promise<RawSession[]> {
  const snap = await db().collection('sessions').get()
  return snap.docs.map((d) => {
    const data = d.data()
    const recording = data.recording ?? null
    return {
      lobbyId: d.id,
      candidateId: data.candidateId ?? '',
      status: data.status ?? 'unknown',
      sessionMode: data.sessionMode ?? 'remote',
      caseId: data.caseId ?? null,
      createdAtMs: tsToMs(data.createdAt),
      completedAtMs: tsToMs(data.completedAt),
      abandonedAtMs: tsToMs(data.abandonedAt),
      durationMs: typeof recording?.durationMs === 'number' ? recording.durationMs : (typeof data.mergedAudioDurationMs === 'number' ? data.mergedAudioDurationMs : null),
      hasTranscript: recording?.transcriptStatus === 'completed' || data.mergedTranscriptStatus === 'completed',
    }
  })
}

async function loadEvaluations(): Promise<RawEvaluation[]> {
  const snap = await db().collection('evaluations').get()
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      lobbyId: data.lobbyId ?? null,
      candidateId: data.candidateId ?? '',
      caseType: data.caseType ?? null,
      structureScore: data.structureScore ?? null,
      understandingScore: data.understandingScore ?? null,
      deliveryScore: data.deliveryScore ?? null,
      creativityScore: data.creativityScore ?? null,
      isUnrated: data.isUnrated === true,
      createdAtMs: tsToMs(data.createdAt),
    }
  })
}

async function loadCaseMeta(): Promise<Map<string, RawCaseMeta>> {
  const snap = await db().collection('cases').get()
  const map = new Map<string, RawCaseMeta>()
  snap.docs.forEach((d) => {
    const data = d.data()
    map.set(d.id, {
      caseId: d.id,
      caseType: normalizeCaseType(data.case_type ?? null),
      difficulty: normalizeDifficulty(data.difficulty ?? null),
    })
  })
  return map
}

async function loadHeartbeatsInWindow(window: DateWindow): Promise<RawHeartbeat[]> {
  const dateKeys = eachDateKeyInWindow(window)
  const results = await Promise.all(
    dateKeys.map(async (dateKey: string) => {
      const snap = await db().collection('activityHeartbeats').where('dateKey', '==', dateKey).get()
      return snap.docs.map((d) => ({ uid: d.data().uid as string, dateKey }))
    }),
  )
  return results.flat()
}

async function loadCaseViewAggregatesInWindow(window: DateWindow): Promise<{ totalViews: number; totalStarts: number; viewsByCase: Record<string, number>; startsByCase: Record<string, number> }> {
  const dateKeys = eachDateKeyInWindow(window)
  const docs = await Promise.all(dateKeys.map((dateKey: string) => db().collection('caseViewAggregates').doc(dateKey).get()))
  const acc = { totalViews: 0, totalStarts: 0, viewsByCase: {} as Record<string, number>, startsByCase: {} as Record<string, number> }
  for (const doc of docs) {
    if (!doc.exists) continue
    const data = doc.data() ?? {}
    acc.totalViews += typeof data.totalViews === 'number' ? data.totalViews : 0
    acc.totalStarts += typeof data.totalStarts === 'number' ? data.totalStarts : 0
    for (const [caseId, count] of Object.entries((data.viewsByCase ?? {}) as Record<string, number>)) {
      acc.viewsByCase[caseId] = (acc.viewsByCase[caseId] ?? 0) + count
    }
    for (const [caseId, count] of Object.entries((data.startsByCase ?? {}) as Record<string, number>)) {
      acc.startsByCase[caseId] = (acc.startsByCase[caseId] ?? 0) + count
    }
  }
  return acc
}

/* -------------------------------------------------------------------------- */
/* Section A — Acquisition                                                    */
/* -------------------------------------------------------------------------- */

export interface AcquisitionMetrics {
  newSignups: number
  domainBreakdown: { college: number; personal: number; other: number }
  topColleges: Array<{ college: string; count: number }>
  utmSourceBreakdown: Array<{ source: string; count: number }>
  neverSignedUpVisitors: number | null // GA4-backed, null if unavailable
  ga4SourceBreakdown: ga4.Ga4DimensionBreakdown[] | null
}

const KNOWN_PERSONAL_EMAIL_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'live.com'])

/** Best-effort classification: a domain is "college" if it contains 'edu' or 'ac.' (common academic TLD patterns), else checked against a known-personal list, else "other". */
function classifyEmailDomain(domain: string): 'college' | 'personal' | 'other' {
  const lower = domain.toLowerCase()
  if (lower.endsWith('.edu') || lower.includes('.ac.') || lower.endsWith('.edu.in') || lower.includes('.edu.')) return 'college'
  if (KNOWN_PERSONAL_EMAIL_DOMAINS.has(lower)) return 'personal'
  return 'other'
}

export async function computeAcquisitionMetrics(
  window: DateWindow,
  profiles: RawProfile[],
  emailByUid: Map<string, string | null>,
): Promise<AcquisitionMetrics> {
  return safe('computeAcquisitionMetrics', async () => {
    const newInWindow = profiles.filter((p) => inWindowMs(p.createdAtMs, window))

    const domainBreakdown = { college: 0, personal: 0, other: 0 }
    const collegeCounts = new Map<string, number>()
    for (const p of newInWindow) {
      const email = emailByUid.get(p.uid)
      const domain = email?.split('@')[1]
      if (domain) {
        domainBreakdown[classifyEmailDomain(domain)] += 1
      }
      if (p.university) {
        collegeCounts.set(p.university, (collegeCounts.get(p.university) ?? 0) + 1)
      }
    }
    const topColleges = [...collegeCounts.entries()]
      .map(([college, count]) => ({ college, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const utmCounts = new Map<string, number>()
    for (const p of newInWindow) {
      const source = p.signupAttribution?.utmSource?.trim() || (p.signupAttribution?.referrerHost ? `referral: ${p.signupAttribution.referrerHost}` : 'direct/unknown')
      utmCounts.set(source, (utmCounts.get(source) ?? 0) + 1)
    }
    const utmSourceBreakdown = [...utmCounts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    const ga4SourceBreakdown = await ga4.getSignupSourceBreakdown(window.start, window.end)
    const totalVisitors = await ga4.getTotalVisitors(window.start, window.end)
    const neverSignedUpVisitors = totalVisitors != null ? Math.max(0, totalVisitors - newInWindow.length) : null

    return {
      newSignups: newInWindow.length,
      domainBreakdown,
      topColleges,
      utmSourceBreakdown,
      neverSignedUpVisitors,
      ga4SourceBreakdown,
    }
  }, {
    newSignups: 0,
    domainBreakdown: { college: 0, personal: 0, other: 0 },
    topColleges: [],
    utmSourceBreakdown: [],
    neverSignedUpVisitors: null,
    ga4SourceBreakdown: null,
  })
}

/* -------------------------------------------------------------------------- */
/* Section B — Activation / Engagement                                        */
/* -------------------------------------------------------------------------- */

export interface EngagementMetrics {
  dau: number // this window's average daily actives (or, for a week window, "active at all")
  activeInWindow: number
  wau: number
  mau: number
  stickiness: number | null // DAU/MAU, null if MAU is 0
  newVsReturning: { new: number; returning: number }
  uniqueVsRecurring: { unique: number; recurring: number }
}

export async function computeEngagementMetrics(
  window: DateWindow,
  monthWindow: DateWindow,
  profiles: RawProfile[],
): Promise<EngagementMetrics> {
  return safe('computeEngagementMetrics', async () => {
    const [weekHeartbeats, monthHeartbeats] = await Promise.all([
      loadHeartbeatsInWindow(window),
      loadHeartbeatsInWindow(monthWindow),
    ])

    const uidToDaysInWeek = new Map<string, Set<string>>()
    for (const hb of weekHeartbeats) {
      if (!uidToDaysInWeek.has(hb.uid)) uidToDaysInWeek.set(hb.uid, new Set())
      uidToDaysInWeek.get(hb.uid)!.add(hb.dateKey)
    }

    const activeUidsWeek = new Set(weekHeartbeats.map((h) => h.uid))
    const activeUidsMonth = new Set(monthHeartbeats.map((h) => h.uid))

    const createdAtByUid = new Map(profiles.map((p) => [p.uid, p.createdAtMs]))

    let newCount = 0
    let returningCount = 0
    for (const uid of activeUidsWeek) {
      const createdAtMs = createdAtByUid.get(uid) ?? null
      if (createdAtMs != null && inWindowMs(createdAtMs, window)) newCount += 1
      else returningCount += 1
    }

    let uniqueCount = 0
    let recurringCount = 0
    for (const days of uidToDaysInWeek.values()) {
      if (days.size <= 1) uniqueCount += 1
      else recurringCount += 1
    }

    const dau = activeUidsWeek.size > 0 ? Math.round(weekHeartbeats.length / eachDateKeyInWindow(window).length) : 0
    const wau = activeUidsWeek.size
    const mau = activeUidsMonth.size

    return {
      dau,
      activeInWindow: wau,
      wau,
      mau,
      stickiness: mau > 0 ? +(dau / mau).toFixed(3) : null,
      newVsReturning: { new: newCount, returning: returningCount },
      uniqueVsRecurring: { unique: uniqueCount, recurring: recurringCount },
    }
  }, {
    dau: 0,
    activeInWindow: 0,
    wau: 0,
    mau: 0,
    stickiness: null,
    newVsReturning: { new: 0, returning: 0 },
    uniqueVsRecurring: { unique: 0, recurring: 0 },
  })
}

/* -------------------------------------------------------------------------- */
/* Section C — Platform usage                                                 */
/* -------------------------------------------------------------------------- */

export interface UsageMetrics {
  casesCompleted: number
  casesAbandoned: number
  minutesPracticed: number
  minutesTranscribed: number
  transcriptionCompletionRate: number | null
  casesViewed: number
  casesStarted: number
  viewedButNeverStartedRate: number | null
  caseTypeDistribution: Array<{ caseType: string; count: number }>
  difficultyDistribution: Array<{ difficulty: string; count: number }>
  sessionModeDistribution: { remote: number; local: number }
  evaluationsCompleted: number
  avgScores: { structure: number | null; understanding: number | null; delivery: number | null; creativity: number | null }
  goalTrackerAdoption: number
  forumEngagement: { threads: number; replies: number; votes: number }
}

export async function computeUsageMetrics(
  window: DateWindow,
  sessions: RawSession[],
  evaluations: RawEvaluation[],
  caseMetaById: Map<string, RawCaseMeta>,
): Promise<UsageMetrics> {
  return safe('computeUsageMetrics', async () => {
    const sessionsInWindow = sessions.filter((s) => inWindowMs(s.completedAtMs ?? s.abandonedAtMs ?? s.createdAtMs, window))
    const completed = sessionsInWindow.filter((s) => s.status === 'completed')
    const abandoned = sessionsInWindow.filter((s) => s.status === 'abandoned')

    const minutesPracticed = completed.reduce((sum, s) => sum + (s.durationMs ?? 0), 0) / 60000
    const withTranscript = completed.filter((s) => s.hasTranscript)
    const minutesTranscribed = withTranscript.reduce((sum, s) => sum + (s.durationMs ?? 0), 0) / 60000
    const transcriptionCompletionRate = completed.length > 0 ? +(withTranscript.length / completed.length).toFixed(3) : null

    const caseView = await loadCaseViewAggregatesInWindow(window)
    const viewedButNeverStartedRate = caseView.totalViews > 0
      ? +((caseView.totalViews - caseView.totalStarts) / caseView.totalViews).toFixed(3)
      : null

    const caseTypeCounts = new Map<string, number>()
    const difficultyCounts = new Map<string, number>()
    for (const s of completed) {
      const meta = s.caseId ? caseMetaById.get(s.caseId) : null
      const type = meta?.caseType ?? 'General'
      const difficulty = meta?.difficulty ?? 'General'
      caseTypeCounts.set(type, (caseTypeCounts.get(type) ?? 0) + 1)
      difficultyCounts.set(difficulty, (difficultyCounts.get(difficulty) ?? 0) + 1)
    }

    const sessionModeDistribution = { remote: 0, local: 0 }
    for (const s of completed) {
      if (s.sessionMode === 'local') sessionModeDistribution.local += 1
      else sessionModeDistribution.remote += 1
    }

    const evalsInWindow = evaluations.filter((e) => inWindowMs(e.createdAtMs, window) && !e.isUnrated)
    const avg = (values: Array<number | null>) => {
      const nums = values.filter((v): v is number => v != null)
      return nums.length > 0 ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : null
    }

    const goalDocsSnap = await db().collection('goals').where('updatedAt', '>=', new Date(`${window.start}T00:00:00.000Z`)).get().catch(() => null)
    const goalTrackerAdoption = goalDocsSnap ? goalDocsSnap.size : 0

    const forumEngagement = { threads: 0, replies: 0, votes: 0 }
    try {
      const forumsSnap = await db().collection('case_forums').get()
      await Promise.all(
        forumsSnap.docs.map(async (forumDoc) => {
          const threadsSnap = await forumDoc.ref.collection('threads').get()
          for (const threadDoc of threadsSnap.docs) {
            const threadData = threadDoc.data()
            if (inWindowMs(tsToMs(threadData.createdAt), window)) forumEngagement.threads += 1
            const repliesSnap = await threadDoc.ref.collection('replies').get()
            for (const replyDoc of repliesSnap.docs) {
              if (inWindowMs(tsToMs(replyDoc.data().createdAt), window)) forumEngagement.replies += 1
            }
            const votesSnap = await threadDoc.ref.collection('votes').get()
            forumEngagement.votes += votesSnap.size
          }
        }),
      )
    } catch (err) {
      console.error('[reportMetrics] forumEngagement failed', err instanceof Error ? err.message : String(err))
    }

    return {
      casesCompleted: completed.length,
      casesAbandoned: abandoned.length,
      minutesPracticed: Math.round(minutesPracticed),
      minutesTranscribed: Math.round(minutesTranscribed),
      transcriptionCompletionRate,
      casesViewed: caseView.totalViews,
      casesStarted: caseView.totalStarts,
      viewedButNeverStartedRate,
      caseTypeDistribution: [...caseTypeCounts.entries()].map(([caseType, count]) => ({ caseType, count })).sort((a, b) => b.count - a.count),
      difficultyDistribution: [...difficultyCounts.entries()].map(([difficulty, count]) => ({ difficulty, count })).sort((a, b) => b.count - a.count),
      sessionModeDistribution,
      evaluationsCompleted: evalsInWindow.length,
      avgScores: {
        structure: avg(evalsInWindow.map((e) => e.structureScore)),
        understanding: avg(evalsInWindow.map((e) => e.understandingScore)),
        delivery: avg(evalsInWindow.map((e) => e.deliveryScore)),
        creativity: avg(evalsInWindow.map((e) => e.creativityScore)),
      },
      goalTrackerAdoption,
      forumEngagement,
    }
  }, {
    casesCompleted: 0,
    casesAbandoned: 0,
    minutesPracticed: 0,
    minutesTranscribed: 0,
    transcriptionCompletionRate: null,
    casesViewed: 0,
    casesStarted: 0,
    viewedButNeverStartedRate: null,
    caseTypeDistribution: [],
    difficultyDistribution: [],
    sessionModeDistribution: { remote: 0, local: 0 },
    evaluationsCompleted: 0,
    avgScores: { structure: null, understanding: null, delivery: null, creativity: null },
    goalTrackerAdoption: 0,
    forumEngagement: { threads: 0, replies: 0, votes: 0 },
  })
}

/* -------------------------------------------------------------------------- */
/* Section D — Demographics                                                   */
/* -------------------------------------------------------------------------- */

export interface DemographicsMetrics {
  geoBreakdown: Array<{ location: string; count: number }> // signup-time IP geo, new signups only
  ga4CountryBreakdown: ga4.Ga4DimensionBreakdown[] | null
  ga4DeviceBreakdown: ga4.Ga4DimensionBreakdown[] | null
  ga4BrowserBreakdown: ga4.Ga4DimensionBreakdown[] | null
  avgTimeOnSiteSeconds: number | null
}

export async function computeDemographicsMetrics(window: DateWindow, profiles: RawProfile[]): Promise<DemographicsMetrics> {
  return safe('computeDemographicsMetrics', async () => {
    const newInWindow = profiles.filter((p) => inWindowMs(p.createdAtMs, window))
    const geoCounts = new Map<string, number>()
    for (const p of newInWindow) {
      const geo = p.signupGeo
      if (!geo || geo.source !== 'ip-api') continue
      const label = [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || 'Unknown'
      geoCounts.set(label, (geoCounts.get(label) ?? 0) + 1)
    }
    const geoBreakdown = [...geoCounts.entries()].map(([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count)

    const [ga4CountryBreakdown, ga4DeviceBreakdown, ga4BrowserBreakdown, avgTimeOnSiteSeconds] = await Promise.all([
      ga4.getGeographyBreakdown(window.start, window.end),
      ga4.getDeviceBreakdown(window.start, window.end),
      ga4.getBrowserBreakdown(window.start, window.end),
      ga4.getAvgTimeOnSite(window.start, window.end),
    ])

    return { geoBreakdown, ga4CountryBreakdown, ga4DeviceBreakdown, ga4BrowserBreakdown, avgTimeOnSiteSeconds }
  }, {
    geoBreakdown: [],
    ga4CountryBreakdown: null,
    ga4DeviceBreakdown: null,
    ga4BrowserBreakdown: null,
    avgTimeOnSiteSeconds: null,
  })
}

/* -------------------------------------------------------------------------- */
/* Section E — Technical / reliability                                        */
/* -------------------------------------------------------------------------- */

export interface ReliabilityMetrics {
  sessionFailureRate: number | null // abandoned / (completed + abandoned)
  transcriptionFailureRate: number | null
  totalAccountsPendingDeletion: number
}

export async function computeReliabilityMetrics(
  window: DateWindow,
  sessions: RawSession[],
  profiles: RawProfile[],
): Promise<ReliabilityMetrics> {
  return safe('computeReliabilityMetrics', async () => {
    const sessionsInWindow = sessions.filter((s) => inWindowMs(s.completedAtMs ?? s.abandonedAtMs ?? s.createdAtMs, window))
    const completed = sessionsInWindow.filter((s) => s.status === 'completed')
    const abandoned = sessionsInWindow.filter((s) => s.status === 'abandoned')
    const totalAttempted = completed.length + abandoned.length

    const sessionFailureRate = totalAttempted > 0 ? +(abandoned.length / totalAttempted).toFixed(3) : null
    const transcriptionFailureRate = completed.length > 0
      ? +((completed.length - completed.filter((s) => s.hasTranscript).length) / completed.length).toFixed(3)
      : null

    return {
      sessionFailureRate,
      transcriptionFailureRate,
      totalAccountsPendingDeletion: profiles.filter((p) => p.pendingDeletion).length,
    }
  }, {
    sessionFailureRate: null,
    transcriptionFailureRate: null,
    totalAccountsPendingDeletion: 0,
  })
}

/* -------------------------------------------------------------------------- */
/* Top-level: compute everything for one window, and the full multi-window   */
/* report payload.                                                            */
/* -------------------------------------------------------------------------- */

export interface WindowMetrics {
  window: DateWindow
  acquisition: AcquisitionMetrics
  engagement: EngagementMetrics
  usage: UsageMetrics
  demographics: DemographicsMetrics
  reliability: ReliabilityMetrics
}

export interface FullReportMetrics {
  week: WindowMetrics
  month: WindowMetrics
  year: WindowMetrics
}

async function computeWindowMetrics(
  window: DateWindow,
  monthWindowForStickiness: DateWindow,
  profiles: RawProfile[],
  emailByUid: Map<string, string | null>,
  sessions: RawSession[],
  evaluations: RawEvaluation[],
  caseMetaById: Map<string, RawCaseMeta>,
): Promise<WindowMetrics> {
  const [acquisition, engagement, usage, demographics, reliability] = await Promise.all([
    computeAcquisitionMetrics(window, profiles, emailByUid),
    computeEngagementMetrics(window, monthWindowForStickiness, profiles),
    computeUsageMetrics(window, sessions, evaluations, caseMetaById),
    computeDemographicsMetrics(window, profiles),
    computeReliabilityMetrics(window, sessions, profiles),
  ])
  return { window, acquisition, engagement, usage, demographics, reliability }
}

export async function computeFullReportMetrics(opts: {
  weekWindow: DateWindow
  monthWindow: DateWindow
  yearWindow: DateWindow
}): Promise<FullReportMetrics> {
  const [profiles, sessions, evaluations, caseMetaById] = await Promise.all([
    safe('loadProfiles', loadProfiles, []),
    safe('loadSessions', loadSessions, []),
    safe('loadEvaluations', loadEvaluations, []),
    safe('loadCaseMeta', loadCaseMeta, new Map<string, RawCaseMeta>()),
  ])

  // Auth emails aren't on the profile doc — resolved separately via Admin
  // Auth (batched) since domain classification needs the real signup email.
  const emailByUid = await safe('resolveEmails', async () => {
    const { getAuth } = await import('firebase-admin/auth')
    const auth = getAuth()
    const uids = profiles.map((p) => p.uid)
    const map = new Map<string, string | null>()
    const chunkSize = 100
    for (let i = 0; i < uids.length; i += chunkSize) {
      const chunk = uids.slice(i, i + chunkSize).map((uid) => ({ uid }))
      const result = await auth.getUsers(chunk)
      for (const u of result.users) map.set(u.uid, u.email ?? null)
      for (const nf of result.notFound) if ('uid' in nf) map.set(nf.uid, null)
    }
    return map
  }, new Map<string, string | null>())

  const [week, month, year] = await Promise.all([
    computeWindowMetrics(opts.weekWindow, opts.monthWindow, profiles, emailByUid, sessions, evaluations, caseMetaById),
    computeWindowMetrics(opts.monthWindow, opts.monthWindow, profiles, emailByUid, sessions, evaluations, caseMetaById),
    computeWindowMetrics(opts.yearWindow, opts.monthWindow, profiles, emailByUid, sessions, evaluations, caseMetaById),
  ])

  return { week, month, year }
}

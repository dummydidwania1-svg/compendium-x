/**
 * POST /api/goal-insight
 *
 * Server-side, on-demand only (never auto-fires): computes the AI-insight
 * shape candidates for the caller's active goal, ranks them via Vertex AI
 * (gemini-3.6-flash), fills the winning shape into a short buddy-tone
 * sentence, validates it, retries once with a stricter prompt on failure,
 * then gives up cleanly. Zero-candidates and retry-exhausted both return
 * `{ insight: null }` — the client treats both identically (silent revert to
 * idle "Ask Tracker"). The response also carries the winning candidate's
 * `dimension` (and `targetType` where relevant) so the client can render the
 * matching call-to-action instead of just a passive sentence.
 *
 * Cost control is data-driven, not clock-driven: the (cheap) inputs that
 * feed the detectors — counted-session count/recency, cadence, total,
 * dates — are fingerprinted into a signature. If a repeat call's signature
 * matches the last one computed, the cached result is returned directly and
 * the (expensive) Vertex AI calls are skipped entirely. Re-clicking without
 * having logged a new case, or changed the goal, can never trigger a fresh
 * AI call — only genuinely new data can. This also sidesteps the correctness
 * gap a naive time-based cooldown would have (a read-then-write check isn't
 * atomic, so a tight burst can slip both requests through) — a cache hit is
 * side-effect-free regardless of how many requests race for it.
 */
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { goalConfigSchema, type GoalConfig } from '@/lib/firebase/schema'
import { computeShapeCandidates } from '@/lib/goalTracker/insightShapes'
import { callVertexFill, callVertexRank, validateInsight } from '@/lib/goalTracker/vertexInsight'
import { filterCountedSessions, type CountedSession } from '@/lib/goalTracker/goalCountFilter'
import { normalizeCaseType } from '@/lib/dashboard/live'
import { resolveTotalState, classifyPace, parseDMY, resolveFlow, startOfDay } from '@/lib/goalTracker/engine'

export const runtime = 'nodejs'

const goalInsightInput = z.object({
  lastShownShapeId: z.string().nullable().optional(),
  /**
   * Epoch ms of local midnight on the client, per the locked §2 timezone
   * rule ("today"/period boundaries use the USER'S local timezone). The
   * server (Vercel, UTC) cannot derive this correctly on its own — computing
   * "today" server-side silently shifts the day boundary and produces
   * inconsistent done-counts across requests. Falls back to server time if
   * omitted (older client / bad clock), which may be off by a few hours.
   */
  localMidnightMs: z.number().optional(),
})

/**
 * Fingerprint of everything that could change what the detectors/AI would
 * say — new/removed counted sessions, a goal edit, or the calendar day
 * itself. The day matters even with zero new sessions: momentum compares
 * "last 3 days" against "the 11 days before that," and streak/period
 * boundaries close overnight — so the same session data can read
 * differently tomorrow purely because a day rolled over, and the cache must
 * not paper over that with yesterday's answer.
 */
function buildInsightSignature(config: GoalConfig, countedSessions: CountedSession[], today: Date): string {
  const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  const sessionCount = countedSessions.length
  const latestCompletedAtMs = sessionCount > 0 ? Math.max(...countedSessions.map((s) => s.completedAtMs)) : 0
  const configPart = [
    config.startDate,
    config.endDate,
    config.hasEndDate,
    config.recurringCount,
    config.recurringEvery,
    config.recurringUnit,
    config.totalCases,
    config.hasPerType,
    // detectPerTypeSubGoalStalling/detectUntouchedTypeGap read config.perType
    // directly — omitting it would let a per-type-target edit serve a stale
    // cached insight even though the session/config-total fingerprint above
    // didn't change.
    JSON.stringify(config.perType),
  ].join('|')
  return `${dayKey}:${sessionCount}:${latestCompletedAtMs}:${configPart}`
}

interface CachedInsight {
  text: string
  shapeId: string
  dimension: string
  targetType: string | null
}

export const POST = authenticatedRoute('/api/goal-insight', async (request, caller) => {
  const { lastShownShapeId, localMidnightMs } = await parseBody(request, goalInsightInput)

  const goalSnap = await adminDb.collection('goals').doc(caller.uid).get()
  if (!goalSnap.exists) return jsonOk({ insight: null })
  const configResult = goalConfigSchema.safeParse(goalSnap.data())
  if (!configResult.success) return jsonOk({ insight: null })
  const config = configResult.data

  const [sessionsSnap, evaluationsSnap] = await Promise.all([
    adminDb.collection('sessions').where('candidateId', '==', caller.uid).where('status', '==', 'completed').get(),
    adminDb.collection('evaluations').where('candidateId', '==', caller.uid).get(),
  ])

  const caseIds = [...new Set(sessionsSnap.docs.map((d) => d.data().caseId).filter(Boolean))] as string[]
  const caseTypeById = new Map<string, string>()
  await Promise.all(
    caseIds.map(async (caseId) => {
      const snap = await adminDb.collection('cases').doc(caseId).get()
      caseTypeById.set(caseId, snap.data()?.case_type ?? 'General')
    }),
  )

  // Only isRated is needed downstream (the score fields fed the now-removed
  // score-correlation detectors) — kept lightweight rather than dropping the
  // evaluations read entirely, since countMode: 'rated' still depends on it.
  const ratedLobbyIds = new Set(
    evaluationsSnap.docs.filter((d) => d.data().lobbyId && !d.data().isUnrated).map((d) => d.data().lobbyId as string),
  )

  const candidateSessions: CountedSession[] = sessionsSnap.docs.map((d) => {
    const data = d.data()
    // Firestore itself timestamps every document's creation server-side,
    // independent of whatever fields the write path set — `d.createTime` is
    // guaranteed present for any doc that exists, unlike the app-level
    // completedAt/updatedAt fields above it, which only exist because a
    // specific write path chose to set them. Used as the final fallback
    // instead of a fake epoch date, so a session can never silently count
    // toward progress with a date that isn't real.
    const completedAtMs = data.completedAt?.toMillis?.() ?? data.updatedAt?.toMillis?.() ?? d.createTime.toMillis()
    return {
      sessionId: d.id,
      caseType: normalizeCaseType(data.caseId ? caseTypeById.get(data.caseId) ?? null : null),
      completedAtMs,
      createdAtMs: data.createdAt?.toMillis?.() ?? d.createTime.toMillis(),
      isRated: ratedLobbyIds.has(d.id),
    }
  })
  const countedSessions = filterCountedSessions(candidateSessions, config)
  const today = startOfDay(localMidnightMs != null ? new Date(localMidnightMs) : new Date())

  const cacheRef = adminDb.collection('goalInsightCache').doc(caller.uid)
  const signature = buildInsightSignature(config, countedSessions, today)
  const cacheSnap = await cacheRef.get()
  const cached = cacheSnap.data() as { signature: string; insight: CachedInsight | null } | undefined
  if (cached && cached.signature === signature) {
    console.log('[goal-insight] cache hit, no new data since last computed', { uid: caller.uid, signature })
    return jsonOk({ insight: cached.insight })
  }

  const flow = resolveFlow(config)
  const done = countedSessions.length

  // Resolve current deterministic state for redundancy checks (mirrors the
  // client's own state resolution, but only needs the total-side state).
  const start = parseDMY(config.startDate)
  const end = parseDMY(config.endDate)
  let currentState: import('@/lib/goalTracker/engine').GoalState = 'zero'
  if (flow === 1 || (flow === 3 && start && end)) {
    if (start && end) {
      const pace = classifyPace(done, config.totalCases, start, end, today)
      const dateHasPassed = today.getTime() > end.getTime()
      currentState = resolveTotalState(done, config.totalCases, pace, pace.daysRemaining, dateHasPassed)
    }
  } else {
    currentState = done === 0 ? 'zero' : done >= config.totalCases ? 'complete' : 'inProgress'
  }

  const candidates = computeShapeCandidates({
    countedSessions,
    config,
    currentState,
    today,
  })

  if (candidates.length === 0) {
    console.log('[goal-insight] zero candidates', { uid: caller.uid, done, sessionsCount: candidateSessions.length })
    await cacheRef.set({ signature, insight: null })
    return jsonOk({ insight: null })
  }

  const deterministicCardNumbers = [String(done), String(config.totalCases)]

  try {
    const { winningCandidate } = await callVertexRank(candidates, lastShownShapeId ?? null)
    console.log('[goal-insight] candidates and winner', {
      uid: caller.uid,
      candidateCount: candidates.length,
      candidateShapeIds: candidates.map((c) => c.shapeId),
      winningShapeId: winningCandidate.shapeId,
      winningData: winningCandidate.data,
    })
    let result = await callVertexFill(winningCandidate)

    if (!validateInsight(result.text, deterministicCardNumbers, winningCandidate.data)) {
      console.log('[goal-insight] first fill failed validation', { uid: caller.uid, text: result.text })
      result = await callVertexFill(winningCandidate, { stricter: true })
      if (!validateInsight(result.text, deterministicCardNumbers, winningCandidate.data)) {
        console.log('[goal-insight] retry also failed validation', { uid: caller.uid, text: result.text })
        // Cached deliberately: retrying against the SAME data is unlikely to
        // pass validation differently, so don't keep burning Vertex calls on
        // repeat clicks until something actually changes.
        await cacheRef.set({ signature, insight: null })
        return jsonOk({ insight: null })
      }
    }

    const insight: CachedInsight = {
      text: result.text,
      shapeId: winningCandidate.shapeId,
      dimension: winningCandidate.dimension,
      targetType: winningCandidate.targetType ?? null,
    }
    console.log('[goal-insight] shipped insight', { uid: caller.uid, shapeId: winningCandidate.shapeId, text: result.text })
    await cacheRef.set({ signature, insight })
    return jsonOk({ insight })
  } catch (err) {
    console.log('[goal-insight] vertex call threw', { uid: caller.uid, error: err instanceof Error ? err.message : String(err) })
    // Not cached — a transient failure (network blip, Vertex hiccup)
    // shouldn't lock the user out of a retry until new data shows up.
    return jsonOk({ insight: null })
  }
})

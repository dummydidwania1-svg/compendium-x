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
import { FieldPath } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { goalConfigSchema, type GoalConfig } from '@/lib/firebase/schema'
import { computeShapeCandidates } from '@/lib/goalTracker/insightShapes'
import { callVertexFill, callVertexRank, validateInsight } from '@/lib/goalTracker/vertexInsight'
import { filterCountedSessions, type CountedSession } from '@/lib/goalTracker/goalCountFilter'
import { normalizeCaseType } from '@/lib/dashboard/live'
import { resolveTotalState, classifyPace, parseDMY, resolveFlow, startOfDay, deriveImpliedTotal, type CadenceUnit } from '@/lib/goalTracker/engine'

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

/**
 * Why an insight couldn't be produced. 'zero_candidates' is deterministic and
 * safe to message ("not enough rhythm yet"); the others get a softer generic.
 */
type InsightReason = 'zero_candidates' | 'retry_exhausted' | 'unavailable'

export const POST = authenticatedRoute('/api/goal-insight', async (request, caller) => {
  const { lastShownShapeId, localMidnightMs } = await parseBody(request, goalInsightInput)

  const goalSnap = await adminDb.collection('goals').doc(caller.uid).get()
  if (!goalSnap.exists) return jsonOk({ insight: null })
  const configResult = goalConfigSchema.safeParse(goalSnap.data())
  if (!configResult.success) return jsonOk({ insight: null })
  const config = configResult.data

  // Field projections + runaway bounds: downstream only consumes caseId and
  // timestamps from sessions, and lobbyId/isUnrated from evaluations — yet the
  // unprojected queries used to pull FULL documents (merged transcripts,
  // recording metadata, notes) for a user's entire history on every call.
  // Limits are generous safety valves (no real goal approaches these); they
  // just stop a pathological history from an unbounded read.
  const [sessionsSnap, evaluationsSnap] = await Promise.all([
    adminDb
      .collection('sessions')
      .where('candidateId', '==', caller.uid)
      .where('status', '==', 'completed')
      .select('caseId', 'completedAt', 'updatedAt')
      .limit(1000)
      .get(),
    adminDb
      .collection('evaluations')
      .where('candidateId', '==', caller.uid)
      .select('lobbyId', 'isUnrated')
      .limit(2000)
      .get(),
  ])

  // Batched `in` reads (chunks of 30, Firestore's IN limit) replace the old
  // one-point-read-per-distinct-case pattern that scaled O(distinct cases).
  const caseIds = [...new Set(sessionsSnap.docs.map((d) => d.data().caseId).filter(Boolean))] as string[]
  const caseTypeById = new Map<string, string>()
  for (let i = 0; i < caseIds.length; i += 30) {
    const chunk = caseIds.slice(i, i + 30)
    if (chunk.length === 0) continue
    try {
      const snap = await adminDb
        .collection('cases')
        .where(FieldPath.documentId(), 'in', chunk)
        .select('case_type')
        .get()
      for (const doc of snap.docs) {
        caseTypeById.set(doc.id, doc.data()?.case_type ?? 'General')
      }
    } catch {
      // Fall back to per-id point reads for this chunk only — a malformed id
      // in an IN clause fails the whole query.
      await Promise.all(
        chunk.map(async (caseId) => {
          if (caseTypeById.has(caseId)) return
          try {
            const snap = await adminDb.collection('cases').doc(caseId).get()
            caseTypeById.set(caseId, snap.data()?.case_type ?? 'General')
          } catch {
            caseTypeById.set(caseId, 'General')
          }
        }),
      )
    }
  }

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
  const cached = cacheSnap.data() as { signature: string; insight: CachedInsight | null; reason?: InsightReason } | undefined
  if (cached && cached.signature === signature) {
    console.log('[goal-insight] cache hit, no new data since last computed', { uid: caller.uid, signature })
    return jsonOk({ insight: cached.insight, reason: cached.insight ? undefined : (cached.reason ?? 'unavailable') })
  }

  const flow = resolveFlow(config)
  const done = countedSessions.length

  // Resolve current deterministic state for redundancy checks (mirrors the
  // client's own state resolution, but only needs the total-side state).
  const start = parseDMY(config.startDate)
  const end = parseDMY(config.endDate)
  // Flow 3's real finish line is DERIVED from cadence × dates — AdjustGoalPanel
  // deliberately never rewrites stored totalCases on quick-adjust (editing it
  // there would be a silent no-op), so reasoning against config.totalCases
  // would describe a finish line the card no longer shows. Mirror the client's
  // deriveImpliedTotal exactly.
  const effectiveTotal =
    flow === 3 && start && end
      ? deriveImpliedTotal(
          config.recurringCount,
          config.recurringEvery,
          config.recurringUnit as CadenceUnit,
          start,
          end,
        )
      : config.totalCases
  let currentState: import('@/lib/goalTracker/engine').GoalState = 'zero'
  if ((flow === 1 || (flow === 3 && start && end)) && effectiveTotal > 0) {
    if (start && end) {
      const pace = classifyPace(done, effectiveTotal, start, end, today)
      const dateHasPassed = today.getTime() > end.getTime()
      currentState = resolveTotalState(done, effectiveTotal, pace, pace.daysRemaining, dateHasPassed)
    }
  } else if (effectiveTotal > 0) {
    // Total-side-only shapes (Flow 2 flat no-deadline, Flow 5 cadence+total
    // milestone). Guarded on effectiveTotal > 0: an untotaled habit goal
    // (Flow 4) must never read as 'complete' just because done >= 0.
    currentState = done >= effectiveTotal ? 'complete' : done === 0 ? 'zero' : 'inProgress'
  } else {
    currentState = done === 0 ? 'zero' : 'inProgress'
  }

  const candidates = computeShapeCandidates({
    countedSessions,
    config,
    currentState,
    today,
    effectiveTotal,
  })

  // Machine-readable reason for empty results, so the client can show an
  // honest inline message instead of silently reverting (which read as a
  // broken button — worst for brand-new users who hit this every click).
  if (candidates.length === 0) {
    console.log('[goal-insight] zero candidates', { uid: caller.uid, done, sessionsCount: candidateSessions.length })
    await cacheRef.set({ signature, insight: null, reason: 'zero_candidates' })
    return jsonOk({ insight: null, reason: 'zero_candidates' })
  }

  // Validation anchors: the two numbers the card deterministically shows.
  // Uses the SAME effective total the state above used — for Flow 3 that's
  // the derived finish line, not the possibly-stale stored field.
  const deterministicCardNumbers = [String(done), String(effectiveTotal)]

  // What the deterministic card currently says, so the fill model can
  // complement it instead of restating or contradicting it.
  const cardContext = `Goal state: ${currentState}. Progress: ${done} of ${effectiveTotal || 'open-ended'} cases${
    config.hasEndDate && end ? `, ${Math.max(0, Math.round((end.getTime() - today.getTime()) / 86_400_000))} days to deadline` : ''
  }.`

  const tryFill = async (candidate: (typeof candidates)[number], stricter: boolean) => {
    const result = await callVertexFill(candidate, { stricter, cardContext })
    const ok = validateInsight(result.text, deterministicCardNumbers, candidate.data)
    return { text: result.text as string, candidate, ok }
  }

  try {
    const { winningCandidate } = await callVertexRank(candidates, lastShownShapeId ?? null)
    console.log('[goal-insight] candidates and winner', {
      uid: caller.uid,
      candidateCount: candidates.length,
      candidateShapeIds: candidates.map((c) => c.shapeId),
      winningShapeId: winningCandidate.shapeId,
      winningData: winningCandidate.data,
    })

    let attempt = await tryFill(winningCandidate, false)
    if (!attempt.ok) {
      console.log('[goal-insight] first fill failed validation', { uid: caller.uid, text: attempt.text })
      attempt = await tryFill(winningCandidate, true)
    }
    if (!attempt.ok) {
      // Second-ranked fallback before giving up: if the WINNING shape's data
      // is inherently unsayable under validation rules, one unlucky model
      // stretch used to freeze the feature until data changed.
      const runnerUp = [...candidates]
        .filter((c) => c.shapeId !== winningCandidate.shapeId)
        .sort((a, b) => b.magnitude - a.magnitude)[0]
      if (runnerUp) {
        console.log('[goal-insight] falling back to runner-up', { uid: caller.uid, runnerUpShapeId: runnerUp.shapeId })
        const runnerAttempt = await tryFill(runnerUp, true)
        if (runnerAttempt.ok) attempt = runnerAttempt
      }
    }
    if (!attempt.ok) {
      console.log('[goal-insight] all fill attempts failed validation', { uid: caller.uid })
      await cacheRef.set({ signature, insight: null, reason: 'retry_exhausted' })
      return jsonOk({ insight: null, reason: 'retry_exhausted' })
    }

    const insight: CachedInsight = {
      text: attempt.text,
      shapeId: attempt.candidate.shapeId,
      dimension: attempt.candidate.dimension,
      targetType: attempt.candidate.targetType ?? null,
    }
    console.log('[goal-insight] shipped insight', { uid: caller.uid, shapeId: insight.shapeId, text: insight.text })
    await cacheRef.set({ signature, insight })
    return jsonOk({ insight })
  } catch (err) {
    console.log('[goal-insight] vertex call threw', { uid: caller.uid, error: err instanceof Error ? err.message : String(err) })
    // Not cached — a transient failure (network blip, Vertex hiccup)
    // shouldn't lock the user out of a retry until new data shows up.
    return jsonOk({ insight: null, reason: 'unavailable' })
  }
})

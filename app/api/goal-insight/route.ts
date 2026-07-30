/**
 * POST /api/goal-insight
 *
 * Server-side, on-demand only (never auto-fires): computes the ~25 AI-insight
 * shape candidates for the caller's active goal, ranks them via Vertex AI
 * (gemini-3.6-flash), fills the winning shape into a short buddy-tone
 * sentence, validates it, retries once with a stricter prompt on failure,
 * then gives up cleanly. Zero-candidates and retry-exhausted both return
 * `{ insight: null }` — the client treats both identically (silent revert to
 * idle "Ask Tracker").
 */
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { goalConfigSchema, goalHistoryEntrySchema } from '@/lib/firebase/schema'
import { computeShapeCandidates, type EvaluationScoreRow } from '@/lib/goalTracker/insightShapes'
import { callVertexFill, callVertexRank, validateInsight } from '@/lib/goalTracker/vertexInsight'
import { filterCountedSessions, type CountedSession } from '@/lib/goalTracker/goalCountFilter'
import { normalizeCaseType } from '@/lib/dashboard/live'
import { resolveTotalState, classifyPace, parseDMY, resolveFlow, startOfDay } from '@/lib/goalTracker/engine'

export const runtime = 'nodejs'

const goalInsightInput = z.object({
  lastShownShapeId: z.string().nullable().optional(),
})

export const POST = authenticatedRoute('/api/goal-insight', async (request, caller) => {
  const { lastShownShapeId } = await parseBody(request, goalInsightInput)

  const goalSnap = await adminDb.collection('goals').doc(caller.uid).get()
  if (!goalSnap.exists) return jsonOk({ insight: null })
  const configResult = goalConfigSchema.safeParse(goalSnap.data())
  if (!configResult.success) return jsonOk({ insight: null })
  const config = configResult.data

  const [sessionsSnap, evaluationsSnap, historySnap] = await Promise.all([
    adminDb.collection('sessions').where('candidateId', '==', caller.uid).where('status', '==', 'completed').get(),
    adminDb.collection('evaluations').where('candidateId', '==', caller.uid).get(),
    adminDb.collection('goalHistory').doc(caller.uid).collection('entries').get(),
  ])

  const caseIds = [...new Set(sessionsSnap.docs.map((d) => d.data().caseId).filter(Boolean))] as string[]
  const caseTypeById = new Map<string, string>()
  await Promise.all(
    caseIds.map(async (caseId) => {
      const snap = await adminDb.collection('cases').doc(caseId).get()
      caseTypeById.set(caseId, snap.data()?.case_type ?? 'General')
    }),
  )

  const evaluations: EvaluationScoreRow[] = evaluationsSnap.docs.map((d) => {
    const data = d.data()
    return {
      lobbyId: data.lobbyId ?? null,
      createdAtMs: data.createdAt?.toMillis?.() ?? 0,
      structureScore: data.structureScore ?? null,
      understandingScore: data.understandingScore ?? null,
      deliveryScore: data.deliveryScore ?? null,
      creativityScore: data.creativityScore ?? null,
    }
  })
  const ratedLobbyIds = new Set(
    evaluationsSnap.docs.filter((d) => d.data().lobbyId && !d.data().isUnrated).map((d) => d.data().lobbyId as string),
  )

  const candidateSessions: CountedSession[] = sessionsSnap.docs.map((d) => {
    const data = d.data()
    return {
      sessionId: d.id,
      caseType: normalizeCaseType(data.caseId ? caseTypeById.get(data.caseId) ?? null : null),
      completedAtMs: data.completedAt?.toMillis?.() ?? data.updatedAt?.toMillis?.() ?? 0,
      createdAtMs: data.createdAt?.toMillis?.() ?? 0,
      isRated: ratedLobbyIds.has(d.id),
    }
  })
  const countedSessions = filterCountedSessions(candidateSessions, config)

  const goalHistory = historySnap.docs
    .map((d) => goalHistoryEntrySchema.safeParse(d.data()))
    .filter((r) => r.success)
    .map((r) => r.data)

  const today = startOfDay(new Date())
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
    evaluations,
    goalHistory,
    config,
    currentState,
    today,
  })

  if (candidates.length === 0) {
    console.log('[goal-insight] zero candidates', { uid: caller.uid, done, sessionsCount: candidateSessions.length })
    return jsonOk({ insight: null })
  }

  const deterministicCardNumbers = [String(done), String(config.totalCases)]

  try {
    const { winningCandidate } = await callVertexRank(candidates, lastShownShapeId ?? null)
    let result = await callVertexFill(winningCandidate)

    if (!validateInsight(result.text, deterministicCardNumbers)) {
      console.log('[goal-insight] first fill failed validation', { uid: caller.uid, text: result.text })
      result = await callVertexFill(winningCandidate, { stricter: true })
      if (!validateInsight(result.text, deterministicCardNumbers)) {
        console.log('[goal-insight] retry also failed validation', { uid: caller.uid, text: result.text })
        return jsonOk({ insight: null })
      }
    }

    return jsonOk({ insight: { text: result.text, shapeId: winningCandidate.shapeId } })
  } catch (err) {
    console.log('[goal-insight] vertex call threw', { uid: caller.uid, error: err instanceof Error ? err.message : String(err) })
    return jsonOk({ insight: null })
  }
})

/**
 * POST /api/coach-insight
 *
 * Server-side proxy for Coach Insight, replacing the frozen client-direct
 * Gemini call. Follows the goal-insight / feedback-analyser pattern:
 * authenticatedRoute + zod + in-memory sliding-window rate limit + server-only
 * key.
 *
 * State: the previous output is persisted per user (coachState/{uid}) so the
 * prompt's variety rules survive page reloads without any chat semantics —
 * the card auto-fires on mount and debounces on filter changes, exactly as it
 * was originally programmed, and the server rate limit is the cost boundary.
 */
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { authenticatedRoute } from '@/lib/api/route'
import { jsonOk, parseBody, BodyError } from '@/lib/api/responses'
import { callGeminiCoachServer, type CoachOutput } from '@/lib/coachServer'

export const runtime = 'nodejs'

const paramAvgSchema = z.object({
  structure: z.number(),
  analysis: z.number(),
  creativity: z.number(),
  delivery: z.number(),
  caseScore: z.number(),
})

const bodySchema = z.object({
  today: z.string().max(32),
  activeFiltersLabel: z.string().max(300),
  totalRatedCases: z.number().int().min(0).max(10_000),
  globalAvg: paramAvgSchema,
  filteredCount: z.number().int().min(0),
  filteredAvg: paramAvgSchema.nullable(),
  currentStreak: z.object({
    length: z.number().int().min(0).max(3_650),
    startDate: z.string().max(32),
    endDate: z.string().max(32),
  }),
  streakBreaks: z.array(z.string().max(32)).max(400),
  streakOverlapsFilter: z.boolean(),
  outliers: z
    .array(
      z.object({
        id: z.string().max(64),
        date: z.string().max(32),
        type: z.string().max(64),
        level: z.string().max(32),
        structure: z.unknown(),
        analysis: z.unknown(),
        creativity: z.unknown(),
        delivery: z.unknown(),
      })
    )
    .max(20),
  casesCsv: z.string().max(400_000),
})

// ── Rate limiting ──────────────────────────────────────────────────────────────
const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 10
const hitLog = new Map<string, number[]>()

function rateLimit(uid: string): void {
  const now = Date.now()
  const hits = (hitLog.get(uid) ?? []).filter((t) => now - t < WINDOW_MS)
  if (hits.length >= MAX_REQUESTS_PER_WINDOW) {
    throw new BodyError(429, 'rate_limited', 'Too many requests. Wait a few seconds and try again.')
  }
  hits.push(now)
  hitLog.set(uid, hits)
  if (hitLog.size > 5_000) {
    for (const [key, times] of hitLog) {
      if (times.every((t) => now - t >= WINDOW_MS)) hitLog.delete(key)
    }
  }
}

interface StoredCoachState {
  headline?: string
  insight?: string
  action?: string
}

export const POST = authenticatedRoute('/api/coach-insight', async (request, caller) => {
  rateLimit(caller.uid)

  // Zero rated cases has nothing to narrate — the client gates this too, but
  // never spend tokens on an empty corpus.
  const body = await parseBody(request, bodySchema)
  if (body.totalRatedCases === 0) {
    return jsonOk({
      output: null,
      message: 'Your coach unlocks once you complete your first rated case.',
    })
  }

  const stateRef = adminDb.collection('coachState').doc(caller.uid)
  const stateSnap = await stateRef.get()
  const stored = stateSnap.data() as StoredCoachState | undefined
  const lastOutput: CoachOutput | null =
    stored?.headline && stored?.insight && stored?.action
      ? { headline: stored.headline, insight: stored.insight, action: stored.action }
      : null

  try {
    const output = await callGeminiCoachServer(body, lastOutput)

    // Best-effort persistence for the next call's variety check.
    await stateRef.set(
      { ...output, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )

    return jsonOk({ output })
  } catch (err) {
    // Parse/contract failures from the model are retried once — temperature 0
    // makes identical failures likely, but transient API errors resolve.
    console.log('[coach-insight] first attempt failed', {
      uid: caller.uid,
      error: err instanceof Error ? err.message : String(err),
    })
    const output = await callGeminiCoachServer(body, lastOutput)
    await stateRef.set(
      { ...output, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    return jsonOk({ output })
  }
})

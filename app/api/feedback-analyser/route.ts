/**
 * POST /api/feedback-analyser
 *
 * Server-side proxy for the Feedback Analyser chat. Replaces the old
 * browser-direct Gemini call that shipped NEXT_PUBLIC_GEMINI_API_KEY in the
 * client bundle — anyone could have lifted it from the deployed JS and drained
 * the quota. Follows the goal-insight route's pattern: authenticatedRoute +
 * structured errors + server-only key.
 *
 * The client computes FAMetrics (it already owns that data via its dashboard
 * subscription) and posts { metrics, history, question }. The server adds:
 *   - per-user rate limiting (in-memory sliding window; single-region deploy,
 *     acceptable for an interactive chat feature — not a billing boundary)
 *   - body validation
 *   - quote verification + corpus windowing (see feedbackAnalyserServer)
 */
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { authenticatedRoute } from '@/lib/api/route'
import { jsonOk, parseBody, BodyError } from '@/lib/api/responses'
import { callFeedbackAnalyserServer } from '@/lib/feedbackAnalyserServer'

export const runtime = 'nodejs'
// A deep dive ships a full transcript (up to 60k chars) on top of the corpus,
// and the model now reasons before answering. That combination can outrun the
// platform's default function timeout, which surfaces to the user as a generic
// connection error even though nothing is wrong with their connection.
export const maxDuration = 120

const MAX_MESSAGES = 30

const faBlockSchema = z.object({
  role: z.enum(['user', 'agent']),
  text: z.string().max(20_000),
})

const metricsSchema = z.object({
  totalCases: z.number().int().min(0).max(10_000),
  dateRange: z.object({ start: z.string().max(32), end: z.string().max(32) }),
  globalAvg: z.object({
    structure: z.number(),
    analysis: z.number(),
    creativity: z.number(),
    delivery: z.number(),
    score: z.number(),
  }),
  weakestParam: z.enum(['structure', 'analysis', 'creativity', 'delivery']),
  strongestParam: z.enum(['structure', 'analysis', 'creativity', 'delivery']),
  mostImprovedParam: z.enum(['structure', 'analysis', 'creativity', 'delivery']),
  flatParam: z.enum(['structure', 'analysis', 'creativity', 'delivery']).nullable(),
  weakestType: z.string().max(64),
  typeBreakdown: z.record(z.string(), z.object({ avgScore: z.number(), count: z.number(), weakestParam: z.string() })),
  hardAvgScore: z.number(),
  mediumAvgScore: z.number(),
  easyAvgScore: z.number(),
  recentAvgScore: z.number(),
  streakDays: z.number().int().min(0),
  allCasesCSV: z.string().max(400_000),
  feedbackEntries: z
    .array(
      z.object({
        key: z.string().min(1).max(128),
        label: z.string().max(200),
        date: z.string().max(32),
        caseType: z.string().max(64),
        level: z.string().max(32),
        notes: z.string().max(20_000).nullable(),
        verbal: z.string().max(40_000).nullable(),
        lobbyId: z.string().max(200).nullable(),
        digest: z.string().max(4_000).nullable(),
      })
    )
    .max(500),
  feedbackCount: z.number().int().min(0),
  executionSummaries: z
    .array(
      z.object({
        key: z.string().max(128),
        label: z.string().max(200),
        date: z.string().max(32),
        overallNote: z.string().max(4_000),
        findings: z
          .array(z.object({ issue: z.string().max(300), momentDescription: z.string().max(1_000) }))
          .max(8),
      })
    )
    .max(300),
  executionSignals: z
    .object({
      sessionsAnalyzed: z.number().int().min(0),
      avgLongSilences: z.number().nullable(),
      avgOpeningQuestions: z.number().nullable(),
      avgHedgeDensity: z.number().nullable(),
      avgMathInsightLinkage: z.number().nullable(),
      lowLinkageSessions: z.number().int().min(0),
    })
    .nullable(),
  dynamicQuestions: z.array(z.string().max(300)).max(10),
  initialGreeting: z.string().max(2_000),
})

const bodySchema = z.object({
  metrics: metricsSchema,
  history: z.array(faBlockSchema).max(MAX_MESSAGES),
  question: z.string().min(1).max(4_000),
  /**
   * Optional deep-dive target: the evaluation key of a specific case. When
   * present, the route pulls that session's FULL transcript (server-side,
   * Admin SDK) and grounds this one answer in the entire conversation rather
   * than the closing-tail excerpt.
   */
  focusKey: z.string().min(1).max(128).optional(),
})

// ── Rate limiting (per-uid sliding window) ─────────────────────────────────────
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
  // Opportunistic GC so idle uids don't accumulate forever.
  if (hitLog.size > 5_000) {
    for (const [key, times] of hitLog) {
      if (times.every((t) => now - t >= WINDOW_MS)) hitLog.delete(key)
    }
  }
}

export const POST = authenticatedRoute('/api/feedback-analyser', async (request, caller) => {
  rateLimit(caller.uid)

  const { metrics, history, question, focusKey } = await parseBody(request, bodySchema)

  // Zero rated cases has nothing at all to work with — the client gates this
  // too, but never spend tokens on it. NOTE: rated cases with no written/
  // spoken feedback still proceed; the prompt handles that branch explicitly
  // (scores + execution-signals report with feedback-priming tips).
  if (metrics.totalCases === 0) {
    return jsonOk({
      response: {
        blocks: [
          {
            type: 'paragraph',
            text: 'There is no interviewer feedback to analyze yet. Complete a case and submit ratings first.',
          },
        ],
        viz: { type: 'none', title: '' },
      },
    })
  }

  // ── Deep-dive focus: pull the FULL transcript for the requested case ──────
  let focusedTranscript: { label: string; transcript: string } | null = null
  if (focusKey) {
    const entry = metrics.feedbackEntries.find((f) => f.key === focusKey)
    const lobbyId = entry?.lobbyId
    if (!entry || !lobbyId) {
      throw new BodyError(400, 'unknown_focus_case', 'That case could not be found in your history.')
    }

    try {
      const snap = await adminDb.collection('sessions').doc(lobbyId).get()
      const data = snap.data()
      // Ownership check: the client supplies lobbyId, so never trust it —
      // only hand back a transcript when this caller actually participated
      // in that session.
      const participantIds = [data?.candidateId, data?.interviewerId].filter(Boolean)
      if (participantIds.length === 0 || !participantIds.includes(caller.uid)) {
        throw new BodyError(400, 'unknown_focus_case', 'That case could not be found in your history.')
      }
      const rawTurns: unknown =
        data?.mergedTranscriptTurns ?? (data?.recording as { transcriptTurns?: unknown } | undefined)?.transcriptTurns

      if (!Array.isArray(rawTurns) || rawTurns.length === 0) {
        throw new BodyError(
          409,
          'no_transcript',
          'This case ran without a usable recording, so there is no transcript to deep-dive. Its feedback notes are still included in every answer.',
        )
      }

      const formatted = (rawTurns as Array<Record<string, unknown>>)
        .map((t) => {
          const offset = typeof t.offsetMs === 'number' ? Math.round(t.offsetMs / 1000) : null
          const role =
            t.role === 'candidate' ? 'Candidate' : t.role === 'interviewer' ? 'Interviewer' : String(t.role ?? 'S?')
          const ts = offset != null ? `[${Math.floor(offset / 60)}:${String(offset % 60).padStart(2, '0')}] ` : ''
          return `${ts}${role}: ${typeof t.text === 'string' ? t.text : ''}`
        })
        .filter((line) => line.trim().length > 0)
        .join('\n')

      // Generous cap — even a two-hour stuck session stays within budget.
      const transcript = formatted.length > 60_000 ? `${formatted.slice(0, 60_000)}\n…[truncated]` : formatted
      focusedTranscript = { label: entry.label, transcript }
    } catch (err) {
      if (err instanceof BodyError) throw err
      console.log('[feedback-analyser] focus fetch failed', {
        uid: caller.uid,
        lobbyId,
        error: err instanceof Error ? err.message : String(err),
      })
      // Fall through without the focused block rather than failing the chat.
    }
  }

  const response = await callFeedbackAnalyserServer(metrics, history, question, focusedTranscript)
  return jsonOk({ response })
})

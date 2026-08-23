import type { DashboardCaseEntry } from '@/lib/dashboard/live'
import { computeCaseSignals, type CaseSignals } from '@/lib/caseSignals'

export interface CaseFeedback {
  /** Stable unique key (evaluation doc id) — unambiguous even for repeated cases. */
  key: string
  /** Human-facing label shown in citations, e.g. "Banking On You". */
  label: string
  date: string
  caseType: string
  level: string
  notes: string | null
  verbal: string | null
  /** For on-demand deep dives: which session doc holds this case's full transcript. */
  lobbyId: string | null
  /** One-line structured transcript digest (Cloud Function pass), null when unavailable. */
  digest: string | null
}

/** Aggregated deterministic execution signals across all timed sessions. */
export interface ExecutionSignalSummary {
  sessionsAnalyzed: number
  avgLongSilences: number | null
  avgOpeningQuestions: number | null
  avgHedgeDensity: number | null
  avgMathInsightLinkage: number | null
  lowLinkageSessions: number
}

type Param = 'structure' | 'analysis' | 'creativity' | 'delivery'

export interface FAMetrics {
  totalCases: number
  dateRange: { start: string; end: string }
  globalAvg: { structure: number; analysis: number; creativity: number; delivery: number; score: number }
  weakestParam: Param
  strongestParam: Param
  mostImprovedParam: Param
  flatParam: Param | null
  weakestType: string
  typeBreakdown: Record<string, { avgScore: number; count: number; weakestParam: string }>
  hardAvgScore: number
  mediumAvgScore: number
  easyAvgScore: number
  recentAvgScore: number
  streakDays: number
  allCasesCSV: string
  feedbackEntries: CaseFeedback[]
  feedbackCount: number
  executionSummaries: Array<{
    key: string
    label: string
    date: string
    overallNote: string
    findings: Array<{ issue: string; momentDescription: string }>
  }>
  executionSignals: ExecutionSignalSummary | null
  dynamicQuestions: string[]
  initialGreeting: string
}

const mean = (arr: (number | null)[]): number => {
  const nums = arr.filter((v): v is number => typeof v === 'number')
  return nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 0
}

function toDS(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function computeStreak(entries: DashboardCaseEntry[]): number {
  const caseDates = new Set(entries.map((c) => c.date))
  const today = new Date()
  let streak = 0
  const d = new Date(today)
  while (caseDates.has(toDS(d))) {
    streak += 1
    d.setDate(d.getDate() - 1)
  }
  return streak
}

/**
 * Compacts the Cloud Function's transcriptDigest into one prompt line. Reads
 * every field defensively — the shape is owned by the digest prompt, and
 * older sessions have no digest at all.
 */
function digestSummaryLine(d: Record<string, unknown> | null): string | null {
  if (!d || typeof d !== 'object') return null
  const parts: string[] = []

  const opening = d.opening as { clarifyingQuestions?: unknown; objectiveConfirmed?: unknown } | undefined
  if (opening) {
    const qCount = Array.isArray(opening.clarifyingQuestions) ? opening.clarifyingQuestions.length : 0
    const firstQ =
      Array.isArray(opening.clarifyingQuestions) && typeof opening.clarifyingQuestions[0] === 'string'
        ? ` (e.g. "${truncateStr(opening.clarifyingQuestions[0] as string, 60)}")`
        : ''
    parts.push(`opening: asked ${qCount} clarifying question${qCount === 1 ? '' : 's'}${firstQ}, objective ${opening.objectiveConfirmed === true ? 'confirmed' : 'not explicitly confirmed'}`)
  }

  const fw = d.framework as { approach?: unknown; bucketsMentioned?: unknown } | undefined
  if (fw && typeof fw.approach === 'string' && fw.approach !== 'unclear') {
    parts.push(`framework: ${fw.approach}${typeof fw.bucketsMentioned === 'number' && fw.bucketsMentioned > 0 ? ` (${fw.bucketsMentioned} buckets)` : ''}`)
  }

  const mn = d.mathNarration as { approachStatedFirst?: unknown; linkedImplications?: unknown; exampleMoment?: unknown } | undefined
  if (mn) {
    const links = typeof mn.linkedImplications === 'number' ? mn.linkedImplications : 0
    const ex = typeof mn.exampleMoment === 'string' && mn.exampleMoment !== 'none' ? ` ("${truncateStr(mn.exampleMoment, 70)}")` : ''
    parts.push(`math narration: approach stated first = ${mn.approachStatedFirst === true ? 'yes' : 'no'}, implications drawn after ${links} calculation${links === 1 ? '' : 's'}${ex}`)
  }

  const syn = d.synthesis as { answerFirst?: unknown; gaveRecommendation?: unknown; includedNextSteps?: unknown; quote?: unknown } | undefined
  if (syn) {
    const q = typeof syn.quote === 'string' && syn.quote !== 'none' ? ` ("${truncateStr(syn.quote, 80)}")` : ''
    parts.push(`synthesis: recommendation ${syn.gaveRecommendation === true ? 'given' : 'missing'}, answer-first = ${syn.answerFirst === true ? 'yes' : 'no'}, next steps = ${syn.includedNextSteps === true ? 'yes' : 'no'}${q}`)
  }

  const ad = d.adaptability as { redirects?: unknown; adaptedAfterRedirect?: unknown; example?: unknown } | undefined
  if (ad) {
    const r = typeof ad.redirects === 'number' ? ad.redirects : 0
    if (r > 0) {
      const ex = typeof ad.example === 'string' && ad.example !== 'none' ? ` ("${truncateStr(ad.example, 70)}")` : ''
      parts.push(`adaptability: ${r} interviewer redirect${r === 1 ? '' : 's'}, adapted = ${typeof ad.adaptedAfterRedirect === 'string' ? ad.adaptedAfterRedirect : 'unknown'}${ex}`)
    }
  }

  return parts.length > 0 ? parts.join('; ') : null
}

function truncateStr(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max).trimEnd()}…`
}

function feedbackEntriesFrom(entries: DashboardCaseEntry[]): CaseFeedback[] {
  const out: CaseFeedback[] = []
  for (const entry of entries) {
    const notes = entry.notes?.trim() || null
    const verbal = extractVerbalFeedback(entry)
    // Cases with neither written notes nor a verbal excerpt carry zero signal —
    // including them (with placeholder text) just wasted tokens and invited the
    // model to treat sentinels as content.
    if (!notes && !verbal) continue
    out.push({
      key: entry.evaluationId,
      label: entry.name || 'Untitled case',
      date: entry.date,
      caseType: entry.type,
      level: entry.level,
      notes,
      verbal,
      lobbyId: entry.lobbyId,
      digest: digestSummaryLine(entry.transcriptDigest),
    })
  }
  return out
}

function executionSummariesFrom(entries: DashboardCaseEntry[]) {
  return entries
    .filter((e) => e.executionAnalysis)
    .map((e) => ({
      key: e.evaluationId,
      label: e.name || 'Untitled case',
      date: e.date,
      overallNote: e.executionAnalysis!.overallNote,
      findings: (e.executionAnalysis!.findings ?? []).map((f) => ({
        issue: f.issue,
        momentDescription: f.momentDescription,
      })),
    }))
}

function aggregateExecutionSignals(entries: DashboardCaseEntry[]): ExecutionSignalSummary | null {
  const signals = entries
    .map((e) => computeCaseSignals(e.transcriptTurns as never))
    .filter((s): s is CaseSignals => !!s && s.timingAvailable)
  if (signals.length === 0) return null
  const avg = (vals: number[]): number | null =>
    vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null
  const linkageVals = signals.map((s) => s.mathInsightLinkage).filter((v): v is number => v != null)
  return {
    sessionsAnalyzed: signals.length,
    avgLongSilences: avg(signals.map((s) => s.longSilenceCount)),
    avgOpeningQuestions: avg(signals.map((s) => s.openingQuestionCount)),
    avgHedgeDensity: avg(signals.map((s) => s.hedgeDensity)),
    avgMathInsightLinkage: avg(linkageVals),
    lowLinkageSessions: linkageVals.filter((v) => v < 0.4).length,
  }
}

// "Verbal feedback" is not the interviewer's whole spoken commentary — there's
// no dedicated recording for that. It's the closing few minutes of the case
// recording itself, on the assumption that's roughly where wrap-up remarks
// tend to land. A flat fixed window would swallow most of a short case, so
// it's capped at a fraction of the case's own length too.
const VERBAL_WINDOW_MS = 5 * 60 * 1000
const VERBAL_WINDOW_MAX_FRACTION = 0.25

function extractVerbalFeedback(entry: DashboardCaseEntry): string | null {
  const { transcriptTurns, durationMs, transcript, transcriptPreview } = entry

  // Precise path: real per-turn timestamps exist (see TranscriptTurn / the
  // Cloud Function merge step) — slice by actual elapsed time.
  if (transcriptTurns && transcriptTurns.length > 0 && durationMs && durationMs > 0) {
    const windowMs = Math.min(VERBAL_WINDOW_MS, durationMs * VERBAL_WINDOW_MAX_FRACTION)
    const cutoff = durationMs - windowMs
    const tail = transcriptTurns.filter((t) => t.offsetMs >= cutoff)
    if (tail.length > 0) {
      return tail.map((t) => `${t.role === 'candidate' ? 'Candidate' : 'Interviewer'}: ${t.text}`).join('\n')
    }
  }

  // Approximate fallback for sessions that pre-date per-turn timing — a
  // proportional tail by character count instead of real elapsed time. Less
  // precise (speaking pace isn't perfectly uniform), but still a small,
  // closing-weighted excerpt rather than either the full transcript or nothing.
  const flat = transcript?.trim() || transcriptPreview?.trim()
  if (flat) {
    const tailChars = Math.max(300, Math.round(flat.length * VERBAL_WINDOW_MAX_FRACTION))
    return flat.slice(-tailChars)
  }

  return null
}

function generateDynamicQuestions(
  weakestType: string,
  streakDays: number,
  recentAvgScore: number,
  overallAvgScore: number
): string[] {
  const qs: string[] = []
  qs.push('What patterns recur in my feedback?')
  qs.push(`What do interviewers keep saying about ${weakestType}?`)
  if (streakDays >= 7 || recentAvgScore - overallAvgScore > 0.3) {
    qs.push('How has my feedback changed over time?')
  } else {
    qs.push('What has my feedback stopped flagging?')
  }
  return qs
}

export function computeFAMetrics(entries: DashboardCaseEntry[]): FAMetrics {
  // Exclude unrated entries from all analytics — they have no scores.
  const cases = [...entries].filter((e) => !e.isUnrated).sort((a, b) => a.date.localeCompare(b.date))
  const n = cases.length
  const params: Param[] = ['structure', 'analysis', 'creativity', 'delivery']

  if (n === 0) {
    return {
      totalCases: 0,
      dateRange: { start: '', end: '' },
      globalAvg: { structure: 0, analysis: 0, creativity: 0, delivery: 0, score: 0 },
      weakestParam: 'structure',
      strongestParam: 'structure',
      mostImprovedParam: 'structure',
      flatParam: null,
      weakestType: 'your cases',
      typeBreakdown: {},
      hardAvgScore: 0,
      mediumAvgScore: 0,
      easyAvgScore: 0,
      recentAvgScore: 0,
      streakDays: 0,
      allCasesCSV: '',
      feedbackEntries: [],
      feedbackCount: 0,
      executionSummaries: [],
      executionSignals: null,
      dynamicQuestions: [
        'What will this analyser do once I complete a case?',
        'How will interviewer notes appear here?',
        'What can I learn from transcripts over time?',
      ],
      initialGreeting:
        'Hi. Complete a case with interviewer ratings and I\u2019ll start finding the patterns in what they tell you. ' +
        'One tip so your very first session produces analyzable feedback: ask your interviewer to be specific about ' +
        'your structure, how you narrated math, and whether your recommendation was clear.',
    }
  }

  const globalAvg = {
    structure: mean(cases.map((c) => c.structure)),
    analysis: mean(cases.map((c) => c.analysis)),
    creativity: mean(cases.map((c) => c.creativity)),
    delivery: mean(cases.map((c) => c.delivery)),
    score: mean(cases.map((c) => c.score)),
  }

  const paramAvgs: Record<Param, number> = {
    structure: globalAvg.structure,
    analysis: globalAvg.analysis,
    creativity: globalAvg.creativity,
    delivery: globalAvg.delivery,
  }

  const weakestParam = params.reduce((a, b) => (paramAvgs[a] < paramAvgs[b] ? a : b))
  const strongestParam = params.reduce((a, b) => (paramAvgs[a] > paramAvgs[b] ? a : b))

  const firstSlice = cases.slice(0, Math.min(10, n))
  const lastSlice = cases.slice(Math.max(0, n - Math.min(10, n)))
  const deltas: Record<Param, number> = {
    structure: mean(lastSlice.map((c) => c.structure)) - mean(firstSlice.map((c) => c.structure)),
    analysis: mean(lastSlice.map((c) => c.analysis)) - mean(firstSlice.map((c) => c.analysis)),
    creativity: mean(lastSlice.map((c) => c.creativity)) - mean(firstSlice.map((c) => c.creativity)),
    delivery: mean(lastSlice.map((c) => c.delivery)) - mean(firstSlice.map((c) => c.delivery)),
  }
  const mostImprovedParam = params.reduce((a, b) => (deltas[a] > deltas[b] ? a : b))

  const half = Math.floor(n / 2)
  const firstHalf = cases.slice(0, half || n)
  const secondHalf = cases.slice(half || 0)
  const halfDeltas: Record<Param, number> = {
    structure: Math.abs(mean(secondHalf.map((c) => c.structure)) - mean(firstHalf.map((c) => c.structure))),
    analysis: Math.abs(mean(secondHalf.map((c) => c.analysis)) - mean(firstHalf.map((c) => c.analysis))),
    creativity: Math.abs(mean(secondHalf.map((c) => c.creativity)) - mean(firstHalf.map((c) => c.creativity))),
    delivery: Math.abs(mean(secondHalf.map((c) => c.delivery)) - mean(firstHalf.map((c) => c.delivery))),
  }
  const flatParam = params.find((p) => halfDeltas[p] < 0.3) ?? null

  const types = [...new Set(cases.map((c) => c.type))]
  const typeBreakdown: Record<string, { avgScore: number; count: number; weakestParam: string }> = {}
  for (const type of types) {
    const typedCases = cases.filter((c) => c.type === type)
    const scores = {
      structure: mean(typedCases.map((c) => c.structure)),
      analysis: mean(typedCases.map((c) => c.analysis)),
      creativity: mean(typedCases.map((c) => c.creativity)),
      delivery: mean(typedCases.map((c) => c.delivery)),
    }
    const weakest = (Object.entries(scores) as [string, number][]).reduce((a, b) => (a[1] < b[1] ? a : b))[0]
    typeBreakdown[type] = {
      avgScore: mean(typedCases.map((c) => c.score)),
      count: typedCases.length,
      weakestParam: weakest,
    }
  }
  const weakestType = types.reduce((a, b) => (typeBreakdown[a].avgScore < typeBreakdown[b].avgScore ? a : b))

  const easyAvgScore = mean(cases.filter((c) => c.level === 'Easy').map((c) => c.score))
  const mediumAvgScore = mean(cases.filter((c) => c.level === 'Medium').map((c) => c.score))
  const hardAvgScore = mean(cases.filter((c) => c.level === 'Hard').map((c) => c.score))
  const recentAvgScore = mean(cases.slice(-14).map((c) => c.score))
  const streakDays = computeStreak(cases)
  const feedbackEntries = feedbackEntriesFrom(cases)
  const executionSummaries = executionSummariesFrom(cases)
  const executionSignals = aggregateExecutionSignals(cases)

  // First column is the stable evaluation key so quote attribution can never
  // collide across repeated cases; the human label rides along for citations.
  const allCasesCSV = cases
    .map(
      (c) =>
        `${c.evaluationId},${escapeCsv(c.name || 'Untitled case')},${c.date},${c.type},${c.level},${c.structure},${c.analysis},${c.creativity},${c.delivery},${c.score}`
    )
    .join('\n')

  const dynamicQuestions = generateDynamicQuestions(weakestType, streakDays, recentAvgScore, globalAvg.score)
  const initialGreeting =
    `Hi. I've analyzed interviewer feedback across all ${n} of your rated sessions. ` +
    `${capitalize(mostImprovedParam)} shows the clearest improvement so far. ` +
    `Ask me what your interviewers are really saying.`

  return {
    totalCases: n,
    dateRange: { start: cases[0].date, end: cases[n - 1].date },
    globalAvg,
    weakestParam,
    strongestParam,
    mostImprovedParam,
    flatParam,
    weakestType,
    typeBreakdown,
    hardAvgScore,
    mediumAvgScore,
    easyAvgScore,
    recentAvgScore,
    streakDays,
    allCasesCSV,
    feedbackEntries,
    feedbackCount: feedbackEntries.length,
    executionSummaries,
    executionSignals,
    dynamicQuestions,
    initialGreeting,
  }
}

/** Minimal CSV field escape — labels can contain commas (case titles). */
function escapeCsv(value: string): string {
  return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value
}

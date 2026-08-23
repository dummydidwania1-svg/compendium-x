/**
 * Deterministic execution-signal extraction over timestamped transcript turns.
 *
 * Everything here is computed, not inferred by a model: silence gaps, opening
 * clarifying questions, hedge-language density, signposting, math→insight
 * linkage, and turn-length stats. These are the hard facts the Feedback
 * Analyser reasons ABOUT, and the objective backbone of the "How the case
 * ran" section — clearly separated from what interviewers SAID.
 *
 * Pure functions only: no Firebase, no server-only guard, so this runs on the
 * client (case detail) and is unit-testable in vitest.
 */

export interface SignalTurn {
  offsetMs: number | null
  text: string
  /** 'candidate' | 'interviewer' when authoritatively known; S1/S2 labels or undefined otherwise */
  role?: string
}

export interface CaseSignals {
  /** Count of silences >= 30s between consecutive turns, plus the longest in seconds. */
  longSilenceCount: number
  longestSilenceSec: number
  /** Clarifying questions asked in the opening segment (first ~20% of the case, capped 5 min). */
  openingQuestionCount: number
  /** Candidate hedge phrases per 100 spoken words. */
  hedgeDensity: number
  hedgePhrasesFound: string[]
  /** Explicit signpost/numbered-structure markers found (count + examples). */
  signpostCount: number
  /** Of the candidate's calculation-bearing turns, share followed by an insight link ("which suggests…"). 0-1, null when no calculations. */
  mathInsightLinkage: number | null
  calculationTurnCount: number
  /** Candidate share of total spoken words, 0-1. Null without role attribution. */
  candidateTalkRatio: number | null
  /** Mean candidate turn length in words. */
  avgCandidateTurnWords: number
  totalWords: number
  /** How roles were resolved: 'explicit' (remote per-track) | 'inferred' (S1/S2 heuristic) | 'none'. */
  roleMode: 'explicit' | 'inferred' | 'none'
  /** True when turns carry no usable timestamps — most timing signals disabled. */
  timingAvailable: boolean
}

const HEDGE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bi (?:guess|suppose|feel like maybe)\b/i, label: 'I guess' },
  { re: /\bmaybe we (?:could|should|can)\b/i, label: 'maybe we could' },
  { re: /\bpossibly\b/i, label: 'possibly' },
  { re: /\bsort of\b|\bkind of\b/i, label: 'sort of / kind of' },
  { re: /\bi'?m not sure but\b/i, label: "not sure but" },
  { re: /\bjust a thought\b/i, label: 'just a thought' },
]

const SIGNPOST_RE =
  /\b(?:three|four|two|3|4|2)\s+(?:main\s+)?(?:areas|buckets|parts|drivers|branches|things|reasons|sections)\b|\blet me start with\b|\bfirst(?:ly)?\b[,.]?\s+\bsecond(?:ly)?\b|\bi'?d like to explore\b/i

const CALC_RE = /(?:=|%|per\s+(?:unit|customer|employee)|\b(?:million|billion|thousand|crore|lakh)\b|\bmargin\b|\brevenue\s+(?:is|of)|\bcosts?\s+(?:are|of)|\bgrowth rate\b|\bmarket size\b)/i

const INSIGHT_LINK_RE =
  /(?:which|this|that|it)?\s*(?:suggests?|implies|means|tells (?:us|me)|indicates?|so what|points to|drives toward)/i

/** Silence threshold for "long pause" — prep literature: >30s reads as a black box. */
const LONG_SILENCE_MS = 30_000
/** Opening segment = first 20% of the case, capped at 5 minutes. */
const OPENING_WINDOW_MAX_MS = 5 * 60_000

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

/**
 * Resolve which turns belong to the candidate.
 * - Remote sessions carry authoritative roles ('candidate'/'interviewer').
 * - Split-screen sessions carry anonymous S1/S2 (ElevenLabs diarization,
 *   first-seen mapping). Heuristic: the speaker who opens the case — holds
 *   the clear majority of words in the first 90 seconds — is the interviewer
 *   reading the prompt; the other is the candidate. Marked 'inferred'.
 */
function resolveRoles(turns: SignalTurn[]): {
  isCandidate: Array<boolean | null>
  mode: 'explicit' | 'inferred' | 'none'
} {
  const explicit = turns.some((t) => t.role === 'candidate' || t.role === 'interviewer')
  if (explicit) {
    return {
      isCandidate: turns.map((t) =>
        t.role === 'candidate' ? true : t.role === 'interviewer' ? false : null,
      ),
      mode: 'explicit',
    }
  }

  const labels = new Set(turns.map((t) => t.role).filter((r): r is string => !!r))
  if (labels.size < 2) {
    return { isCandidate: turns.map(() => null), mode: 'none' }
  }

  // First-seen label = whoever speaks first = interviewer reading the prompt.
  const firstSpeaker = turns.find((t) => t.role)?.role
  if (!firstSpeaker) return { isCandidate: turns.map(() => null), mode: 'none' }
  return {
    isCandidate: turns.map((t) => (t.role ? t.role !== firstSpeaker : null)),
    mode: 'inferred',
  }
}

export function computeCaseSignals(turnsInput: SignalTurn[] | null): CaseSignals | null {
  if (!turnsInput || turnsInput.length === 0) return null
  const turns = turnsInput

  const timed = turns.filter((t) => typeof t.offsetMs === 'number') as Array<SignalTurn & { offsetMs: number }>
  const timingAvailable = timed.length >= 2

  // ── Roles ──
  const { isCandidate, mode: roleMode } = resolveRoles(turns)

  // ── Silence gaps (timing-based) ──
  let longSilenceCount = 0
  let longestSilenceSec = 0
  if (timingAvailable) {
    for (let i = 1; i < timed.length; i += 1) {
      const gapMs = timed[i].offsetMs - timed[i - 1].offsetMs
      if (gapMs > LONG_SILENCE_MS) {
        longSilenceCount += 1
        longestSilenceSec = Math.max(longestSilenceSec, Math.round(gapMs / 1000))
      }
    }
  }

  // ── Opening clarifying questions ──
  let lastOffset = timed.length > 0 ? timed[timed.length - 1].offsetMs : 0
  if (!timingAvailable) lastOffset = 0
  const openingWindowMs = Math.min(
    OPENING_WINDOW_MAX_MS,
    timingAvailable && lastOffset > 0 ? Math.max(OPENING_WINDOW_MAX_MS, lastOffset * 0.2) : OPENING_WINDOW_MAX_MS,
  )
  const openingCutoff = timingAvailable ? openingWindowMs : Number.POSITIVE_INFINITY
  let openingQuestionCount = 0
  for (let i = 0; i < turns.length; i += 1) {
    const offset = turns[i].offsetMs ?? Number.POSITIVE_INFINITY
    if (offset > openingCutoff) break
    // Only count questions from non-interviewer voices when roles are known;
    // unknown-role turns still count (opening questions are overwhelmingly
    // the candidate's in practice).
    if (isCandidate[i] === false) continue
    openingQuestionCount += (turns[i].text.match(/\?/g) ?? []).length
  }
  openingQuestionCount = Math.min(openingQuestionCount, 10)

  // ── Per-turn language signals ──
  let hedgeTotal = 0
  const hedgePhrasesFound = new Set<string>()
  let signpostCount = 0
  let calcTurns = 0
  let calcWithLink = 0
  let candidateWords = 0
  let totalWordsAll = 0
  let candidateTurnCount = 0
  let candidateTurnWordsSum = 0

  for (let i = 0; i < turns.length; i += 1) {
    const text = turns[i].text
    const words = wordCount(text)
    totalWordsAll += words
    const isCand = isCandidate[i]
    if (isCand === false) continue // interviewer turns excluded from delivery signals

    const lower = text.toLowerCase()

    for (const { re, label } of HEDGE_PATTERNS) {
      if (re.test(text)) {
        hedgeTotal += 1
        hedgePhrasesFound.add(label)
      }
    }
    if (SIGNPOST_RE.test(text)) signpostCount += 1

    if (CALC_RE.test(lower)) {
      calcTurns += 1
      if (INSIGHT_LINK_RE.test(lower)) calcWithLink += 1
    }

    if (isCand === true) {
      candidateWords += words
      candidateTurnCount += 1
      candidateTurnWordsSum += words
    } else if (isCand === null && roleMode === 'none') {
      // No attribution at all: treat every turn as blended speech so the
      // density metrics still mean something (marked via roleMode).
      candidateWords += words
      candidateTurnCount += 1
      candidateTurnWordsSum += words
    }
  }

  return {
    longSilenceCount,
    longestSilenceSec,
    openingQuestionCount,
    hedgeDensity: candidateWords > 0 ? +((hedgeTotal / candidateWords) * 100).toFixed(1) : 0,
    hedgePhrasesFound: [...hedgePhrasesFound],
    signpostCount,
    mathInsightLinkage: calcTurns > 0 ? +(calcWithLink / calcTurns).toFixed(2) : null,
    calculationTurnCount: calcTurns,
    candidateTalkRatio:
      totalWordsAll > 0 && roleMode !== 'none' ? +(candidateWords / totalWordsAll).toFixed(2) : null,
    avgCandidateTurnWords: candidateTurnCount > 0 ? Math.round(candidateTurnWordsSum / candidateTurnCount) : 0,
    totalWords: totalWordsAll,
    roleMode,
    timingAvailable,
  }
}

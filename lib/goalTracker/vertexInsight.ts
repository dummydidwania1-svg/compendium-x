/**
 * Two-stage Gemini call for the Goal Tracker AI Insight layer, run against
 * Vertex AI Express Mode (not the plain Gemini API Coach/Analyser use).
 * Server-only — the API key must never reach the browser.
 *
 * Hand-rolled fetch, matching the established pattern in
 * lib/geminiFeedback.ts / lib/geminiCoach.ts rather than adding the
 * @google/genai SDK.
 *
 * Uses PLAIN TEXT output with a strict single-line-prefix contract, not
 * responseMimeType:'application/json' + responseSchema — in production,
 * gemini-3.6-flash on this Express Mode endpoint was observed emitting only
 * a conversational preamble ("Here is the JSON requested:") with no JSON
 * ever following, despite the schema constraint and explicit "no preamble"
 * instructions. This mirrors lib/geminiCoach.ts's existing plain-text +
 * line-parsing approach elsewhere in this codebase, which is more robust to
 * a model/endpoint combination that doesn't reliably honor structured
 * output.
 */
import 'server-only'
import type { InsightShapeId, ShapeCandidate } from './insightShapes'

const VERTEX_MODEL = 'gemini-3.6-flash'
const VERTEX_URL = `https://aiplatform.googleapis.com/v1/publishers/google/models/${VERTEX_MODEL}:generateContent`

function apiKey(): string {
  const key = process.env.VERTEX_AI_API_KEY
  if (!key) throw new Error('VERTEX_AI_API_KEY is not set.')
  return key
}

interface VertexGenerationConfig {
  temperature: number
  maxOutputTokens: number
}

async function callVertex(systemInstruction: string, userMessage: string, config: VertexGenerationConfig): Promise<string> {
  const response = await fetch(`${VERTEX_URL}?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: config,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Vertex AI error ${response.status}: ${err?.error?.message ?? response.statusText}`)
  }

  const data = await response.json()
  const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? []
  const finishReason = data?.candidates?.[0]?.finishReason
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim()

  if (finishReason && finishReason !== 'STOP') {
    console.log('[vertexInsight] non-STOP finishReason', { finishReason, textLength: text.length, textPreview: text.slice(0, 200) })
  }

  if (!text) throw new Error(`Vertex AI returned an empty response (finishReason: ${finishReason ?? 'unknown'}).`)
  return text
}

/**
 * Extracts the value following a required line prefix (e.g. "SHAPE_ID:"),
 * tolerant of the model prepending conversational text before that line —
 * scans every line rather than assuming line 1 is the answer.
 */
function extractPrefixedLine(raw: string, prefix: string): string | null {
  const lines = raw.split('\n').map((l) => l.trim())
  for (const line of lines) {
    if (line.toUpperCase().startsWith(prefix.toUpperCase())) {
      return line.slice(prefix.length).trim().replace(/^["'`]+|["'`]+$/g, '')
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Stage 1 — ranking                                                          */
/* -------------------------------------------------------------------------- */

const RANK_SYSTEM_PROMPT = `You are ranking candidate insight patterns for a practice-goal tracker.
Pick exactly one shapeId from the candidates provided, using this priority order:
1. Actionability — prefer an insight the user could act on this week.
2. Novelty — do not pick the shapeId that was most recently shown, if a comparable alternative exists.
3. Statistical strength — prefer the candidate with higher magnitude.
4. Non-redundancy — avoid a pattern that just restates a number already visible on the card.
Also rotate across axes over time rather than always favoring the same axis.

Respond with EXACTLY ONE line, in this exact format, with nothing else before or after it:
SHAPE_ID: <the winning shapeId>`

export async function callVertexRank(
  candidates: ShapeCandidate[],
  lastShownShapeId: string | null,
): Promise<{ winningShapeId: InsightShapeId; winningCandidate: ShapeCandidate }> {
  const candidateList = candidates
    .map((c) => `- ${c.shapeId} (axis: ${c.axis}, magnitude: ${c.magnitude.toFixed(2)}, data: ${JSON.stringify(c.data)})`)
    .join('\n')
  const userMessage = `Candidates:\n${candidateList}\n\nLast shown shapeId: ${lastShownShapeId ?? 'none'}`

  const raw = await callVertex(RANK_SYSTEM_PROMPT, userMessage, {
    temperature: 0.4,
    maxOutputTokens: 400,
  })

  const shapeIdRaw = extractPrefixedLine(raw, 'SHAPE_ID:')
  const winningCandidate = candidates.find((c) => c.shapeId === shapeIdRaw)
  if (!winningCandidate) {
    console.log('[vertexInsight] rank response did not match a candidate', { rawPreview: raw.slice(0, 200), shapeIdRaw })
    // Model returned an unparseable or unknown shapeId — fall back to the
    // highest-magnitude candidate rather than erroring the whole request.
    const fallback = [...candidates].sort((a, b) => b.magnitude - a.magnitude)[0]
    return { winningShapeId: fallback.shapeId, winningCandidate: fallback }
  }
  return { winningShapeId: winningCandidate.shapeId, winningCandidate }
}

/* -------------------------------------------------------------------------- */
/* Stage 2 — fill                                                             */
/* -------------------------------------------------------------------------- */

const FILL_SYSTEM_PROMPT = `You write a single short insight sentence for a practice-goal tracker card, in a warm,
informal "buddy" tone matching this app's existing copy (examples of the register: "You are bang on track for Aug 30."
/ "Smashed it, with 6 days to spare." / "Slightly behind, but nothing you can't fix."). Rules:
- One sentence, occasionally two short clauses, no more than 110 characters total.
- No em dashes or en dashes, anywhere.
- Never comment on skill, technique, or performance quality standalone (e.g. never say "your structure is weak").
  If the data involves scores, only frame it as a correlation with pursuit behavior (pace, timing, rhythm),
  never as a verdict on how good the user is.
- Do not restate the user's overall progress count or total target (those are already on the card). Other real
  numbers from the Data are fine and encouraged when they tell the story (streak lengths, per-period counts,
  days left, shares).
- CRITICAL: the sentence MUST cite a concrete, specific fact taken directly from the Data given below
  (e.g. a day of the week, a time window, a case type name, a specific number/percentage/streak length,
  a comparison between two periods). A vague sentence with no specific fact from the data (e.g. "you have
  really picked up", "great momentum", "keep it up") is a FAILURE and must never be produced — every
  sentence must sound like it could only be said about THIS user's actual data, not any user in this state.
- Every number you cite MUST come straight from the Data. Inventing or rounding up a number not present
  there is a FAILURE.

Respond with EXACTLY ONE line, in this exact format, with nothing else before or after it:
INSIGHT: <the sentence>`

export interface FillOptions {
  stricter?: boolean
  /**
   * One-line summary of what the deterministic card currently says (state chip
   * label + headline numbers). The model must COMPLEMENT this, never restate
   * or contradict it — prevents "momentum is up!" appearing directly under an
   * "At risk" chip.
   */
  cardContext?: string
}

export async function callVertexFill(
  candidate: ShapeCandidate,
  opts?: FillOptions,
): Promise<{ text: string }> {
  const contextLine = opts?.cardContext
    ? `\n\nCard context (complement this, do NOT restate or contradict it):\n${opts.cardContext}`
    : ''
  const userMessage = `Shape: ${candidate.shapeId}\nAxis: ${candidate.axis}\nData: ${JSON.stringify(candidate.data)}${contextLine}`
  const systemPrompt = opts?.stricter
    ? `${FILL_SYSTEM_PROMPT}\nIMPORTANT: your previous attempt failed validation (too long, contained a dash, restated a visible number, cited a number not in the Data, or had extra text around the INSIGHT: line). Be stricter this time — shorter, plainer, no dashes, output ONLY the single "INSIGHT: ..." line.`
    : FILL_SYSTEM_PROMPT

  // Generous budget: some Gemini models spend tokens on internal reasoning
  // before the visible answer, and a tight cap here was a plausible
  // contributor to thin, generic output (nothing left after "thinking").
  // Temperature raised from 0.4: validation is fully deterministic anyway, so
  // a wider sample reduces same-y output at zero correctness risk.
  const raw = await callVertex(systemPrompt, userMessage, {
    temperature: 0.75,
    maxOutputTokens: 800,
  })

  const text = extractPrefixedLine(raw, 'INSIGHT:')
  if (!text) {
    console.log('[vertexInsight] fill response missing INSIGHT: line', { rawPreview: raw.slice(0, 200) })
    throw new Error('Vertex AI fill response did not contain an INSIGHT: line.')
  }
  return { text: text.trim() }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

const BANNED_STANDALONE_SCORE_PHRASES = [
  'your structure',
  'your creativity',
  'your delivery',
  'your understanding',
  'your analysis',
  'weak at',
  'good at',
  'skill',
  'technique',
]

const GENERIC_FILLER_PHRASES = [
  'really picked up',
  'great momentum',
  'keep it up',
  'keep going',
  'nice progress',
  'good progress',
  'making progress',
  'on the right track',
  'doing great',
  'well done',
]

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every numeric literal appearing anywhere inside the candidate's data. */
function collectDataNumbers(data: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof data === 'number') {
    if (!Number.isFinite(data)) return out
    out.add(String(data))
    const rounded = String(Math.round(data))
    if (rounded !== String(data)) out.add(rounded)
  } else if (typeof data === 'string') {
    for (const m of data.matchAll(/\d+(?:\.\d+)?/g)) out.add(m[0])
  } else if (Array.isArray(data)) {
    for (const item of data) collectDataNumbers(item, out)
  } else if (data && typeof data === 'object') {
    for (const value of Object.values(data)) collectDataNumbers(value, out)
  }
  return out
}

/**
 * Numbers from candidate data that are ALLOWED to appear in the sentence even
 * when they collide with a banned card number (e.g. near-miss data.target ===
 * the user's done count — "you hit 3 of 4 weeks" is legitimate). Numbers under
 * a 'done' key stay banned: restating the card's progress count is exactly the
 * redundancy we're guarding against.
 */
function collectExemptNumbers(data: unknown, out: Set<string> = new Set(), key?: string): Set<string> {
  if (typeof data === 'number') {
    if (Number.isFinite(data) && key !== 'done') out.add(String(data))
  } else if (Array.isArray(data)) {
    for (const item of data) collectExemptNumbers(item, out, key)
  } else if (data && typeof data === 'object') {
    for (const [k, value] of Object.entries(data)) collectExemptNumbers(value, out, k)
  }
  return out
}

/**
 * GROUNDED-number check: every numeric token cited in the sentence must be
 * traceable to the winning candidate's actual data (raw or rounded value).
 * "any digit counts as concrete" used to let fabricated stats ("about 70%")
 * sail through while legit sentences failed on substring collisions.
 */
function hasGroundedNumbers(text: string, candidateData: Record<string, unknown>): boolean {
  const allowed = collectDataNumbers(candidateData)
  const tokens = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])
  if (tokens.length === 0) return true // number-free sentences ground via terms below
  return tokens.every((token) => {
    if (allowed.has(token)) return true
    const asNum = Number(token)
    if (Number.isFinite(asNum)) return allowed.has(String(Math.round(asNum)))
    return false
  })
}

/**
 * Requires the sentence to cite something specific to THIS user's data: either
 * grounded numbers (checked separately), a recognizable specific term
 * (day name, time-of-day word) that actually appears in the candidate's data
 * values, or an explicit echo of a data FIELD name ("near misses", "days
 * remaining") — spelled-out numbers carry no digits, so key-echo is what keeps
 * e.g. "three near misses in four weeks" passing.
 */
function hasConcreteFact(text: string, candidateData: Record<string, unknown>): boolean {
  const lower = text.toLowerCase()

  if (!/\d/.test(lower)) {
    // Digit-free: ground via day/time terms present in the data, or via an
    // echoed field name from the data itself.
    const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    const TIME_WORDS = ['morning', 'afternoon', 'evening', 'night']
    const specificTerms = [...DAY_NAMES, ...TIME_WORDS]
    const dataJson = JSON.stringify(candidateData).toLowerCase()
    const termHit = specificTerms.some((term) => lower.includes(term) && dataJson.includes(term))
    if (termHit) return true

    const keyWords = Object.keys(candidateData)
      .flatMap((key) => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_]+/))
      .filter((word) => word.length >= 5) // 'unit','type' too generic alone; 'streak','remaining','misses' qualify
    return keyWords.some((word) => lower.includes(word))
  }

  // Sentence contains digits: ground them separately via hasGroundedNumbers,
  // but still require SOME specificity anchor so "2 of those were great" with
  // unrelated numbers can't ride through on grounding alone when the data has
  // no matching context. Any key-word or day/time term satisfies this.
  const dataJson = JSON.stringify(candidateData).toLowerCase()
  const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const TIME_WORDS = ['morning', 'afternoon', 'evening', 'night']
  const specificTerms = [...DAY_NAMES, ...TIME_WORDS]
  if (specificTerms.some((term) => lower.includes(term) && dataJson.includes(term))) return true
  const keyWords = Object.keys(candidateData)
    .flatMap((key) => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_]+/))
    .filter((word) => word.length >= 5)
  return keyWords.some((word) => lower.includes(word)) || /\b(week|month|day|case|cases|period)s?\b/.test(lower)
}

export function validateInsight(
  text: string,
  deterministicCardNumbers: string[],
  candidateData: Record<string, unknown>,
): boolean {
  if (text.length === 0 || text.length > 110) return false
  if (/[—–]/.test(text)) return false // em dash (—) or en dash (–)
  const lower = text.toLowerCase()
  if (BANNED_STANDALONE_SCORE_PHRASES.some((phrase) => lower.includes(phrase))) return false
  if (GENERIC_FILLER_PHRASES.some((phrase) => lower.includes(phrase))) return false
  // Word-boundary matching so "16 weeks" no longer fails just because "6"
  // collides with the done count; exempt numbers from the candidate's own
  // data (a shape's target/streak fields) where restating is legitimate.
  const exempt = collectExemptNumbers(candidateData)
  const restatesCardNumber = deterministicCardNumbers.some((n) => {
    if (!n || exempt.has(n)) return false
    return new RegExp(`\\b${escapeRegExp(n)}\\b`).test(text)
  })
  if (restatesCardNumber) return false
  if (!hasConcreteFact(text, candidateData)) return false
  if (!hasGroundedNumbers(text, candidateData)) return false
  return true
}

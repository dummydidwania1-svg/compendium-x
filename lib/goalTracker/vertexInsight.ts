/**
 * Two-stage structured Gemini call for the Goal Tracker AI Insight layer, run
 * against Vertex AI Express Mode (not the plain Gemini API Coach/Analyser
 * use). Server-only — the API key must never reach the browser.
 *
 * Hand-rolled fetch, matching the established pattern in
 * lib/geminiFeedback.ts / lib/geminiCoach.ts rather than adding the
 * @google/genai SDK — this route needs exactly two generateContent calls
 * with structured output, which fetch handles cleanly.
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
  responseMimeType: 'application/json'
  responseSchema: Record<string, unknown>
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
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim()

  if (!text) throw new Error('Vertex AI returned an empty response.')
  return text
}

/**
 * Defensively extracts a JSON object from a model response that may include
 * conversational preamble/markdown fencing despite responseMimeType being
 * set to 'application/json' — some Gemini serving paths (including Express
 * Mode, observed in production) don't strictly honor the structured-output
 * constraint and free-text instead (e.g. "Here is the ..." followed by the
 * JSON). Strips code fences, then falls back to slicing out the first
 * balanced {...} block rather than assuming raw is valid JSON on its own.
 */
function extractJsonObject(raw: string): unknown {
  const fenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(fenced)
  } catch {
    // fall through to brace-matching below
  }
  const start = fenced.indexOf('{')
  if (start === -1) throw new Error(`No JSON object found in Vertex AI response: ${raw.slice(0, 80)}`)
  let depth = 0
  for (let i = start; i < fenced.length; i += 1) {
    if (fenced[i] === '{') depth += 1
    else if (fenced[i] === '}') {
      depth -= 1
      if (depth === 0) {
        return JSON.parse(fenced.slice(start, i + 1))
      }
    }
  }
  throw new Error(`Unbalanced JSON object in Vertex AI response: ${raw.slice(0, 80)}`)
}

/* -------------------------------------------------------------------------- */
/* Stage 1 — ranking                                                          */
/* -------------------------------------------------------------------------- */

const RANK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    winningShapeId: { type: 'STRING' },
  },
  required: ['winningShapeId'],
}

const RANK_SYSTEM_PROMPT = `You are ranking candidate insight patterns for a practice-goal tracker.
Pick exactly one shapeId from the candidates provided, using this priority order:
1. Actionability — prefer an insight the user could act on this week.
2. Novelty — do not pick the shapeId that was most recently shown, if a comparable alternative exists.
3. Statistical strength — prefer the candidate with higher magnitude.
4. Non-redundancy — avoid a pattern that just restates a number already visible on the card.
Also rotate across axes over time rather than always favoring the same axis.
Respond with ONLY a raw JSON object of the exact shape {"winningShapeId": "..."} — no
markdown code fences, no explanation, no preamble like "Here is...", just the JSON object itself.`

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
    maxOutputTokens: 200,
    responseMimeType: 'application/json',
    responseSchema: RANK_SCHEMA,
  })

  const parsed = extractJsonObject(raw) as { winningShapeId: string }
  const winningCandidate = candidates.find((c) => c.shapeId === parsed.winningShapeId)
  if (!winningCandidate) {
    // Model returned a shapeId not in the candidate list — fall back to the
    // highest-magnitude candidate rather than erroring the whole request.
    const fallback = [...candidates].sort((a, b) => b.magnitude - a.magnitude)[0]
    return { winningShapeId: fallback.shapeId, winningCandidate: fallback }
  }
  return { winningShapeId: winningCandidate.shapeId, winningCandidate }
}

/* -------------------------------------------------------------------------- */
/* Stage 2 — fill                                                             */
/* -------------------------------------------------------------------------- */

const FILL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING' },
  },
  required: ['text'],
}

const FILL_SYSTEM_PROMPT = `You write a single short insight sentence for a practice-goal tracker card, in a warm,
informal "buddy" tone matching this app's existing copy (examples: "You are bang on track for Aug 30."
/ "Smashed it, with 6 days to spare." / "Slightly behind, but nothing you can't fix."). Rules:
- One sentence, occasionally two short clauses, no more than 110 characters total.
- No em dashes or en dashes, anywhere.
- Never comment on skill, technique, or performance quality standalone (e.g. never say "your structure is weak").
  If the data involves scores, only frame it as a correlation with pursuit behavior (pace, timing, rhythm),
  never as a verdict on how good the user is.
- Do not restate a number that's already obviously visible elsewhere on the card (like the raw done/total count).
- Ground the sentence in the specific data provided; do not invent numbers.
Respond with ONLY a raw JSON object of the exact shape {"text": "..."} — no markdown code fences,
no explanation, no preamble like "Here is...", just the JSON object itself.`

export async function callVertexFill(
  candidate: ShapeCandidate,
  opts?: { stricter?: boolean },
): Promise<{ text: string }> {
  const userMessage = `Shape: ${candidate.shapeId}\nAxis: ${candidate.axis}\nData: ${JSON.stringify(candidate.data)}`
  const systemPrompt = opts?.stricter
    ? `${FILL_SYSTEM_PROMPT}\nIMPORTANT: your previous attempt failed validation (too long, contained a dash, or restated a visible number). Be stricter this time — shorter, plainer, no dashes.`
    : FILL_SYSTEM_PROMPT

  const raw = await callVertex(systemPrompt, userMessage, {
    temperature: 0.4,
    maxOutputTokens: 150,
    responseMimeType: 'application/json',
    responseSchema: FILL_SCHEMA,
  })

  const parsed = extractJsonObject(raw) as { text: string }
  return { text: parsed.text.trim() }
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

export function validateInsight(text: string, deterministicCardNumbers: string[]): boolean {
  if (text.length === 0 || text.length > 110) return false
  if (/[—–]/.test(text)) return false // em dash (—) or en dash (–)
  const lower = text.toLowerCase()
  if (BANNED_STANDALONE_SCORE_PHRASES.some((phrase) => lower.includes(phrase))) return false
  if (deterministicCardNumbers.some((n) => n.length > 0 && text.includes(n))) return false
  return true
}

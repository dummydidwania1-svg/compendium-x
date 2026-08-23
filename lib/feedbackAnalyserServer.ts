/**
 * Server-only brain of the Feedback Analyser. Moved off the client because
 * the Gemini key must never ship in the browser bundle (the old
 * NEXT_PUBLIC_GEMINI_API_KEY path let anyone lift it from the deployed JS).
 *
 * Responsibilities beyond the raw model call:
 *   - Corpus construction with windowing (recent cases in full, older ones
 *     summarized) so prompt size stays bounded as history grows
 *   - Machine-measured execution context (caseSignals aggregates +
 *     analyzeCaseExecution findings) injected as a clearly-separated evidence
 *     layer the model must treat differently from stated interviewer feedback
 *   - Quote verification: every rendered quote must substring-match real notes
 *     or verbal excerpts; unverified quotes are dropped before the client sees
 *     them
 */
import 'server-only'
import type { FAMetrics } from '@/lib/feedbackPrecompute'
import type { FAResponse } from '@/lib/geminiFeedback'

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const FA_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    blocks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['heading', 'paragraph', 'bullet', 'quote', 'divider'] },
          text: { type: 'STRING' },
          tag: { type: 'STRING' },
          caseKey: { type: 'STRING' },
          caseLabel: { type: 'STRING' },
          date: { type: 'STRING' },
        },
        required: ['type', 'text'],
      },
    },
    viz: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['bars', 'scatter', 'table', 'none'] },
        title: { type: 'STRING' },
        subtitle: { type: 'STRING' },
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              label: { type: 'STRING' },
              value: { type: 'NUMBER' },
            },
            required: ['label', 'value'],
          },
        },
        maxValue: { type: 'NUMBER' },
        points: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              x: { type: 'NUMBER' },
              y: { type: 'NUMBER' },
              label: { type: 'STRING' },
            },
            required: ['x', 'y', 'label'],
          },
        },
        xLabel: { type: 'STRING' },
        yLabel: { type: 'STRING' },
        headers: { type: 'ARRAY', items: { type: 'STRING' } },
        rows: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'STRING' } } },
      },
      required: ['type', 'title'],
    },
  },
  required: ['blocks', 'viz'],
}

/** Recent cases shipped verbatim; anything older is compressed to a summary line. */
const FULL_CORPUS_WINDOW = 20
const SUMMARY_LINE_CHARS = 90

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function truncate(text: string | null | undefined, chars: number): string {
  const clean = (text ?? '').trim()
  if (clean.length <= chars) return clean
  return `${clean.slice(0, chars).trimEnd()}…`
}

function buildCorpusBlock(m: FAMetrics): string {
  const entries = m.feedbackEntries
  if (entries.length === 0) return '(No written or spoken interviewer feedback recorded yet.)'

  const cutoff = entries.length - FULL_CORPUS_WINDOW
  const older = cutoff > 0 ? entries.slice(0, cutoff) : []
  const recent = cutoff > 0 ? entries.slice(cutoff) : entries

  const recentBlock = recent
    .map((f) => {
      const parts = [`[${f.key}] "${f.label}" (${f.date}, ${f.caseType}, ${f.level})`]
      if (f.notes) parts.push(`  Written notes: ${f.notes}`)
      if (f.verbal) parts.push(`  Closing-minutes excerpt: "${f.verbal}"`)
      return parts.join('\n')
    })
    .join('\n\n')

  const olderBlock =
    older.length > 0
      ? `\n\n=== OLDER SESSIONS (summary only — ask about specifics by key if needed) ===\n${older
          .map(
            (f) =>
              `[${f.key}] "${f.label}" (${f.date}): ${truncate(f.notes ?? f.verbal ?? '', SUMMARY_LINE_CHARS)}`
          )
          .join('\n')}`
      : ''

  return `${recentBlock}${olderBlock}`
}

function buildExecutionBlock(m: FAMetrics): string {
  const parts: string[] = []
  if (m.executionSignals) {
    const s = m.executionSignals
    parts.push(
      `Aggregate (across ${s.sessionsAnalyzed} timed sessions): avg long silences per case ${s.avgLongSilences ?? 'n/a'} · ` +
        `avg opening clarifying questions ${s.avgOpeningQuestions ?? 'n/a'} · ` +
        `hedge phrases per 100 candidate words ${s.avgHedgeDensity ?? 'n/a'} · ` +
        `calculations followed by an insight link ${s.avgMathInsightLinkage != null ? Math.round(s.avgMathInsightLinkage * 100) + '%' : 'n/a'}` +
        (s.lowLinkageSessions > 0 ? ` (${s.lowLinkageSessions} sessions below 40%)` : '')
    )
  }
  const recentExec = m.executionSummaries.slice(-8)
  for (const ex of recentExec) {
    const lines = [`[${ex.key}] "${ex.label}" (${ex.date}): ${ex.overallNote}`]
    for (const f of ex.findings) lines.push(`  - ${f.issue}: ${f.momentDescription}`)
    parts.push(lines.join('\n'))
  }
  if (parts.length === 0) return ''
  return (
    '\n\n=== HOW THE CASES RAN (machine-measured execution signals — NOT what interviewers said) ===\n' +
    'These are deterministic measurements and transcript-derived findings. Cite them as measurements ' +
    '("the recording shows..."), NEVER attribute them to an interviewer, and keep them separate from stated feedback.\n' +
    parts.join('\n\n')
  )
}

function buildSystemPrompt(m: FAMetrics): string {
  const typeLines = Object.entries(m.typeBreakdown)
    .sort((a, b) => a[1].avgScore - b[1].avgScore)
    .map(([t, d]) => `  ${t}: avg score ${d.avgScore} (${d.count} cases)`)
    .join('\n');

  // Cold-start framing: with fewer than 3 rated sessions, "patterns that
  // persist" are statistically meaningless — a single note is not a theme.
  // The report switches purpose: first signals + baseline + drills.
  const earlyJourney = m.totalCases > 0 && m.totalCases < 3;

  return `You are Feedback Analyser. Your foundation is what the interviewer actually communicated as feedback: their written notes, plus a short excerpt from the closing portion of each case recording where wrap-up remarks tend to land. Scores are secondary: use them to corroborate what the language already reveals.

The closing-minutes excerpt is NOT a full case transcript — it may contain genuine spoken feedback, or just the last moments of case-solving with little evaluative content; judge each on its own merits. Never treat it as a record of the whole case.

You find patterns in language: what interviewers keep saying, what has disappeared over time, what new concerns have emerged, and what strengths get consistently praised.${
    earlyJourney
      ? `

=== EARLY JOURNEY MODE (fewer than 3 rated sessions) ===
The user is at the very start of their prep. Rules for this mode:
- Do NOT use trajectory tags (Persisting/Improving/Emerging/Early only). With one or two sessions nothing persists or improves yet; every finding gets the tag "First signal" or "Strength".
- Frame findings as FIRST SIGNALS and BASELINE FACTS ("your opening structure scored X", "the one note so far flags Y"), never as recurring themes.
- Lean on the machine-measured execution signals below when present: with few sessions they are often richer than the notes.
- End the report with a "Make your next feedback richer" bullet: remind the user to ask their interviewer to comment specifically on structure quality, math narration, and recommendation clarity.`
      : ''
  }

=== INTERVIEWER FEEDBACK (each item keyed [key] "label") ===
${buildCorpusBlock(m)}${
    m.feedbackEntries.length === 0
      ? '\n\nNOTE: No written or spoken interviewer feedback has been captured at all yet. Build your report from SCORE CONTEXT and the measured execution signals only, and say plainly in one line that written feedback has not been recorded yet \u2014 then give two practical tips for getting it (ask the interviewer to jot two strengths and one improvement right after the case).'
      : ''
  }${buildExecutionBlock(m)}

=== SCORE CONTEXT (secondary) ===
Total rated sessions: ${m.totalCases} | Date range: ${m.dateRange.start} to ${m.dateRange.end}
Global avg score: ${m.globalAvg.score}/5
By case type (weakest to strongest):
${typeLines}
Easy: ${m.easyAvgScore} | Medium: ${m.mediumAvgScore} | Hard: ${m.hardAvgScore}
Last 14 sessions avg: ${m.recentAvgScore}

=== CASE DATA (CSV; first column = citation key, second = case title) ===
key,title,date,type,level,structure,analysis,creativity,delivery,score
${m.allCasesCSV}

=== DIAGNOSIS STANDARD (this is what separates useful feedback from generic feedback) ===
"Be more structured" is a direction, not a diagnosis. Every finding you produce MUST be specific enough
to change what the user practices next. Each finding follows this exact shape:
1. PATTERN  (heading): name the concrete behavior, e.g. "Numbers without implications", not "Quant needs work".
2. EVIDENCE (paragraph + bullets): where it shows up — which session keys, dates, and the measured signals above when relevant.
3. TRAJECTORY (heading tag): Persisting | Improving | Emerging | Early only | Strength | Gap.
4. DRILL (final bullet of every finding, prefixed exactly "Drill:"): ONE specific practice rep drawn from the
   drill library below, tailored to this user's data. Never a vague instruction like "practice more".

DRILL LIBRARY (adapt wording to the finding; do not invent unrelated drills):
- Objective-first rep: restate the objective aloud and get confirmation before structuring
- Custom-framework drill: build frameworks via "what must be true", 3-4 buckets, zero memorized templates
- Clarifying warmup: exactly 2-3 scope questions before any structure
- Math-narration drill: formula, units, implication said aloud for every calculation
- Unit-tracking drill: write units beside every number through the calculation chain
- So-what rep: after every number produced, state one business implication sentence
- Answer-first synthesis rep: recommendation first, then two reasons, one risk, one next step
- Signposting drill: present the structure numbered, in under 90 seconds
- Redirect drill: acknowledge the interviewer's cue in one sentence, then pivot cleanly
- Silence protocol: announce "30 seconds to organize" instead of thinking silently
- 80/20 drill: name the two branches that matter most and why, before diving in

=== OUTPUT FORMAT (valid JSON only — no markdown, no code fences) ===
Return a JSON object with exactly two keys: "blocks" and "viz".

BLOCKS — structured findings, each in this order:
  heading   → { "type": "heading", "text": "Pattern name", "tag": "<trajectory tag>" }
  paragraph → { "type": "paragraph", "text": "1-2 sentences stating the pattern plainly." }
  bullet    → { "type": "bullet", "text": "One specific observation citing session keys, dates, or measured signals." }
  bullet    → ...2-3 observation bullets...
  bullet    → { "type": "bullet", "text": "Drill: <one drill from the library, tailored>." }
  quote     → { "type": "quote", "text": "Exact verbatim words from the notes or verbal excerpt.", "caseKey": "<key>", "caseLabel": "<title>", "date": "<date>" }
  divider   → { "type": "divider", "text": "" }

Trajectory tags${earlyJourney ? ' (EARLY JOURNEY: use only "First signal" or "Strength")' : ''}:
  Persisting | Improving | Emerging | Early only | Strength | Gap${earlyJourney ? ' | First signal' : ''}

QUOTES: copy EXACTLY, word-for-word, from the Written notes or Closing-minutes excerpt above. The system
verifies every quote against the source text and silently drops quotes that do not match, so paraphrasing
a quote makes it disappear. If no exact quote supports a finding, omit the quote block.

VIZ — one visualization that best illuminates the answer:
  bars    → { "type": "bars", "title": "...", "items": [{"label":"...", "value": 0.0}], "maxValue": 5 }
  scatter → { "type": "scatter", "title": "...", "points": [{"x": 1, "y": 3.5, "label": "..."}], "xLabel": "Session", "yLabel": "Score" }
  table   → { "type": "table", "title": "...", "headers": ["..."], "rows": [["..."]] }
  none    → { "type": "none", "title": "" }
Compute all viz values from the CSV data. maxValue for bars is 5.

FULL REPORT MODE: when asked for the full report, produce 2-4 findings (strongest patterns first, at least
one Strength if any exists), then a final heading "This week's plan" (tag "Improving") whose bullets are the
two highest-leverage drills across your findings, in priority order.`
}

/** Drops quote blocks whose text does not appear verbatim in the cited entry's notes/verbal. */
export function verifyQuotes(response: FAResponse, metrics: FAMetrics): FAResponse {
  const byKey = new Map(metrics.feedbackEntries.map((f) => [f.key, f]))
  const blocks = response.blocks.filter((block) => {
    if (block.type !== 'quote') return true
    const entry = block.caseKey ? byKey.get(block.caseKey) : undefined
    if (!entry) return false
    const quoted = normalize(block.text)
    if (!quoted) return false
    return (
      (!!entry.notes && normalize(entry.notes).includes(quoted)) ||
      (!!entry.verbal && normalize(entry.verbal).includes(quoted))
    )
  })
  // A divider left dangling right after a dropped quote would render as noise;
  // collapse consecutive dividers / leading-trailing dividers too.
  const cleaned: typeof blocks = []
  for (const block of blocks) {
    if (block.type === 'divider' && (cleaned.length === 0 || cleaned[cleaned.length - 1].type === 'divider')) continue
    cleaned.push(block)
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'divider') cleaned.pop()
  return { ...response, blocks: cleaned }
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set.')
  return key
}

export async function callFeedbackAnalyserServer(
  metrics: FAMetrics,
  history: Array<{ role: 'user' | 'agent'; text: string }>,
  userQuestion: string,
): Promise<FAResponse> {
  const contents = [
    ...history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    })),
    { role: 'user', parts: [{ text: userQuestion }] },
  ]

  // Implicit-cache-aware request shape: the large byte-stable systemInstruction
  // prefix lands Gemini implicit cache hits within a chat session (~1/10th
  // input-token cost). See goal-insight route for the same reasoning.
  const response = await fetch(`${GEMINI_URL}?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(metrics) }] },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1400,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: FA_RESPONSE_SCHEMA,
      },
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Gemini error ${response.status}: ${(err as { error?: { message?: string } })?.error?.message ?? response.statusText}`)
  }

  const data = await response.json()
  const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? []
  const raw = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim()

  try {
    const parsed = JSON.parse(raw) as FAResponse
    if (!parsed.blocks || !Array.isArray(parsed.blocks) || !parsed.viz) throw new Error('Invalid structure')
    return verifyQuotes(parsed, metrics)
  } catch {
    // Fallback: render raw text as a single paragraph block
    return {
      blocks: [{ type: 'paragraph', text: raw || 'Something went wrong. Please try again.' }],
      viz: { type: 'none', title: '' },
    }
  }
}

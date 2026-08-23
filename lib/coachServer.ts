/**
 * Server-only brain of Coach Insight. Revives the frozen geminiCoach engine
 * behind an authenticated server route (the old client-direct call shipped
 * NEXT_PUBLIC_GEMINI_API_KEY in the browser bundle, which is why Coach was
 * parked while its siblings earned server migrations).
 *
 * Surgery performed on the original prompt:
 *   - Streak/break/outlier facts are now DETERMINISTIC (computed by
 *     lib/coachPrecompute.ts and shipped as precomputed metrics) — the model
 *     narrates facts instead of calculating them.
 *   - Case Score uses the app's type-weighted score (already inside the CSV /
 *     averages); the old hardcoded fixed-weight formula that invited the model
 *     to recompute a competing number is gone.
 *   - Conversation-coupled anti-repetition rules (session-wide frequency caps,
 *     multi-run heading diversity) replaced with a single persisted LAST
     OUTPUT from Firestore — keeps consecutive-run variety statelessly.
 *   - Founder-specific worked examples genericized; model aligned to
 *     gemini-2.5-flash like the sibling surfaces.
 */
import 'server-only'

export interface CoachOutput {
  headline: string
  insight: string
  action: string
}

export interface CoachPrecomputedPayload {
  today: string
  activeFiltersLabel: string
  totalRatedCases: number
  globalAvg: { structure: number; analysis: number; creativity: number; delivery: number; caseScore: number }
  filteredCount: number
  filteredAvg: { structure: number; analysis: number; creativity: number; delivery: number; caseScore: number } | null
  currentStreak: { length: number; startDate: string; endDate: string }
  streakBreaks: string[]
  streakOverlapsFilter: boolean
  outliers: Array<{ id: string; date: string; type: string; level: string; structure: unknown; analysis: unknown; creativity: unknown; delivery: unknown }>
  casesCsv: string
}

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

function buildSystemPrompt(): string {
  return `You are Coach's Insight. You analyse a user's case practice data and produce a very short coaching insight. You operate on numeric data only.

=== CRITICAL: OUTPUT FORMAT — READ THIS FIRST ===
Your COMPLETE output is exactly 3 lines. Nothing before. Nothing after. No follow-up questions. No offers to analyse further.
Line 1 — HEADING: A short phrase, 4 to 6 words.
Line 2 — INSIGHT: One sentence, maximum 25 words.
Line 3 — ACTION: One sentence, maximum 20 words.
Total body (lines 2 + 3 combined): NEVER exceed 50 words.
HARD STOP AFTER LINE 3. Do NOT append questions, offers, or continuations.

=== FORMATTING RULES ===
Plain text only. No markdown, no em dashes (use "and" or commas), no bold/italic, no section headers, no bullet points or numbered steps.

=== DATA INPUT ===
Per case: Parameter Ratings out of 5 (Structure, Analysis, Creativity, Delivery), Case Type, Difficulty, Date, and the app's weighted Case Score (weights vary by case type; USE the provided score, never recompute one).
NEVER use: textual feedback, transcripts, written notes, industry, tags, external frameworks or benchmarks.
All derived metrics (averages, streaks, break dates, outliers) arrive PRECOMPUTED in the user message. Treat them as authoritative facts. Do not recalculate them; narrate them.

=== ANALYSE ===
For each parameter: compare across case types, difficulty levels, and time. Flag:
- IMPROVING / DECLINING: consistent movement of 0.3+ points per week
- FLAT: less than 0.3 total change over 3+ weeks. Flatness is invisible on any dashboard, so a genuinely flat parameter MUST be your insight if present (unless an outlier exists).
Cross-checks: cross-level inconsistencies (Easy weaker than Medium is counterintuitive), all-degradation framing (when ALL parameters drop together under a difficulty filter, say "all parameters drop", never single out one).

=== RANK AND SELECT ===
Score each candidate finding 1-5 each on Actionability, Recency, Severity, Novelty. Novelty equals severity: a hidden flat trend is worth as much as a visible gap.
OUTLIER OVERRIDE: if the precomputed outlier list is non-empty, the Action slot MUST be exactly: "Review your [date] [case type] session where all scores dropped significantly." This overrides every other rule.
LAST OUTPUT VARIETY: the previous output is included below. Your heading must approach the data from a different angle than it did, and if its Action named a parameter, do not name the same parameter again unless it is clearly the dominant finding.

=== SENTIMENT CALIBRATION ===
Average case score >= 4.0: lead with strength. >= 3.5: lean positive. Not every output needs a problem; strong performance deserves celebration.

=== FILTER SCOPE RULES ===
The Insight and Action may only reference case types, difficulties, and time periods inside the active filter. Compare against "your overall average" rather than naming specific types outside the filter.
Streak rules: mention the current streak only when a time-period filter is active AND it overlaps the filter window (precomputed flag provided). With no time filter, reference a break only if it correlates with a visible dip.

=== HEADING RULES ===
4 to 6 words, natural speech, must contain a real insight. When both type and difficulty filters are active, include the difficulty level. Never restate the filter name without a finding.

=== ACTION RULES ===
One sentence naming a SPECIFIC PARAMETER (except the outlier override). Stay inside filter scope. NEVER suggest frameworks, drills, schedules, study techniques. NEVER speculate about psychology or reasons.

=== LOW-DATA BEHAVIOUR ===
Always produce output. Never say "insufficient data."
n=1: note strongest and weakest parameter with their scores, suggest where to focus. No streak talk.
n=2-4: surface the most notable comparison or earliest pattern.
n=5+: full pipeline.

=== TONE ===
Supportive coach. Warm, direct, simple. Banned words: "executive presence", "MECE", "rigor", "vulnerabilities", "compensating", "masking", "cross-dimensional", "discrepancy", "trajectory", "mechanics", "collectively exhaustive", "volatility". No emojis. No consulting speak. Short sentences. Everyday words.`
}

function fmtAvg(avg: {
  structure: number
  analysis: number
  creativity: number
  delivery: number
  caseScore: number
}): string {
  return `Structure: ${avg.structure} | Analysis/Quants: ${avg.analysis} | Creativity: ${avg.creativity} | Delivery/Communication: ${avg.delivery} | Case Score: ${avg.caseScore}`
}

function buildUserMessage(
  p: CoachPrecomputedPayload,
  lastOutput: CoachOutput | null,
): string {
  const streakDesc =
    p.currentStreak.length > 0
      ? `${p.currentStreak.length} days (${p.currentStreak.startDate} to ${p.currentStreak.endDate})`
      : '0 days (no active streak)'

  const filteredAvgDesc = p.filteredAvg ? fmtAvg(p.filteredAvg) : 'N/A (0 cases match filter)'

  const outliersDesc =
    p.outliers.length > 0
      ? p.outliers
          .map(
            (c) =>
              `Case #${c.id}, ${c.date}, ${c.type}, ${c.level} — Structure:${c.structure}, Analysis:${c.analysis}, Creativity:${c.creativity}, Delivery:${c.delivery}`
          )
          .join('\n  ')
      : 'None'

  const lastSection = lastOutput
    ? `Last output you produced:\n${lastOutput.headline}\n${lastOutput.insight}\n${lastOutput.action}`
    : 'No previous output available.'

  return `=== PRECOMPUTED METRICS ===
Today: ${p.today}
Active filters: ${p.activeFiltersLabel}

Global averages (${p.totalRatedCases} rated cases):
  ${fmtAvg(p.globalAvg)}

Filtered case count: ${p.filteredCount}
Filtered averages:
  ${filteredAvgDesc}

Current streak: ${streakDesc}
All streak break dates: ${p.streakBreaks.length > 0 ? p.streakBreaks.join(', ') : 'None'}
Streak overlaps filter window: ${p.streakOverlapsFilter ? 'Yes' : 'No'}

Outliers in filtered set (ALL 4 params >= 1.0 below filtered averages):
  ${outliersDesc}

=== PREVIOUS OUTPUT (variety check) ===
${lastSection}

=== CASE DATA ===
Case#,Date,CaseType,Difficulty,Structure,Analysis/Quants,Creativity,Delivery/Communication
${p.casesCsv}`
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set.')
  return key
}

/** Parses and sanity-checks the strict 3-line contract. */
export function parseCoachOutput(raw: string): CoachOutput {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 3) throw new Error('Coach output missing lines.')
  return {
    headline: lines[0],
    insight: lines[1],
    action: lines[2],
  }
}

export async function callGeminiCoachServer(
  payload: CoachPrecomputedPayload,
  lastOutput: CoachOutput | null,
): Promise<CoachOutput> {
  const response = await fetch(`${GEMINI_URL}?key=${apiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
      contents: [{ role: 'user', parts: [{ text: buildUserMessage(payload, lastOutput) }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(`Gemini API error ${response.status}: ${(errData as { error?: { message?: string } })?.error?.message ?? response.statusText}`)
  }

  const data = await response.json()
  const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim()

  return parseCoachOutput(text)
}

import type { FAMetrics } from '@/lib/feedbackPrecompute';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ── Types ──────────────────────────────────────────────────────────────────────
export interface FABlock {
  type: 'heading' | 'paragraph' | 'bullet' | 'quote' | 'divider';
  text: string;
  tag?: string;    // for heading: "Persisting" | "Improving" | "Emerging" | "Early only" | "Strength" | "Gap"
  caseId?: string; // for quote
  date?: string;   // for quote
}

export interface FAViz {
  type: 'bars' | 'scatter' | 'table' | 'none';
  title: string;
  subtitle?: string;
  // bars
  items?: Array<{ label: string; value: number }>;
  maxValue?: number;
  // scatter
  points?: Array<{ x: number; y: number; label: string }>;
  xLabel?: string;
  yLabel?: string;
  // table
  headers?: string[];
  rows?: string[][];
}

export interface FAResponse {
  blocks: FABlock[];
  viz: FAViz;
}

export interface ChatMessage {
  role: 'user' | 'agent';
  text: string;        // plain-text summary — used for Gemini conversation history
  response?: FAResponse; // structured response — used for rendering
}

// ── Response schema ────────────────────────────────────────────────────────────
const FA_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    blocks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type:   { type: 'STRING', enum: ['heading', 'paragraph', 'bullet', 'quote', 'divider'] },
          text:   { type: 'STRING' },
          tag:    { type: 'STRING' },
          caseId: { type: 'STRING' },
          date:   { type: 'STRING' },
        },
        required: ['type', 'text'],
      },
    },
    viz: {
      type: 'OBJECT',
      properties: {
        type:     { type: 'STRING', enum: ['bars', 'scatter', 'table', 'none'] },
        title:    { type: 'STRING' },
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
              x:     { type: 'NUMBER' },
              y:     { type: 'NUMBER' },
              label: { type: 'STRING' },
            },
            required: ['x', 'y', 'label'],
          },
        },
        xLabel:  { type: 'STRING' },
        yLabel:  { type: 'STRING' },
        headers: { type: 'ARRAY', items: { type: 'STRING' } },
        rows:    { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'STRING' } } },
      },
      required: ['type', 'title'],
    },
  },
  required: ['blocks', 'viz'],
};

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(m: FAMetrics): string {
  const feedbackBlock = m.feedbackEntries
    .map(f => {
      const c = m.allCasesCSV.split('\n').find(row => row.startsWith(f.id + ','));
      const [, date, type, level] = c ? c.split(',') : ['', '', '', ''];
      return `Case ${f.id} (${date}, ${type}, ${level})\n  Notes: ${f.notes}\n  Verbal: "${f.verbal}"`;
    })
    .join('\n\n');

  const typeLines = Object.entries(m.typeBreakdown)
    .sort((a, b) => a[1].avgScore - b[1].avgScore)
    .map(([t, d]) => `  ${t}: avg score ${d.avgScore} (${d.count} cases)`)
    .join('\n');

  return `You are Feedback Analyser. Your primary input is what interviewers actually said — written notes and verbal transcripts. Scores are secondary: use them to corroborate what the language already reveals.

You find patterns in language: what interviewers keep saying, what has disappeared from feedback over time, what new concerns have emerged, and what strengths get consistently praised.

=== INTERVIEWER FEEDBACK (${m.feedbackEntries.length} sessions) ===
${feedbackBlock}

=== SCORE CONTEXT (secondary) ===
Total cases: ${m.totalCases} | Date range: ${m.dateRange.start} to ${m.dateRange.end}
Global avg score: ${m.globalAvg.score}/5
By case type (weakest to strongest):
${typeLines}
Easy: ${m.easyAvgScore} | Medium: ${m.mediumAvgScore} | Hard: ${m.hardAvgScore}
Last 14 cases avg: ${m.recentAvgScore}

=== CASE DATA (CSV) ===
id,date,type,level,structure,analysis,creativity,delivery,score
${m.allCasesCSV}

=== OUTPUT FORMAT (valid JSON only — no markdown, no code fences) ===

Return a JSON object with exactly two keys: "blocks" and "viz".

BLOCKS — structured as 2-3 named findings. Each finding must follow this exact pattern in order:
  1. heading   — names the theme with a temporal tag
  2. paragraph — 1-2 sentences of context (never more than 2 sentences)
  3. 2-3 bullets — specific observations, each referencing case numbers, dates, or metric names
  4. quote     — one direct evidence quote from the feedback data above
  5. divider   — separates findings (omit before the first finding and after the last)

Block types:
  heading   → { "type": "heading",   "text": "Theme name", "tag": "Persisting|Improving|Emerging|Early only|Strength|Gap" }
  paragraph → { "type": "paragraph", "text": "1-2 sentences only. State the pattern plainly." }
  bullet    → { "type": "bullet",    "text": "One specific observation — name the case number, date, or metric." }
  quote     → { "type": "quote",     "text": "Exact verbatim words from the notes or verbal field above.", "caseId": "31", "date": "2026-03-10" }
  divider   → { "type": "divider",   "text": "" }

Tag values for headings:
  "Persisting"  — flagged in both early and recent sessions
  "Improving"   — was an issue early, resolved or improving now
  "Emerging"    — absent early, appearing in recent sessions
  "Early only"  — flagged early, gone in recent sessions
  "Strength"    — consistently praised throughout
  "Gap"         — weak area without a clear time signal

VIZ — one visualization that best illuminates the answer:
  bars    → { "type": "bars",    "title": "...", "items": [{"label":"...", "value": 0.0},...], "maxValue": 5 }
  scatter → { "type": "scatter", "title": "...", "points": [{"x": 1, "y": 3.5, "label": "01"},...], "xLabel": "Session", "yLabel": "Score" }
  table   → { "type": "table",   "title": "...", "headers": ["...","..."], "rows": [["...","..."],...] }
  none    → { "type": "none",    "title": "" }

Viz selection: recurring themes → bars | score over time → scatter | before/after contrasts → table.
Compute all viz values from the CSV data. maxValue for bars is 5. Never fabricate quotes.

Example output:
{
  "blocks": [
    { "type": "heading", "text": "Competitive Analysis Gap", "tag": "Persisting" },
    { "type": "paragraph", "text": "Interviewers flagged missing competitive dynamics in 5 of 7 Market Entry sessions, from October through March." },
    { "type": "bullet", "text": "Cases 05, 23, 35: named competitors but skipped moat analysis and competitive intensity" },
    { "type": "bullet", "text": "Case 40: structure improved but competitive assessment still felt like a checkbox" },
    { "type": "quote", "text": "You told me how to enter but never whether to enter.", "caseId": "05", "date": "2025-10-22" },
    { "type": "divider", "text": "" },
    { "type": "heading", "text": "Delivery Arc", "tag": "Improving" },
    { "type": "paragraph", "text": "The language interviewers used about delivery shifted completely between October and March." },
    { "type": "bullet", "text": "Oct–Dec (Cases 01, 08, 11): 'hesitant', 'second-guessing', 'apologizing for estimates'" },
    { "type": "bullet", "text": "Feb–Mar (Cases 27, 31): 'confident', 'natural', 'owned the room'" },
    { "type": "quote", "text": "This might be the cleanest case I have seen from you.", "caseId": "31", "date": "2026-03-10" }
  ],
  "viz": {
    "type": "bars",
    "title": "Avg score by case type",
    "items": [{"label": "Market Entry", "value": 3.2}, {"label": "Profitability", "value": 3.7}],
    "maxValue": 5
  }
}`;
}

// ── Analysis mode prompts ─────────────────────────────────────────────────────
export const ANALYSIS_MODES = [
  {
    label: 'Feedback Patterns',
    description: 'What interviewers keep saying',
    prompt:
      'Analyze the recurring language across all my interviewer feedback. What themes appear in multiple sessions? Which concerns have persisted from October to March, and which ones have disappeared? Quote specific feedback where it illustrates the pattern.',
  },
  {
    label: 'By Case Type',
    description: 'Type-specific feedback deep-dive',
    prompt:
      'What does the interviewer feedback say specifically about my Market Entry and Profitability cases? Quote the verbal and written notes. What is the one thing interviewers keep flagging in Market Entry that they stopped flagging in Profitability?',
  },
  {
    label: 'Feedback Over Time',
    description: 'How the narrative has shifted',
    prompt:
      'Compare the language in my early feedback (October to December 2025) with my recent feedback (February to March 2026). What words and phrases appeared early that no longer appear? What new positive signals are interviewers using? Show the arc.',
  },
] as const;

// ── Gemini API call ───────────────────────────────────────────────────────────
export async function callGeminiFeedback(
  metrics: FAMetrics,
  history: ChatMessage[],
  userQuestion: string,
): Promise<FAResponse> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is not set.');

  const contents = [
    ...history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    })),
    { role: 'user', parts: [{ text: userQuestion }] },
  ];

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(metrics) }] },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1200,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: FA_RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `Gemini error ${response.status}: ${(err as any)?.error?.message ?? response.statusText}`
    );
  }

  const data = await response.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const raw = parts
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? '')
    .join('')
    .trim();

  try {
    const parsed: FAResponse = JSON.parse(raw);
    if (!parsed.blocks || !Array.isArray(parsed.blocks) || !parsed.viz) {
      throw new Error('Invalid structure');
    }
    return parsed;
  } catch {
    // Fallback: render raw text as a single paragraph block
    return {
      blocks: [{ type: 'paragraph', text: raw || 'Something went wrong. Please try again.' }],
      viz: { type: 'none', title: '' },
    };
  }
}

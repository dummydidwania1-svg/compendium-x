import { apiPost } from '@/lib/api/client';
import type { FAMetrics } from '@/lib/feedbackPrecompute';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface FABlock {
  type: 'heading' | 'paragraph' | 'bullet' | 'quote' | 'divider';
  text: string;
  tag?: string;      // for heading: "Persisting" | "Improving" | "Emerging" | "Early only" | "Strength" | "Gap"
  caseKey?: string;  // for quote: stable evaluation key (unambiguous across repeated cases)
  caseLabel?: string;// for quote: human-facing case title
  date?: string;     // for quote
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
  text: string;        // plain-text summary — used for conversation history
  response?: FAResponse; // structured response — used for rendering
}

/**
 * Analysis mode shortcuts — built from the user's ACTUAL data. The old
 * hardcoded variants ("persisted from October to March", "Market Entry vs
 * Profitability") referenced demo-era dates and types that frequently didn't
 * exist in the user's history, which was the single biggest driver of generic
 * or hallucinated output.
 */
export function buildAnalysisModes(m: FAMetrics): Array<{ label: string; description: string; prompt: string }> {
  const start = m.dateRange.start || 'your first session';
  const end = m.dateRange.end || 'your latest session';

  const types = Object.entries(m.typeBreakdown);
  let typePair = '';
  if (types.length >= 2) {
    const sorted = [...types].sort((a, b) => a[1].avgScore - b[1].avgScore);
    typePair = `Focus especially on ${sorted[0][0]} versus ${sorted[sorted.length - 1][0]}.`;
  } else if (types.length === 1) {
    typePair = `All my sessions are ${types[0][0]} cases.`;
  }

  return [
    {
      label: 'Feedback Patterns',
      description: 'What interviewers keep saying',
      prompt: `Analyze the recurring language across all my interviewer feedback (${start} to ${end}). What themes appear in multiple sessions? Which concerns have persisted and which have disappeared? For each pattern give me evidence and one specific drill to fix it. Quote specific feedback where it illustrates the pattern.`,
    },
    {
      label: 'By Case Type',
      description: 'Type-specific feedback deep-dive',
      prompt: `What does interviewer feedback say about each of my case types? ${typePair} Quote the verbal and written notes. What is the one thing interviewers keep flagging in my weakest type?`,
    },
    {
      label: 'Feedback Over Time',
      description: 'How the narrative has shifted',
      prompt: `Compare the language in my early feedback with my recent feedback (my history runs ${start} to ${end}). What words and phrases appeared early that no longer appear? What new positive signals are interviewers using? Show the arc.`,
    },
    {
      label: 'Full Report',
      description: 'Patterns, strengths, and this week\u2019s drills',
      prompt: 'Build my full feedback report.',
    },
  ];
}

/**
 * Calls the server-side analyser proxy (authenticatedRoute + rate limiting +
 * server-only Gemini key). The client never sees an API key anymore.
 *
 * focusKey optionally names one case (evaluation key): the server pulls that
 * session's FULL transcript and grounds this single answer in the entire
 * conversation instead of the closing-tail excerpt.
 */
export async function callGeminiFeedback(
  metrics: FAMetrics,
  history: ChatMessage[],
  userQuestion: string,
  focusKey?: string,
): Promise<FAResponse> {
  const res = await apiPost<{ response: FAResponse }>('/api/feedback-analyser', {
    metrics,
    history: history.map((msg) => ({ role: msg.role, text: msg.text })),
    question: userQuestion,
    ...(focusKey ? { focusKey } : {}),
  });
  return res.response;
}

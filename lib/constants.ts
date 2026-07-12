export const COLORS = {
dark: '#3B2F2F',
warm: '#5C4033',
base: '#fff8f0',
subtle: '#D9D0C4',
accent: '#3D5A35',
};

/**
 * Custom ("do your own case") mode.
 *
 * A session whose `caseSource` is `'custom'` carries no curated case document.
 * Instead of a repository `caseId`, it uses this reserved sentinel so every
 * existing code path that keys off `caseId` (routing, storage paths, eval
 * writes) keeps working without a parallel pipeline. The sentinel is
 * deliberately not a valid Firestore `cases` document id, so custom sessions
 * can never be mistaken for a repository case.
 */
export const OWN_CASE_ID = 'own-case'

/** Neutral, brand-consistent title shown wherever a repository case title would appear. */
export const CUSTOM_CASE_TITLE = 'Your Own Case'

export const FILTER_TYPES = [
'Profitability',
'Market Entry',
'Pricing',
'Growth',
'Unconventional',
'Guesstimate'
];

export const FILTER_LEVELS = ['Easy', 'Medium', 'Hard'];

export const FILTER_TIME_OPTIONS = [
{ value: 'all', label: 'All Time' },
{ value: 'last7', label: 'Last 7 Days' },
{ value: 'last30', label: 'Last 30 Days' },
{ value: 'custom', label: 'Custom Range' },
];

// Flat weights kept for legacy reference only — not used for scoring.
export const PARAM_WEIGHTS = {
  structure: 0.30,
  delivery: 0.30,
  analysis: 0.20,
  creativity: 0.20,
};

export const PARAM_LABELS: Record<string, string> = {
  structure: 'Framework & Structure',
  delivery: 'Delivery & Communication',
  analysis: 'Problem Understanding',
  creativity: 'Creativity',
};

// Per-case-type weight matrix. Weights sum to 1.0 in every row.
export type CaseWeightRow = { structure: number; analysis: number; delivery: number; creativity: number }

export const CASE_TYPE_WEIGHTS: Record<string, CaseWeightRow> = {
  'Profitability':  { structure: 0.40, analysis: 0.25, delivery: 0.20, creativity: 0.15 },
  'Market Entry':   { structure: 0.30, analysis: 0.30, delivery: 0.25, creativity: 0.15 },
  'Growth':         { structure: 0.30, analysis: 0.15, delivery: 0.20, creativity: 0.35 },
  'Pricing':        { structure: 0.20, analysis: 0.25, delivery: 0.20, creativity: 0.35 },
  'Guesstimate':    { structure: 0.25, analysis: 0.25, delivery: 0.25, creativity: 0.25 },
  'Unconventional': { structure: 0.25, analysis: 0.25, delivery: 0.25, creativity: 0.25 },
}

// Fallback for unknown / General case types — equal weights.
export const DEFAULT_CASE_WEIGHTS: CaseWeightRow = { structure: 0.25, analysis: 0.25, delivery: 0.25, creativity: 0.25 }

export function getCaseTypeWeights(caseType: string | null | undefined): CaseWeightRow {
  if (!caseType) return DEFAULT_CASE_WEIGHTS
  return CASE_TYPE_WEIGHTS[caseType] ?? DEFAULT_CASE_WEIGHTS
}

// Canonical category order for the book-style Table of Contents grouping.
// Matches the section ordering used in the printed edition.
export const REPO_SECTION_ORDER = [
  'Profitability',
  'Market Entry',
  'Growth',
  'Pricing',
  'Unconventional',
  'Guesstimate',
];

// Difficulty -> number of filled "book dots" (out of 3).
export const DIFFICULTY_DOTS: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};
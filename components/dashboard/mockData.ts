export type CaseType =
  | 'Profitability'
  | 'Market Entry'
  | 'Growth'
  | 'Pricing'
  | 'Unconventional'

export type CaseLevel = 'Easy' | 'Medium' | 'Hard'

export type CaseEntry = {
  id: string
  name: string
  type: CaseType
  level: CaseLevel
  date: string
  score: number
  hasTranscript: boolean
  hasPDF: boolean
  transcript: string
}

export type ParameterScores = {
  structure: number
  delivery: number
  creativity: number
  analysis: number
}

export type TimeDataPoint = {
  date: string
  overallScore: number
  structure: number
  delivery: number
  creativity: number
  analysis: number
  caseName: string
  caseType: CaseType
}

export type GoalState = {
  targetCasesMonthly: number
  targetAverageScore: number
}

export const CASE_TYPE_OPTIONS: Array<'All' | CaseType> = [
  'All',
  'Profitability',
  'Market Entry',
  'Growth',
  'Pricing',
  'Unconventional',
]

export const CASE_LEVEL_OPTIONS: Array<'All' | CaseLevel> = [
  'All',
  'Easy',
  'Medium',
  'Hard',
]

export const TIME_OPTIONS = [
  'This Month',
  'This Week',
  'Last 3 Months',
  'Last 6 Months',
  'All Time',
  'Custom Date Range',
] as const

export type TimeFilter = (typeof TIME_OPTIONS)[number]

export const MOCK_CASE_HISTORY: CaseEntry[] = [
  {
    id: 'case-001',
    name: 'McKinsey Profitability - Airline Turnaround',
    type: 'Profitability',
    level: 'Hard',
    date: '2026-03-12',
    score: 82,
    hasTranscript: true,
    hasPDF: true,
    transcript:
      'Candidate segmented revenue and cost streams clearly, then identified load-factor deterioration as the primary driver.',
  },
  {
    id: 'case-002',
    name: 'Market Entry - EV Charging India',
    type: 'Market Entry',
    level: 'Medium',
    date: '2026-03-08',
    score: 76,
    hasTranscript: true,
    hasPDF: false,
    transcript:
      'Candidate built a structured market attractiveness lens and recommended a metro-first rollout with phased capex.',
  },
  {
    id: 'case-003',
    name: 'Growth - Subscription Box Scale',
    type: 'Growth',
    level: 'Medium',
    date: '2026-02-25',
    score: 88,
    hasTranscript: true,
    hasPDF: true,
    transcript:
      'Strong customer segmentation and lifecycle monetization plan. Quant assumptions were explicit and defensible.',
  },
  {
    id: 'case-004',
    name: 'Bain Pricing - D2C Premium',
    type: 'Pricing',
    level: 'Hard',
    date: '2026-02-18',
    score: 91,
    hasTranscript: true,
    hasPDF: true,
    transcript:
      'Candidate used willingness-to-pay ladders and SKU architecture to recommend premium tier repricing.',
  },
  {
    id: 'case-005',
    name: 'Unconventional - Sports League Rights',
    type: 'Unconventional',
    level: 'Hard',
    date: '2026-02-10',
    score: 65,
    hasTranscript: true,
    hasPDF: false,
    transcript:
      'Creative thinking was strong, but financial model lacked detail and scenario sensitivity.',
  },
  {
    id: 'case-006',
    name: 'Profitability - Quick Commerce Unit Economics',
    type: 'Profitability',
    level: 'Easy',
    date: '2026-01-28',
    score: 84,
    hasTranscript: true,
    hasPDF: true,
    transcript:
      'Good decomposition of contribution margin and cohort behavior. Recommendation focused on AOV and delivery batching.',
  },
  {
    id: 'case-007',
    name: 'Growth - SaaS Expansion APAC',
    type: 'Growth',
    level: 'Hard',
    date: '2026-01-20',
    score: 78,
    hasTranscript: true,
    hasPDF: false,
    transcript:
      'Candidate identified channel and pricing levers, but sequencing of GTM investments needed tighter prioritization.',
  },
  {
    id: 'case-008',
    name: 'Pricing - Fintech Credit Card Launch',
    type: 'Pricing',
    level: 'Medium',
    date: '2026-01-12',
    score: 80,
    hasTranscript: true,
    hasPDF: true,
    transcript:
      'Balanced customer value proposition with interchange economics and risk-adjusted margin assumptions.',
  },
]

export const PARAMETER_SCORES: ParameterScores = {
  structure: 82,
  delivery: 71,
  creativity: 68,
  analysis: 74,
}

export const CASE_TYPE_BREAKDOWN: Array<{ type: CaseType; score: number }> = [
  { type: 'Profitability', score: 82 },
  { type: 'Market Entry', score: 76 },
  { type: 'Growth', score: 88 },
  { type: 'Pricing', score: 91 },
  { type: 'Unconventional', score: 65 },
]

export const PARAMETER_DRILLDOWN: Record<
  keyof ParameterScores,
  {
    byCaseType: Array<{ label: CaseType; score: number }>
    byDifficulty: Array<{ label: CaseLevel; score: number }>
  }
> = {
  structure: {
    byCaseType: [
      { label: 'Profitability', score: 85 },
      { label: 'Market Entry', score: 79 },
      { label: 'Growth', score: 84 },
      { label: 'Pricing', score: 86 },
      { label: 'Unconventional', score: 70 },
    ],
    byDifficulty: [
      { label: 'Easy', score: 88 },
      { label: 'Medium', score: 82 },
      { label: 'Hard', score: 76 },
    ],
  },
  delivery: {
    byCaseType: [
      { label: 'Profitability', score: 74 },
      { label: 'Market Entry', score: 70 },
      { label: 'Growth', score: 73 },
      { label: 'Pricing', score: 75 },
      { label: 'Unconventional', score: 62 },
    ],
    byDifficulty: [
      { label: 'Easy', score: 77 },
      { label: 'Medium', score: 72 },
      { label: 'Hard', score: 67 },
    ],
  },
  creativity: {
    byCaseType: [
      { label: 'Profitability', score: 66 },
      { label: 'Market Entry', score: 67 },
      { label: 'Growth', score: 74 },
      { label: 'Pricing', score: 71 },
      { label: 'Unconventional', score: 72 },
    ],
    byDifficulty: [
      { label: 'Easy', score: 69 },
      { label: 'Medium', score: 70 },
      { label: 'Hard', score: 65 },
    ],
  },
  analysis: {
    byCaseType: [
      { label: 'Profitability', score: 78 },
      { label: 'Market Entry', score: 72 },
      { label: 'Growth', score: 74 },
      { label: 'Pricing', score: 81 },
      { label: 'Unconventional', score: 64 },
    ],
    byDifficulty: [
      { label: 'Easy', score: 79 },
      { label: 'Medium', score: 75 },
      { label: 'Hard', score: 70 },
    ],
  },
}

export const TIME_SERIES_DATA: TimeDataPoint[] = [
  {
    date: '2026-01-03',
    overallScore: 72,
    structure: 74,
    delivery: 68,
    creativity: 66,
    analysis: 70,
    caseName: 'Quick Commerce Unit Economics',
    caseType: 'Profitability',
  },
  {
    date: '2026-01-08',
    overallScore: 68,
    structure: 70,
    delivery: 66,
    creativity: 64,
    analysis: 69,
    caseName: 'Retail Expansion Midwest',
    caseType: 'Market Entry',
  },
  {
    date: '2026-01-15',
    overallScore: 75,
    structure: 76,
    delivery: 71,
    creativity: 67,
    analysis: 74,
    caseName: 'Telecom Churn Reduction',
    caseType: 'Growth',
  },
  {
    date: '2026-01-24',
    overallScore: 80,
    structure: 82,
    delivery: 74,
    creativity: 70,
    analysis: 78,
    caseName: 'D2C Pricing Architecture',
    caseType: 'Pricing',
  },
  {
    date: '2026-01-30',
    overallScore: 77,
    structure: 79,
    delivery: 73,
    creativity: 69,
    analysis: 75,
    caseName: 'Healthcare Market Entry',
    caseType: 'Market Entry',
  },
  {
    date: '2026-02-07',
    overallScore: 82,
    structure: 84,
    delivery: 75,
    creativity: 72,
    analysis: 80,
    caseName: 'Airline Turnaround',
    caseType: 'Profitability',
  },
  {
    date: '2026-02-14',
    overallScore: 79,
    structure: 80,
    delivery: 74,
    creativity: 71,
    analysis: 77,
    caseName: 'SaaS Expansion APAC',
    caseType: 'Growth',
  },
  {
    date: '2026-02-21',
    overallScore: 85,
    structure: 87,
    delivery: 77,
    creativity: 74,
    analysis: 83,
    caseName: 'Private Label Margin Defense',
    caseType: 'Profitability',
  },
  {
    date: '2026-02-27',
    overallScore: 81,
    structure: 83,
    delivery: 75,
    creativity: 73,
    analysis: 79,
    caseName: 'Consumer Electronics Pricing',
    caseType: 'Pricing',
  },
  {
    date: '2026-03-04',
    overallScore: 78,
    structure: 80,
    delivery: 72,
    creativity: 70,
    analysis: 76,
    caseName: 'EV Charging India',
    caseType: 'Market Entry',
  },
  {
    date: '2026-03-10',
    overallScore: 88,
    structure: 89,
    delivery: 79,
    creativity: 76,
    analysis: 86,
    caseName: 'Subscription Box Scale',
    caseType: 'Growth',
  },
  {
    date: '2026-03-14',
    overallScore: 84,
    structure: 86,
    delivery: 77,
    creativity: 75,
    analysis: 82,
    caseName: 'Fintech Credit Card Launch',
    caseType: 'Pricing',
  },
]

export const COACH_INSIGHT = {
  headline: 'Your structure scores have improved 15% this month.',
  focus:
    "Focus on quantitative analysis - it's your weakest parameter across all case types.",
  recommendation:
    'Try a Pricing case next to diversify your practice.',
}

export const DEFAULT_GOAL_STATE: GoalState = {
  targetCasesMonthly: 20,
  targetAverageScore: 85,
}

export const DYNAMIC_QUESTION_PROMPTS = [
  "How's my structure improving?",
  'What should I focus on next?',
  'Compare profitability vs. pricing',
]

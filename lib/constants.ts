export const COLORS = {
dark: '#3B2F2F',
warm: '#5C4033',
base: '#fff8f0',
subtle: '#D9D0C4',
accent: '#3D5A35',
};

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

// ADD these at the bottom of constants.ts:
export const PARAM_WEIGHTS = {
  structure: 0.30,
  delivery: 0.30,
  analysis: 0.20,
  creativity: 0.20,
};

export const PARAM_LABELS: Record<string, string> = {
  structure: 'Structure',
  delivery: 'Delivery',
  analysis: 'Analysis',
  creativity: 'Creativity',
};
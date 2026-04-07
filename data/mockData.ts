// ══════════════════════════════════════════════════════════
// CASE COMPENDIUM 4.0 — MOCK DATA
// Persona: 5.5-month prep journey, 45 cases (Oct 2025 – Mar 2026)
//
// Embedded patterns for AI coach testing:
//  • Analysis improving:      ~1.0 in Oct → ~3.0 in Mar sprint
//  • Structure improving:      ~1.25 in Oct → ~3.25 in Mar sprint
//  • Creativity FLAT:          3.0–5.0 throughout, no clear trend
//  • Market Entry structure:   persistently weak (~1.2 avg vs ~2.3 global)
//  • Hard cases:               ALL 4 params lower than Easy/Medium averages
//  • Outlier (case 17):        Pricing Hard Jan 15 — S:0.5, A:0.5, C:1.5, D:0.5
//  • Post-break dip:           Break Feb 17-18; Feb 19 dips vs Feb 15-16 baseline
//  • Guesstimate Medium > Easy (Medium cases happen to be more recent)
//  • 14-day streak ending Mar 23 (today) — Mar 10 through Mar 23
// ══════════════════════════════════════════════════════════

// Weights: Structure 30%, Delivery 30%, Analysis 20%, Creativity 20%
// All parameter scores on 0–5 scale (0.5 increments)

export const MOCK_CASES = [
  // ── OCT 2025: Raw beginner, everything rough except creativity ──
  { id: '01', name: 'Banking on You',            type: 'Profitability',  level: 'Easy',   date: '2025-10-05', structure: 1.5, analysis: 1.0, creativity: 4.0, delivery: 1.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '02', name: 'How Many Dosas in Delhi?',  type: 'Guesstimate',    level: 'Easy',   date: '2025-10-12', structure: 1.0, analysis: 1.5, creativity: 4.5, delivery: 1.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: true,  summary: '' },
  { id: '03', name: 'Grow or Go Home',           type: 'Growth',         level: 'Medium', date: '2025-10-20', structure: 1.0, analysis: 1.0, creativity: 3.5, delivery: 1.5, score: 0, hasTranscript: false, hasPDF: false, hasSnapshot: true,  hasAudio: false, summary: '' },
  { id: '04', name: 'The Price Is Right',        type: 'Pricing',        level: 'Medium', date: '2025-10-28', structure: 1.5, analysis: 0.5, creativity: 3.5, delivery: 2.0, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: false, summary: '' },

  // ── NOV 2025: Starting to get the hang of frameworks ──
  { id: '05', name: 'Enter the Dragon',          type: 'Market Entry',   level: 'Easy',   date: '2025-11-03', structure: 0.5, analysis: 1.0, creativity: 4.0, delivery: 2.0, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: false, hasAudio: true,  summary: '' },
  { id: '06', name: 'Out of the Box',            type: 'Unconventional', level: 'Easy',   date: '2025-11-10', structure: 1.5, analysis: 1.0, creativity: 5.0, delivery: 2.0, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: true,  hasAudio: false, summary: '' },
  { id: '07', name: 'Oil Be Back',               type: 'Profitability',  level: 'Medium', date: '2025-11-17', structure: 2.0, analysis: 1.0, creativity: 3.5, delivery: 2.0, score: 0, hasTranscript: false, hasPDF: false, hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '08', name: 'Count the Clouds',          type: 'Guesstimate',    level: 'Easy',   date: '2025-11-24', structure: 1.5, analysis: 2.0, creativity: 4.5, delivery: 2.0, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: true,  summary: '' },

  // ── DEC 2025: Plateau, some cases feel like regression ──
  { id: '09', name: 'East India Comeback',       type: 'Market Entry',   level: 'Hard',   date: '2025-11-30', structure: 0.5, analysis: 1.0, creativity: 3.0, delivery: 1.0, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: true,  hasAudio: false, summary: '' },
  { id: '10', name: 'Bloom & Doom',              type: 'Growth',         level: 'Easy',   date: '2025-12-05', structure: 2.0, analysis: 1.5, creativity: 4.0, delivery: 2.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: true,  summary: '' },
  { id: '11', name: 'Price Check, Aisle 3',      type: 'Pricing',        level: 'Hard',   date: '2025-12-12', structure: 1.0, analysis: 0.5, creativity: 2.5, delivery: 1.5, score: 0, hasTranscript: false, hasPDF: false, hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '12', name: 'Profit & Prejudice',        type: 'Profitability',  level: 'Easy',   date: '2025-12-19', structure: 2.5, analysis: 1.5, creativity: 4.0, delivery: 2.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: true,  hasAudio: true,  summary: '' },
  { id: '13', name: 'Enter, Intruder',           type: 'Market Entry',   level: 'Medium', date: '2025-12-26', structure: 0.5, analysis: 1.5, creativity: 4.0, delivery: 2.0, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '14', name: 'Think Outside the Box, Twice', type: 'Unconventional', level: 'Medium', date: '2025-12-31', structure: 1.5, analysis: 1.5, creativity: 5.0, delivery: 2.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: true,  summary: '' },

  // ── JAN 2026: Slow climb, structure improving, analysis still lagging ──
  { id: '15', name: 'Losing Sleep Over Losses',  type: 'Profitability',  level: 'Hard',   date: '2026-01-06', structure: 2.0, analysis: 1.0, creativity: 2.5, delivery: 2.0, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '16', name: 'Back of the Envelope',      type: 'Guesstimate',    level: 'Medium', date: '2026-01-12', structure: 2.5, analysis: 2.5, creativity: 4.5, delivery: 2.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: true,  summary: '' },
  // OUTLIER — catastrophic Pricing Hard session, drags Pricing avg down significantly
  { id: '17', name: 'The Black Monday',          type: 'Pricing',        level: 'Hard',   date: '2026-01-15', structure: 0.5, analysis: 0.5, creativity: 1.5, delivery: 0.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: true,  hasAudio: false, summary: '' },
  { id: '18', name: 'Gro-wl',                    type: 'Growth',         level: 'Medium', date: '2026-01-18', structure: 2.0, analysis: 1.5, creativity: 4.0, delivery: 3.0, score: 0, hasTranscript: false, hasPDF: false, hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '19', name: 'How Much Is That Doggie?',  type: 'Pricing',        level: 'Hard',   date: '2026-01-24', structure: 1.5, analysis: 2.0, creativity: 2.5, delivery: 2.0, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '20', name: 'New Kid on the Block',      type: 'Market Entry',   level: 'Easy',   date: '2026-01-30', structure: 1.0, analysis: 1.5, creativity: 4.0, delivery: 2.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: false, hasAudio: true,  summary: '' },

  // ── FEB 2026: Building momentum, noticeable improvement ──
  { id: '21', name: 'The Comeback Kid',          type: 'Profitability',  level: 'Easy',   date: '2026-02-04', structure: 3.0, analysis: 2.0, creativity: 4.0, delivery: 3.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: true,  hasAudio: false, summary: '' },
  { id: '22', name: 'Scaling Mount Revenue',     type: 'Growth',         level: 'Hard',   date: '2026-02-10', structure: 2.0, analysis: 1.5, creativity: 3.0, delivery: 2.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: false, hasAudio: true,  summary: '' },
  // PRE-BREAK baseline — Feb 15-16 before the Feb 17-18 break
  { id: '23', name: 'Foothold',                  type: 'Market Entry',   level: 'Medium', date: '2026-02-15', structure: 2.0, analysis: 2.0, creativity: 4.0, delivery: 3.0, score: 0, hasTranscript: false, hasPDF: false, hasSnapshot: true,  hasAudio: false, summary: '' },
  { id: '24', name: 'Wild Card',                 type: 'Unconventional', level: 'Easy',   date: '2026-02-16', structure: 3.0, analysis: 2.0, creativity: 5.0, delivery: 3.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: true,  summary: '' },
  // [BREAK: Feb 17-18 — no practice] ──────────────────────────────
  // POST-BREAK DIP — first case after 2-day break, structure & delivery slip
  { id: '25', name: 'Rusty Start',               type: 'Profitability',  level: 'Medium', date: '2026-02-19', structure: 2.0, analysis: 1.5, creativity: 3.5, delivery: 2.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '26', name: 'Back in Business',          type: 'Growth',         level: 'Easy',   date: '2026-02-23', structure: 2.5, analysis: 2.0, creativity: 4.0, delivery: 2.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '27', name: "Numbers Don't Lie",         type: 'Guesstimate',    level: 'Hard',   date: '2026-02-28', structure: 2.0, analysis: 2.0, creativity: 3.5, delivery: 2.0, score: 0, hasTranscript: false, hasPDF: false, hasSnapshot: true,  hasAudio: false, summary: '' },

  // ── EARLY MAR 2026: Momentum building ──
  { id: '28', name: 'Profit at Last',            type: 'Profitability',  level: 'Hard',   date: '2026-03-01', structure: 3.0, analysis: 2.0, creativity: 3.0, delivery: 3.0, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: true,  summary: '' },
  { id: '29', name: 'Sherlock Guestimates',      type: 'Guesstimate',    level: 'Medium', date: '2026-03-03', structure: 3.0, analysis: 3.0, creativity: 4.5, delivery: 3.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: true,  hasAudio: false, summary: '' },
  { id: '30', name: 'Beachhead Blues',           type: 'Market Entry',   level: 'Hard',   date: '2026-03-07', structure: 1.5, analysis: 2.0, creativity: 3.0, delivery: 1.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '31', name: 'Mind the Gap',             type: 'Unconventional', level: 'Easy',   date: '2026-03-08', structure: 3.5, analysis: 2.5, creativity: 5.0, delivery: 4.0, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: true,  hasAudio: true,  summary: '' },
  // [GAP: Mar 9 — no practice] ─────────────────────────────────────
  // ══════════════════════════════════════════════════════════
  // 14-DAY STREAK: Mar 10 – Mar 23 (today)
  // ══════════════════════════════════════════════════════════
  { id: '32', name: 'Full Sprint',               type: 'Growth',         level: 'Medium', date: '2026-03-10', structure: 3.5, analysis: 2.5, creativity: 4.0, delivery: 4.0, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: true,  summary: '' },
  { id: '33', name: 'Profit Machine',            type: 'Profitability',  level: 'Easy',   date: '2026-03-11', structure: 4.0, analysis: 3.0, creativity: 4.0, delivery: 4.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: true,  hasAudio: false, summary: '' },
  { id: '34', name: 'Priced to Perfection',      type: 'Pricing',        level: 'Medium', date: '2026-03-12', structure: 3.5, analysis: 3.0, creativity: 4.0, delivery: 4.0, score: 0, hasTranscript: false, hasPDF: true,  hasSnapshot: false, hasAudio: true,  summary: '' },
  { id: '35', name: 'Locked Out',                type: 'Market Entry',   level: 'Medium', date: '2026-03-13', structure: 2.0, analysis: 2.5, creativity: 4.0, delivery: 3.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '36', name: 'Left Field',                type: 'Unconventional', level: 'Hard',   date: '2026-03-14', structure: 2.5, analysis: 2.0, creativity: 4.0, delivery: 3.0, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: true,  hasAudio: false, summary: '' },
  { id: '37', name: 'Envelope, Again',           type: 'Guesstimate',    level: 'Hard',   date: '2026-03-15', structure: 3.0, analysis: 3.0, creativity: 4.0, delivery: 3.5, score: 0, hasTranscript: false, hasPDF: false, hasSnapshot: false, hasAudio: true,  summary: '' },
  { id: '38', name: 'In the Red',                type: 'Profitability',  level: 'Hard',   date: '2026-03-16', structure: 3.0, analysis: 2.5, creativity: 3.0, delivery: 3.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '39', name: 'Rocket Ship',               type: 'Growth',         level: 'Easy',   date: '2026-03-17', structure: 4.0, analysis: 3.5, creativity: 4.0, delivery: 4.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: true,  hasAudio: true,  summary: '' },
  { id: '40', name: 'The Hard Entry',            type: 'Market Entry',   level: 'Hard',   date: '2026-03-18', structure: 1.5, analysis: 2.5, creativity: 3.0, delivery: 1.5, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '41', name: 'Fair Price, Great Case',    type: 'Pricing',        level: 'Easy',   date: '2026-03-19', structure: 4.0, analysis: 3.5, creativity: 4.0, delivery: 4.5, score: 0, hasTranscript: false, hasPDF: false, hasSnapshot: true,  hasAudio: true,  summary: '' },
  { id: '42', name: 'No Wrong Answers',          type: 'Unconventional', level: 'Medium', date: '2026-03-20', structure: 3.5, analysis: 3.0, creativity: 5.0, delivery: 4.0, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '43', name: 'Million-Dollar Guess',      type: 'Guesstimate',    level: 'Easy',   date: '2026-03-21', structure: 4.0, analysis: 3.5, creativity: 4.5, delivery: 4.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: true,  hasAudio: true,  summary: '' },
  { id: '44', name: 'Final Push',                type: 'Profitability',  level: 'Medium', date: '2026-03-22', structure: 4.0, analysis: 3.0, creativity: 4.0, delivery: 4.0, score: 0, hasTranscript: true,  hasPDF: true,  hasSnapshot: false, hasAudio: false, summary: '' },
  { id: '45', name: 'Last One Standing',         type: 'Growth',         level: 'Hard',   date: '2026-03-23', structure: 3.0, analysis: 3.0, creativity: 3.5, delivery: 3.5, score: 0, hasTranscript: true,  hasPDF: false, hasSnapshot: false, hasAudio: true,  summary: '' },
];

// ── Auto-compute weighted scores ──
// Weights: Structure 30%, Delivery 30%, Analysis 20%, Creativity 20%
MOCK_CASES.forEach((c) => {
  c.score = +(
    c.structure * 0.30 +
    c.delivery  * 0.30 +
    c.analysis  * 0.20 +
    c.creativity * 0.20
  ).toFixed(1);
});

// ══════════════════════════════════════════════════════════
// PARAMETER SCORES (overall averages across all 45 cases)
// ══════════════════════════════════════════════════════════
export const PARAMETER_SCORES = [
  { name: 'Structure',  score: 2.3 },
  { name: 'Delivery',   score: 2.7 },
  { name: 'Analysis',   score: 2.0 },
  { name: 'Creativity', score: 3.8 },
];

// ══════════════════════════════════════════════════════════
// DYNAMIC QUESTIONS (for the Feedback Analyser agent)
// ══════════════════════════════════════════════════════════
export const DYNAMIC_QUESTIONS = [
  "Why is my creativity score not improving despite practicing more?",
  "How has my structure evolved since October?",
  "Why do I consistently struggle with Market Entry cases?",
];

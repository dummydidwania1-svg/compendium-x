// ══════════════════════════════════════════════════════════
// MOCK CORE FEEDBACK DATA (CFD)
// Simulates what the FA model ingests in production:
//   • Interviewer written notes (per feedback bucket)
//   • AI-transcribed verbal feedback (post-interview)
//   • Tied to case ID, type, difficulty, and date
//
// Patterns embedded for AI analysis:
//   • Market Entry: "competitive analysis" gap recurs in 5/7 cases
//   • Delivery arc: "hesitant" Oct–Dec → "confident" Feb–Mar
//   • Analysis: "rushed/skipped math" Nov–Jan → "methodical" Feb–Mar
//   • Creativity: praised consistently throughout
//   • Case #17 (outlier): total breakdown, exceptional feedback
// ══════════════════════════════════════════════════════════

export interface CaseFeedback {
  id: string;
  notes: string;
  verbal: string;
}

export const MOCK_FEEDBACK: CaseFeedback[] = [
  {
    id: '01',
    notes: 'No problem framing before diving in. Revenue and costs covered but no explicit tree. Creative hypothesis mid-case was strong.',
    verbal: 'You jumped straight into the framework without telling me where you were going. I had to infer your structure. The creativity mid-case was genuinely impressive — that pricing power angle was unexpected — but you need the skeleton visible first.',
  },
  {
    id: '05',
    notes: 'Market attractiveness not assessed. Market sizing skipped entirely. No competitive landscape. Entry mode was original.',
    verbal: 'You told me how to enter but never whether to enter. I needed TAM, competitive intensity, and barriers before we talk entry mode. The channel strategy you proposed was actually quite clever — just misplaced.',
  },
  {
    id: '08',
    notes: 'Estimation logic was sound. Segmentation approach sensible. Communication was hesitant and quiet throughout.',
    verbal: 'The math was fine but you were second-guessing yourself out loud the whole time. Every number came with a "I think" or "maybe". In a real interview that reads as uncertainty. The segmentation was smart — own it more.',
  },
  {
    id: '11',
    notes: 'Lost direction in second half. Pricing framework non-MECE at the cost-side. Willingness-to-pay analysis abandoned under time pressure.',
    verbal: 'You started well but when I pushed on elasticity the case fell apart. You abandoned the quantitative thread and started talking in circles. This is a hard case but you need a fallback when the math gets complex.',
  },
  {
    id: '14',
    notes: 'Best creative thinking so far. Lateral hypothesis well-argued. Structure still incomplete — buckets were not exhaustive.',
    verbal: 'This was the first time I really felt something different from you. The customer psychology angle was insightful and not something I see often. Structure still needs work — I felt like we were missing a whole cost dimension — but the creative upside is clearly there.',
  },
  {
    id: '17',
    notes: 'Complete structural breakdown within first 5 minutes. No framework established. Quantitative analysis absent. Candidate appeared overwhelmed.',
    verbal: 'I want to be direct with you: today was rough and you should know that. You lost your structure very early and never recovered it. The pricing math never materialized. This is a reset moment, not a setback — but something clearly went wrong with your preparation for hard pricing cases.',
  },
  {
    id: '21',
    notes: 'First case with clearly MECE structure at the opening. Revenue drivers segmented logically. Analysis was methodical, not rushed.',
    verbal: 'I noticed something different today — you set up the tree before diving in and you waited for me to confirm the direction. That discipline paid off. The revenue analysis was clean and the cost side had actual logic behind it. This is the standard.',
  },
  {
    id: '23',
    notes: 'Market sizing present but shallow. Competitive landscape still underdeveloped — named competitors but no dynamic analysis. Structure clearly improved.',
    verbal: 'You are getting the structure right now — that is real progress from where you were. But Market Entry still feels like you are going through the motions on the competitive side. I want you to tell me who you are going up against, what their moat is, and why you can win. Naming them is not enough.',
  },
  {
    id: '27',
    notes: 'Segmentation methodology clear. Quantitative confidence noticeably improved versus prior guesstimates. Delivery more assured.',
    verbal: 'Much better than your October and November guesstimates. You broke the problem down clearly and you committed to the numbers without backtracking. Delivery has genuinely improved — you are not apologizing for your estimates anymore. That matters.',
  },
  {
    id: '31',
    notes: 'Strong session. Creative hypothesis structurally backed for the first time. Communication natural and confident. Delivery consistent throughout.',
    verbal: 'This might be the cleanest case I have seen from you. The lateral thinking was there and for the first time it was properly backed by structure. Your communication was very natural — no hedging, no filler. You owned the room. This is what the trajectory has been building toward.',
  },
  {
    id: '35',
    notes: 'Market sizing present and reasoned. Structure solid. Competitive dynamics still surface-level — competitive moat not interrogated.',
    verbal: 'You have clearly been working on Market Entry. The sizing was there, the structure held. The competitive assessment is still your gap — you listed competitors but you did not tell me how the dynamics play out over time or what the incumbent moat looks like. That is the last piece.',
  },
  {
    id: '40',
    notes: 'Structure held under hard difficulty. Delivery strong and confident. Market sizing broke down when unit economics were probed — depth insufficient.',
    verbal: 'Honestly your communication and structure were impressive for a Hard Market Entry. You did not panic. Where you still lose me is the market math under pressure — when I pushed on unit economics you went quiet. The competitive analysis was better than before but still felt like a checkbox.',
  },
  {
    id: '44',
    notes: 'Near-complete case. Framework logical and MECE. Revenue analysis thorough. Stayed composed on curveball. Creativity slightly formulaic.',
    verbal: 'Really good. The framework was logical, the revenue analysis was thorough, and you stayed calm when I gave you the curveball on margins. Creativity was the only thing that felt a little by-the-book — you went straight to the standard hypothesis. Everything else was strong.',
  },
];

// Top recurring themes derived from feedback (used for initial greeting)
export const FEEDBACK_TOP_THEME =
  'competitive analysis gaps in Market Entry, recurring across 5 sessions';
export const FEEDBACK_COUNT = MOCK_FEEDBACK.length;

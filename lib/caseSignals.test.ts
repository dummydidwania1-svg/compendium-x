import { describe, it, expect } from 'vitest'
import { computeCaseSignals, type SignalTurn } from './caseSignals'

const MIN = 60_000

function remoteTurns(): SignalTurn[] {
  return [
    { offsetMs: 0, text: 'Our client is a mid-size apparel retailer facing declining profits. Take a look at this.', role: 'interviewer' },
    { offsetMs: 5_000, text: 'Before I structure this — is the goal to increase profits overall, and is the decline recent?', role: 'candidate' },
    { offsetMs: 12_000, text: 'Yes, profits have declined 20% in the last year.', role: 'interviewer' },
    { offsetMs: 15_000, text: 'I would like to explore three areas: revenue, costs, and one-off items. Let me start with revenue.', role: 'candidate' },
    { offsetMs: 40_000, text: 'Revenue equals price times volume. If volume fell 10% on 500 million revenue, that is a 50 million impact, which suggests we should check volumes first.', role: 'candidate' },
    { offsetMs: 95_000, text: 'Maybe we could also look at channel mix, I guess.', role: 'candidate' },
  ]
}

describe('computeCaseSignals — explicit roles (remote sessions)', () => {
  const s = computeCaseSignals(remoteTurns())!

  it('counts silences over 30 seconds and tracks the longest', () => {
    // Gap between 40s and 95s = 55s.
    expect(s.longSilenceCount).toBe(1)
    expect(s.longestSilenceSec).toBe(55)
  })

  it('counts opening clarifying questions from the candidate only', () => {
    // One '?' from the candidate inside the opening window; interviewer
    // turns excluded even though the prompt itself contains no '?'.
    expect(s.openingQuestionCount).toBe(1)
  })

  it('detects signposting language', () => {
    expect(s.signpostCount).toBeGreaterThanOrEqual(1)
  })

  it('computes math→insight linkage across calculation-bearing turns', () => {
    expect(s.calculationTurnCount).toBe(1)
    expect(s.mathInsightLinkage).toBe(1)
  })

  it('measures hedge density per 100 candidate words', () => {
    // "Maybe we could" + "I guess" in one short candidate turn.
    expect(s.hedgeDensity).toBeGreaterThan(0)
    expect(s.hedgePhrasesFound.length).toBeGreaterThanOrEqual(1)
  })

  it('reports explicit role mode and candidate talk ratio', () => {
    expect(s.roleMode).toBe('explicit')
    expect(s.candidateTalkRatio).not.toBeNull()
    expect(s.candidateTalkRatio!).toBeGreaterThan(0.3)
    expect(s.timingAvailable).toBe(true)
  })
})

describe('computeCaseSignals — S1/S2 diarized labels (split-screen)', () => {
  const s = computeCaseSignals([
    { offsetMs: 0, text: 'The client manufactures industrial pumps. Profits are down. Please investigate.', role: 'S1' },
    { offsetMs: 8_000, text: 'Sure. Can I confirm the objective is profit decline and the timeframe is one year?', role: 'S2' },
    { offsetMs: 20_000, text: 'That is right.', role: 'S1' },
  ])!

  it('infers roles: first speaker is the interviewer reading the prompt', () => {
    expect(s.roleMode).toBe('inferred')
    // Opening question counted because S2 resolves to candidate.
    expect(s.openingQuestionCount).toBe(1)
    expect(s.candidateTalkRatio).not.toBeNull()
  })
})

describe('computeCaseSignals — degraded inputs', () => {
  it('handles unattributed turns without crashing', () => {
    const s = computeCaseSignals([
      { offsetMs: 0, text: 'Hello there.' },
      { offsetMs: 4 * MIN, text: 'Let us begin.' },
    ])!
    expect(s.roleMode).toBe('none')
    expect(s.candidateTalkRatio).toBeNull()
  })

  it('marks timing unavailable when offsets are missing', () => {
    const s = computeCaseSignals([
      { offsetMs: null, text: 'One' },
      { offsetMs: null, text: 'Two' },
    ])!
    expect(s.timingAvailable).toBe(false)
    expect(s.longSilenceCount).toBe(0)
  })

  it('returns null for empty input', () => {
    expect(computeCaseSignals(null)).toBeNull()
    expect(computeCaseSignals([])).toBeNull()
  })
})

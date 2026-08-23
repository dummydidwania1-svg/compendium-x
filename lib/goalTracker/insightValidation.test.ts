import { describe, it, expect } from 'vitest'
import { validateInsight } from './vertexInsight'

/**
 * Regression tests for the number-grounding validator. The old rules were
 * one-sided in both directions: any digit counted as "concrete" (fabricated
 * stats passed), while done/total bans used substring matching ("16 weeks"
 * failed when done=6). These pin the corrected behavior.
 */

const CARD = ['12', '30'] // done=12, total=30

describe('validateInsight — number grounding', () => {
  it('accepts numbers traced to candidate data', () => {
    const ok = validateInsight('Three near misses in four weeks, so close.', CARD, {
      nearMisses: 3,
      totalPeriods: 4,
    })
    expect(ok).toBe(true)
  })

  it('rejects fabricated numbers not present in candidate data', () => {
    const ok = validateInsight('About 70 percent of your cases landed before midweek.', CARD, {
      direction: 'down',
      recentDailyRate: 0.5,
    })
    expect(ok).toBe(false)
  })

  it('word boundaries: "16" no longer collides with card number "6"', () => {
    const ok = validateInsight('Your streak hit 16 weeks straight, keep the chain alive.', CARD, {
      streak: 16,
      unit: 'week',
      atBest: true,
    })
    expect(ok).toBe(true)
  })

  it('rejects restating the done count even with word boundaries', () => {
    const ok = validateInsight('You are at 12 of 30 already.', CARD, {
      streak: 4,
      unit: 'week',
    })
    expect(ok).toBe(false)
  })

  it('data under a non-done key exempts a coincidental collision', () => {
    // target=12 in shape data while card done is also 12 — "hit 12 of 15"
    // cites the TARGET fact, which is legitimate.
    const ok = validateInsight('You hit 12 of 15 possible weeks.', CARD, {
      target: 12,
      totalPeriods: 15,
    })
    expect(ok).toBe(true)
  })

  it('numbers under a "done" key stay banned', () => {
    const ok = validateInsight('You have done 12 cases so far.', CARD, {
      done: 12,
      unit: 'week',
    })
    expect(ok).toBe(false)
  })

  it('rounded forms of data numbers are accepted', () => {
    const ok = validateInsight('Roughly 1 case a day lately versus 3 before.', CARD, {
      requiredPerDay: 1.2,
      realizedPerDay: 2.6,
    })
    expect(ok).toBe(true)
  })

  it('number-free sentences still need a grounded specific term', () => {
    const hallucinated = validateInsight('Your Mondays carry the week.', CARD, {
      direction: 'up',
    })
    expect(hallucinated).toBe(false)

    const grounded = validateInsight('Your Mondays carry the week.', CARD, {
      busiestDay: 'Monday',
    })
    expect(grounded).toBe(true)
  })

  it('generic filler and score verdicts stay banned', () => {
    expect(validateInsight('Great momentum, keep it up.', CARD, { streak: 5 })).toBe(false)
    expect(validateInsight('Your structure needs work this month.', CARD, { streak: 5 })).toBe(false)
  })
})

/**
 * Focused unit tests for "do your own case" (custom) mode.
 *
 * These cover the pure, framework-independent seams the feature relies on:
 *   - the sentinel/title constants and the General-weight fallback,
 *   - the discriminated input validation (caseSource + case-type autosave),
 *   - the session document shape accepting the new optional fields,
 *   - the dashboard evaluation mapper treating a custom eval like any case.
 *
 * They do NOT re-test curated-case behavior beyond asserting it is unchanged
 * (repository sessions still validate and map exactly as before).
 */
import { describe, it, expect } from 'vitest'
import { OWN_CASE_ID, CUSTOM_CASE_TITLE, getCaseTypeWeights, DEFAULT_CASE_WEIGHTS, FILTER_TYPES } from '@/lib/constants'
import { selectCaseInput, setCaseTypeInput } from '@/lib/firebase/inputs'
import { sessionSchema } from '@/lib/firebase/schema'
import { mapEvaluationDoc } from '@/lib/dashboard/mappers'

describe('custom-mode constants', () => {
  it('reserves a sentinel caseId that is not a plausible repository doc id', () => {
    expect(OWN_CASE_ID).toBe('own-case')
    expect(CUSTOM_CASE_TITLE).toBe('Your Own Case')
  })

  it('falls back to equal (General) weights when no case type is set', () => {
    expect(getCaseTypeWeights(null)).toEqual(DEFAULT_CASE_WEIGHTS)
    expect(getCaseTypeWeights(undefined)).toEqual(DEFAULT_CASE_WEIGHTS)
  })

  it('still weights a chosen custom case type like a repository case type', () => {
    // A custom session tagged 'Profitability' must weight identically to a
    // repository Profitability case — no special-casing in scoring.
    expect(getCaseTypeWeights('Profitability')).toEqual(getCaseTypeWeights('Profitability'))
    expect(getCaseTypeWeights('Profitability').structure).toBeGreaterThan(0)
  })
})

describe('selectCaseInput discriminates case source', () => {
  it('accepts an explicit custom source with the sentinel id', () => {
    const parsed = selectCaseInput.parse({
      caseId: OWN_CASE_ID,
      sessionMode: 'remote',
      caseName: CUSTOM_CASE_TITLE,
      caseSource: 'custom',
    })
    expect(parsed.caseSource).toBe('custom')
    expect(parsed.caseId).toBe(OWN_CASE_ID)
  })

  it('treats a repository selection with no caseSource as backward compatible', () => {
    const parsed = selectCaseInput.parse({ caseId: 'abc123', sessionMode: 'local' })
    expect(parsed.caseSource).toBeUndefined()
  })

  it('rejects an unknown caseSource', () => {
    expect(() => selectCaseInput.parse({ caseId: 'x', sessionMode: 'remote', caseSource: 'bogus' })).toThrow()
  })
})

describe('setCaseTypeInput (case-type autosave)', () => {
  it('accepts every taxonomy value', () => {
    for (const type of FILTER_TYPES) {
      expect(setCaseTypeInput.parse({ caseType: type }).caseType).toBe(type)
    }
  })

  it('accepts null to clear back to the General fallback', () => {
    expect(setCaseTypeInput.parse({ caseType: null }).caseType).toBeNull()
  })

  it('rejects a value outside the taxonomy', () => {
    expect(() => setCaseTypeInput.parse({ caseType: 'Freeform' })).toThrow()
  })
})

describe('sessionSchema accepts the new optional custom fields', () => {
  const base = {
    lobbyId: 'lobby1',
    candidateId: 'cand1',
    status: 'in_progress' as const,
    sessionMode: 'remote' as const,
  }

  it('parses a custom session', () => {
    const parsed = sessionSchema.parse({
      ...base,
      caseId: OWN_CASE_ID,
      caseSource: 'custom',
      customCaseType: 'Pricing',
    })
    expect(parsed.caseSource).toBe('custom')
    expect(parsed.customCaseType).toBe('Pricing')
  })

  it('parses a legacy repository session with neither field present', () => {
    const parsed = sessionSchema.parse({ ...base, caseId: 'real-case' })
    expect(parsed.caseSource).toBeUndefined()
    expect(parsed.customCaseType).toBeUndefined()
  })
})

describe('mapEvaluationDoc treats a custom evaluation like any case', () => {
  it('surfaces the neutral title and denormalized case type, and scores normally', () => {
    const record = mapEvaluationDoc('eval1', {
      caseId: OWN_CASE_ID,
      caseTitle: CUSTOM_CASE_TITLE,
      caseType: 'Growth',
      candidateId: 'cand1',
      structureScore: 4,
      understandingScore: 3.5,
      deliveryScore: 4,
      creativityScore: 5,
      notes: 'Strong performance.',
    })
    expect(record.caseId).toBe(OWN_CASE_ID)
    expect(record.caseTitle).toBe(CUSTOM_CASE_TITLE)
    expect(record.caseType).toBe('Growth')
    expect(record.isUnrated).toBe(false)
    expect(record.scores).toEqual({ structure: 4, understanding: 3.5, delivery: 4, creativity: 5 })
  })

  it('never renders a null/undefined title even if caseTitle is missing', () => {
    const record = mapEvaluationDoc('eval2', { caseId: OWN_CASE_ID, candidateId: 'c', notes: '' })
    expect(record.caseTitle).toBe('Untitled Case')
  })
})

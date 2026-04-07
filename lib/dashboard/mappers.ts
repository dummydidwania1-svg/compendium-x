import type { DocumentData } from 'firebase/firestore'
import type { EvaluationRecord } from './types'

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

function asScore(value: unknown): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded >= 1 && rounded <= 5 ? rounded : null
}

export function mapEvaluationDoc(id: string, value: DocumentData): EvaluationRecord {
  const structureScore = asScore(value.structureScore)
  const understandingScore = asScore(value.understandingScore) ?? asScore(value.quantScore)
  const deliveryScore = asScore(value.deliveryScore) ?? asScore(value.businessSenseScore)
  const creativityScore = asScore(value.creativityScore) ?? asScore(value.communicationScore)

  const notes =
    asString(value.notes) ??
    asString(value.interviewerObservations) ??
    'No written feedback.'

  const workspaceImageUrls = asStringArray(value.workspaceImageUrls)
  const workspaceImageUrl = asString(value.workspaceImageUrl)
  if (workspaceImageUrl && !workspaceImageUrls.includes(workspaceImageUrl)) {
    workspaceImageUrls.push(workspaceImageUrl)
  }

  return {
    id,
    caseId: asString(value.caseId),
    lobbyId: asString(value.lobbyId),
    caseTitle: asString(value.caseTitle) ?? 'Untitled Case',
    caseType: asString(value.caseType) ?? asString(value.case_type),
    difficulty: asString(value.difficulty) ?? asString(value.caseDifficulty),
    industry: asString(value.industry),
    candidateId: asString(value.candidateId),
    notes,
    workspaceImageUrls,
    createdAt: value.createdAt,
    scores: {
      structure: structureScore,
      understanding: understandingScore,
      delivery: deliveryScore,
      creativity: creativityScore,
    },
  }
}

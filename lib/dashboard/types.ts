import type { Timestamp } from 'firebase/firestore'

export type ScoreKey = 'structure' | 'understanding' | 'delivery' | 'creativity'

export type ScoreSet = Record<ScoreKey, number | null>

export type EvaluationRecord = {
  id: string
  caseId: string | null
  lobbyId: string | null
  caseTitle: string
  caseType: string | null
  difficulty: string | null
  industry: string | null
  candidateId: string | null
  notes: string
  workspaceImageUrls: string[]
  createdAt?: Timestamp
  scores: ScoreSet
  isUnrated: boolean
}

export type DashboardFilters = {
  caseTitle: string
  caseType: string
  industry: string
  dateWindow: 'All' | '7d' | '30d' | '90d' | '180d'
}

export type DashboardKpis = {
  totalCases: number
  averageScore: number | null
  strongestSkill: ScoreKey | null
  weakestSkill: ScoreKey | null
}

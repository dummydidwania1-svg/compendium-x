'use client'

import { ReactNode } from 'react'
import CasePreviewMaster from '@/components/case/CasePreviewMaster'
import type { FrameworkTree, Visualisation, RecommendationsTable } from '@/components/case/CasePreviewMaster'

type TranscriptSpeaker = 'candidate' | 'interviewer' | 'neutral'
type TranscriptDisplayLine = { text: string; speaker: TranscriptSpeaker }
type ParsedFramework = {
  transcriptLines: string[]
  summaryTitle: string | null
  summaryRows: Array<{ label: string; value: string }>
  recommendations: string[]
}

type CasePreviewProps = {
  caseData: { title: string; prompt?: string; framework?: string }
  previewMode: boolean
  transcriptDisplayLines: TranscriptDisplayLine[]
  parsedFramework: ParsedFramework
  promptLines: string[]
  caseTypeLabel: string
  industryLabel: string
  difficultyLabel: string
  companyLabel: string
  roundLabel: string
  isBankingOnYou: boolean
  frameworkTree?: FrameworkTree
  visualisations?: Visualisation[]
  recommendationsTable?: RecommendationsTable
  abbreviations?: string[]
  ForumSection?: ReactNode
}

export default function CasePreviewView(props: CasePreviewProps) {
  return <CasePreviewMaster {...props} />
}

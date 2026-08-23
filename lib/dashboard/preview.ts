import { MOCK_CASES } from '@/data/mockData'
import { MOCK_FEEDBACK } from '@/data/mockFeedback'
import type { DashboardCaseEntry } from '@/lib/dashboard/live'
import type { EvaluationRecord } from '@/lib/dashboard/types'

const WORKSPACE_PLACEHOLDER_URL = '/demo/workspace-placeholder.svg'

export const DASHBOARD_PREVIEW_NAME = 'User'
export const DASHBOARD_PREVIEW_GOAL_TARGET_CASES = 50

function feedbackMap() {
  return new Map(MOCK_FEEDBACK.map((item) => [String(item.id), item]))
}

function deriveSummary(notes: string, transcriptPreview: string | null) {
  const source = notes.trim() || transcriptPreview?.trim() || 'No feedback summary available yet.'
  const firstSentence = source.split(/(?<=[.!?])\s+/)[0]?.trim() ?? source
  return firstSentence.length <= 180 ? firstSentence : `${firstSentence.slice(0, 177).trim()}...`
}

function createdAtMsFromDate(date: string) {
  const value = new Date(`${date}T12:00:00.000Z`).getTime()
  return Number.isFinite(value) ? value : 0
}

function sortEntriesNewest(entries: DashboardCaseEntry[]) {
  return [...entries].sort((a, b) => {
    if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs
    return b.date.localeCompare(a.date)
  })
}

export function buildPreviewDashboardData(): {
  fullName: string
  goalTargetCases: number
  records: EvaluationRecord[]
  entries: DashboardCaseEntry[]
} {
  const feedbackById = feedbackMap()

  const records: EvaluationRecord[] = []
  const entries: DashboardCaseEntry[] = []

  for (const mockCase of MOCK_CASES) {
    const feedback = feedbackById.get(String(mockCase.id))
    const notes = feedback?.notes?.trim() || `Preview feedback for ${mockCase.name}.`
    const transcript = mockCase.hasTranscript ? feedback?.verbal?.trim() || null : null
    const transcriptPreview = transcript ? transcript.slice(0, 1000) : null
    const workspaceImageUrls = mockCase.hasSnapshot ? [WORKSPACE_PLACEHOLDER_URL] : []
    const createdAtMs = createdAtMsFromDate(mockCase.date)
    const id = `preview-${mockCase.id}`

    records.push({
      id,
      caseId: null,
      lobbyId: `preview-lobby-${mockCase.id}`,
      caseTitle: mockCase.name,
      caseType: mockCase.type,
      difficulty: mockCase.level,
      industry: null,
      candidateId: null,
      notes,
      workspaceImageUrls,
      isUnrated: false,
      scores: {
        structure: mockCase.structure,
        understanding: mockCase.analysis,
        delivery: mockCase.delivery,
        creativity: mockCase.creativity,
      },
    })

    entries.push({
      id,
      evaluationId: id,
      caseId: null,
      caseNumericId: Number.parseInt(String(mockCase.id), 10) || null,
      lobbyId: `preview-lobby-${mockCase.id}`,
      name: mockCase.name,
      type: mockCase.type,
      company: null,
      industry: null,
      level: mockCase.level,
      date: mockCase.date,
      createdAtMs,
      sessionMode: 'Remote',
      interviewerName: null,
      structure: mockCase.structure,
      analysis: mockCase.analysis,
      understanding: mockCase.analysis,
      delivery: mockCase.delivery,
      creativity: mockCase.creativity,
      score: mockCase.score,
      notes,
      summary: mockCase.summary || deriveSummary(notes, transcriptPreview),
      transcript,
      transcriptPreview,
      transcriptStatus: transcript ? 'completed' : null,
      transcriptError: null,
      transcriptReason: null,
      transcriptTurns: null,
      durationMs: null,
      audioUrl: null,
      interviewerAudioUrl: null,
      mergedAudioUrl: null,
      mergedTranscriptStatus: null,
      mergedAudioStatus: null,
      mergedAudioReason: null,
      mergedAudioDurationMs: null,
      audioMergePending: false,
localAudioResolvedNone: false,
localStopReason: null,
workspaceImageUrls,
      hasTranscript: Boolean(transcript),
      hasPDF: mockCase.hasPDF,
      hasSnapshot: mockCase.hasSnapshot,
      hasAudio: false,
      isUnrated: false,
      executionAnalysis: null,
    })
  }

  return {
    fullName: DASHBOARD_PREVIEW_NAME,
    goalTargetCases: DASHBOARD_PREVIEW_GOAL_TARGET_CASES,
    records,
    entries: sortEntriesNewest(entries),
  }
}

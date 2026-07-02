import type { DocumentData, Timestamp } from 'firebase/firestore'
import { PARAM_WEIGHTS } from '@/lib/constants'
import { mapEvaluationDoc } from './mappers'
import type { EvaluationRecord } from './types'

export type DashboardWidgetFilters = {
  types: string[]
  levels: string[]
  time: string
  customStart: string
  customEnd: string
}

export type DashboardCaseEntry = {
  id: string
  evaluationId: string
  caseId: string | null
  caseNumericId: number | null
  lobbyId: string | null
  name: string
  type: string
  industry: string | null
  company: string | null
  interviewerName: string | null
  sessionMode: 'remote' | 'local' | null
  level: string
  date: string
  createdAtMs: number
  structure: number | null
  analysis: number | null
  understanding: number | null
  delivery: number | null
  creativity: number | null
  score: number | null
  notes: string
  summary: string
  transcript: string | null
  transcriptPreview: string | null
  transcriptStatus: string | null
  transcriptError: string | null
  transcriptReason: string | null
  audioUrl: string | null
  mergedAudioUrl: string | null
  workspaceImageUrls: string[]
  hasTranscript: boolean
  hasPDF: boolean
  hasSnapshot: boolean
  hasAudio: boolean
  isUnrated: boolean
}

export type DashboardCaseMeta = {
  id: string
  numericId: number | null
  title: string | null
  caseType: string | null
  industry: string | null
  company: string | null
  difficulty: string | null
}

export type DashboardSessionMeta = {
  lobbyId: string
  transcript: string | null
  transcriptPreview: string | null
  transcriptStatus: string | null
  transcriptError: string | null
  transcriptReason: string | null
  audioUrl: string | null
  mergedAudioUrl: string | null
  sessionMode: 'remote' | 'local' | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function timestampToDateString(value?: Timestamp): string {
  if (!value?.toDate) return ''
  const d = value.toDate()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function timestampToMillis(value?: Timestamp): number {
  return value?.toMillis?.() ?? 0
}

function normalizeWords(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function normalizeDifficulty(value: string | null | undefined): string {
  if (!value) return 'General'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'easy') return 'Easy'
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'hard') return 'Hard'
  return normalizeWords(value)
}

export function normalizeCaseType(value: string | null | undefined): string {
  if (!value) return 'General'
  return normalizeWords(value)
}

function deriveSummary(notes: string, transcriptPreview: string | null): string {
  const source = notes.trim() || transcriptPreview?.trim() || 'No feedback summary available yet.'
  const firstSentence = source.split(/(?<=[.!?])\s+/)[0]?.trim() ?? source
  return firstSentence.length <= 180 ? firstSentence : `${firstSentence.slice(0, 177).trim()}...`
}

function weightedScore(record: EvaluationRecord): number | null {
  if (record.isUnrated) return null
  const structure = record.scores.structure ?? 0
  const analysis = record.scores.understanding ?? 0
  const delivery = record.scores.delivery ?? 0
  const creativity = record.scores.creativity ?? 0
  return +(
    structure * PARAM_WEIGHTS.structure +
    analysis * PARAM_WEIGHTS.analysis +
    delivery * PARAM_WEIGHTS.delivery +
    creativity * PARAM_WEIGHTS.creativity
  ).toFixed(1)
}

export function mapCaseMeta(id: string, value: DocumentData): DashboardCaseMeta {
  return {
    id,
    numericId: asNumber(value.id),
    title: asString(value.title),
    caseType: asString(value.case_type) ?? asString(value.caseType),
    industry: asString(value.industry),
    company: asString(value.company) ?? asString(value.companyName) ?? asString(value.client),
    difficulty: asString(value.difficulty),
  }
}

function normalizeSessionMode(value: unknown): 'remote' | 'local' | null {
  const raw = asString(value)?.toLowerCase()
  if (raw === 'remote') return 'remote'
  if (raw === 'local' || raw === 'same_device' || raw === 'same-device') return 'local'
  return null
}

export function mapSessionMeta(id: string, value: DocumentData): DashboardSessionMeta {
  const recording = value?.recording
  const source = recording && typeof recording === 'object' ? (recording as Record<string, unknown>) : {}

  // For dual-mic remote sessions the merged transcript lives on the session doc
  // itself (mergedTranscript / mergedTranscriptStatus), not in the embedded
  // recording map. Fall back to those fields when the embedded map has nothing.
  const transcript = asString(source.transcript) ?? asString(value?.mergedTranscript)
  const transcriptPreview =
    asString(source.transcriptPreview) ??
    (transcript ? transcript.slice(0, 1000) : null)
  const transcriptStatus =
    asString(source.transcriptStatus) ?? asString(value?.mergedTranscriptStatus)
  const transcriptError =
    asString(source.transcriptError) ?? asString(value?.mergedTranscriptError)

  return {
    lobbyId: id,
    transcript,
    transcriptPreview,
    transcriptStatus,
    transcriptError,
    transcriptReason: asString(value?.mergedTranscriptReason),
    // Local sessions: embedded recording.audioUrl
    // Remote sessions: denormalized candidateAudioUrl written by the recording route
    audioUrl: asString(source.audioUrl) ?? asString(value?.candidateAudioUrl),
    // Server-side time-aligned combined audio (both mics), written to the doc root
    // by the Cloud Function. Preferred over a single mic track when present.
    mergedAudioUrl: asString(value?.mergedAudioUrl),
    // Authoritative remote/local signal. Prefer the session-doc `sessionMode`
    // written by the server; fall back to the legacy root `mode` (demo seed) and
    // finally the embedded recording map's `mode`.
    sessionMode:
      normalizeSessionMode(value?.sessionMode) ??
      normalizeSessionMode(value?.mode) ??
      normalizeSessionMode(source.mode),
  }
}

export function mapDashboardEntry(
  record: EvaluationRecord,
  caseMeta?: DashboardCaseMeta | null,
  sessionMeta?: DashboardSessionMeta | null
): DashboardCaseEntry {
  const date = timestampToDateString(record.createdAt)
  const transcript = sessionMeta?.transcript ?? null
  const transcriptPreview = sessionMeta?.transcriptPreview ?? null
  const workspaceImageUrls = [...record.workspaceImageUrls]

  return {
    id: record.id,
    evaluationId: record.id,
    caseId: record.caseId,
    caseNumericId: caseMeta?.numericId ?? null,
    lobbyId: record.lobbyId,
    name: record.caseTitle || caseMeta?.title || 'Untitled Case',
    type: normalizeCaseType(record.caseType ?? caseMeta?.caseType ?? 'General'),
    industry: record.industry ?? caseMeta?.industry ?? null,
    company: caseMeta?.company ?? null,
    interviewerName: record.interviewerName,
    sessionMode: sessionMeta?.sessionMode ?? null,
    level: normalizeDifficulty(record.difficulty ?? caseMeta?.difficulty),
    date,
    createdAtMs: timestampToMillis(record.createdAt),
    structure: record.scores.structure ?? null,
    analysis: record.scores.understanding ?? null,
    understanding: record.scores.understanding ?? null,
    delivery: record.scores.delivery ?? null,
    creativity: record.scores.creativity ?? null,
    score: weightedScore(record),
    notes: record.notes,
    summary: deriveSummary(record.notes, transcriptPreview),
    transcript,
    transcriptPreview,
    transcriptStatus: sessionMeta?.transcriptStatus ?? null,
    transcriptError: sessionMeta?.transcriptError ?? null,
    transcriptReason: sessionMeta?.transcriptReason ?? null,
    audioUrl: sessionMeta?.audioUrl ?? null,
    mergedAudioUrl: sessionMeta?.mergedAudioUrl ?? null,
    workspaceImageUrls,
    hasTranscript: Boolean(transcript || transcriptPreview),
    hasPDF: false,
    hasSnapshot: workspaceImageUrls.length > 0,
    hasAudio: Boolean(sessionMeta?.mergedAudioUrl || sessionMeta?.audioUrl),
    isUnrated: record.isUnrated,
  }
}

export function sortEntriesNewest(entries: DashboardCaseEntry[]): DashboardCaseEntry[] {
  return [...entries].sort((a, b) => {
    if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs
    return b.date.localeCompare(a.date)
  })
}

export function filterDashboardEntries(
  entries: DashboardCaseEntry[],
  filters: DashboardWidgetFilters
): DashboardCaseEntry[] {
  return entries.filter((entry) => {
    if (filters.types.length > 0 && !filters.types.includes(entry.type)) return false
    if (filters.levels.length > 0 && !filters.levels.includes(entry.level)) return false

    if (filters.time !== 'all') {
      const caseDate = new Date(`${entry.date}T00:00:00`)
      if (Number.isNaN(caseDate.getTime())) return false
      const now = new Date()

      if (filters.time === 'last7') {
        return caseDate.getTime() >= now.getTime() - 7 * MS_PER_DAY
      }

      if (filters.time === 'last30') {
        return caseDate.getTime() >= now.getTime() - 30 * MS_PER_DAY
      }

      if (filters.time === 'custom' && filters.customStart && filters.customEnd) {
        const start = new Date(`${filters.customStart}T00:00:00`)
        const end = new Date(`${filters.customEnd}T23:59:59`)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true
        return caseDate >= start && caseDate <= end
      }
    }

    return true
  })
}

export function buildDashboardEntries(
  evaluationDocs: Array<{ id: string; data: DocumentData }>,
  casesById: Record<string, DashboardCaseMeta>,
  sessionsByLobby: Record<string, DashboardSessionMeta>
): { records: EvaluationRecord[]; entries: DashboardCaseEntry[] } {
  const records = evaluationDocs.map((item) => mapEvaluationDoc(item.id, item.data))
  const entries = sortEntriesNewest(
    records.map((record) =>
      mapDashboardEntry(
        record,
        record.caseId ? casesById[record.caseId] ?? null : null,
        record.lobbyId ? sessionsByLobby[record.lobbyId] ?? null : null
      )
    )
  )
  return { records, entries }
}

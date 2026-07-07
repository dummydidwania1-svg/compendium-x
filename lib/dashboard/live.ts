import type { DocumentData, Timestamp } from 'firebase/firestore'
import { getCaseTypeWeights } from '@/lib/constants'
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
  company: string | null
  industry: string | null
  level: string
  date: string
  createdAtMs: number
  sessionMode: string
  interviewerName: string | null
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
  interviewerAudioUrl: string | null
  mergedAudioUrl: string | null
  // Merge status of the dual-mic transcript on the session doc. Used to decide
  // whether merged audio is still being generated for a Remote session.
  mergedTranscriptStatus: string | null
  // Terminal audio-merge outcome written by evaluateAndMerge: 'completed'
  // (both sides merged), 'single_side' (only one side had usable audio —
  // mergedAudioUrl points at that one side's own track), 'none' (neither side
  // had usable audio), or null/undefined for a session whose merge hasn't
  // resolved yet (or pre-dates this field entirely).
  mergedAudioStatus: string | null
  // Why the audio landed on a single-side/none outcome — e.g.
  // 'interviewer_declined' | 'interviewer_no_audio' | 'candidate_no_audio' |
  // 'no_audio'. Drives the specific copy shown alongside that outcome.
  mergedAudioReason: string | null
  // True only for a Remote (dual-mic) session whose merged audio has not been
  // written yet AND whose merge is actively pending (none/pending/processing/
  // partial) AND whose audio-merge step hasn't reached its OWN terminal state
  // (mergedAudioStatus) either. When true the UI shows a "generating" state
  // and hides all audio. False for Same Device sessions, for Remote sessions
  // where the merge has failed, and for Remote sessions where the audio side
  // resolved to a single-side or no-audio terminal outcome, so those never
  // get stuck on "generating".
  audioMergePending: boolean
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
  company: string | null
  industry: string | null
  difficulty: string | null
}

export type DashboardSessionMeta = {
  lobbyId: string
  sessionMode: string
  transcript: string | null
  transcriptPreview: string | null
  transcriptStatus: string | null
  transcriptError: string | null
  transcriptReason: string | null
  audioUrl: string | null
  interviewerAudioUrl: string | null
  mergedAudioUrl: string | null
  mergedTranscriptStatus: string | null
  mergedAudioStatus: string | null
  mergedAudioReason: string | null
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
  const w = getCaseTypeWeights(record.caseType)
  return +(
    structure * w.structure +
    analysis * w.analysis +
    delivery * w.delivery +
    creativity * w.creativity
  ).toFixed(1)
}

export function mapCaseMeta(id: string, value: DocumentData): DashboardCaseMeta {
  return {
    id,
    numericId: asNumber(value.id),
    title: asString(value.title),
    caseType: asString(value.case_type) ?? asString(value.caseType),
    company: asString(value.company),
    industry: asString(value.industry),
    difficulty: asString(value.difficulty),
  }
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

  // Authoritative session mode: read from explicit fields, not inferred from mergedAudioUrl.
  const rawMode =
    asString(value?.sessionMode) ??
    asString(value?.mode) ??
    asString((source as Record<string, unknown>).mode)
  let sessionMode: string
  if (rawMode) {
    const normalized = rawMode.toLowerCase().replace(/[_\s-]+/g, '')
    sessionMode = normalized === 'samedevice' || normalized === 'local' ? 'Same Device' : 'Remote'
  } else {
    // Fallback for legacy records that pre-date the sessionMode field.
    sessionMode = asString(value?.mergedAudioUrl) ? 'Remote' : 'Same Device'
  }

  const mergedAudioUrl = asString(value?.mergedAudioUrl)

  return {
    lobbyId: id,
    sessionMode,
    transcript,
    transcriptPreview,
    transcriptStatus,
    transcriptError,
    transcriptReason: asString(value?.mergedTranscriptReason),
    // Local sessions: embedded recording.audioUrl
    // Remote sessions: denormalized candidateAudioUrl written by the recording route
    audioUrl: asString(source.audioUrl) ?? asString(value?.candidateAudioUrl),
    // Remote sessions only: denormalized interviewerAudioUrl written by the
    // recording route — used as the single-side fallback when only the
    // interviewer's track has usable audio.
    interviewerAudioUrl: asString(value?.interviewerAudioUrl),
    // Server-side time-aligned combined audio (both mics), written to the doc root
    // by the Cloud Function. Preferred over a single mic track when present.
    // For a single_side outcome this points at that one side's own track URL.
    mergedAudioUrl,
    // Raw merge status from the session doc root, used to tell "merge pending"
    // apart from "merge failed / no merge" for the generating-audio UI state.
    mergedTranscriptStatus: asString(value?.mergedTranscriptStatus),
    mergedAudioStatus: asString(value?.mergedAudioStatus),
    mergedAudioReason: asString(value?.mergedAudioReason),
  }
}

// Merge-in-progress states: merged audio is expected but not written yet.
const AUDIO_MERGE_PENDING_STATUSES = new Set(['none', 'pending', 'processing', 'partial'])
// Terminal audio-merge outcomes — once mergedAudioStatus reaches one of these,
// the audio side is definitively resolved and should never show "generating"
// again, regardless of what mergedTranscriptStatus says. 'failed' means the
// merge step itself gave up after retries (ffmpeg/download/upload error) —
// still terminal, just a different final answer than 'none'.
const AUDIO_MERGE_TERMINAL_STATUSES = new Set(['completed', 'single_side', 'none', 'failed'])

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
    company: caseMeta?.company ?? null,
    industry: record.industry ?? caseMeta?.industry ?? null,
    level: normalizeDifficulty(record.difficulty ?? caseMeta?.difficulty),
    date,
    createdAtMs: timestampToMillis(record.createdAt),
    sessionMode: sessionMeta?.sessionMode ?? 'Remote',
    interviewerName: null,
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
    interviewerAudioUrl: sessionMeta?.interviewerAudioUrl ?? null,
    mergedAudioUrl: sessionMeta?.mergedAudioUrl ?? null,
    mergedTranscriptStatus: sessionMeta?.mergedTranscriptStatus ?? null,
    mergedAudioStatus: sessionMeta?.mergedAudioStatus ?? null,
    mergedAudioReason: sessionMeta?.mergedAudioReason ?? null,
    // Remote (dual-mic) session, merged audio not written yet, the transcript
    // merge is still actively running, AND the audio side hasn't separately
    // reached its own terminal outcome (completed/single_side/none) ->
    // show "generating" and hide audio. Same Device sessions, failed
    // transcript merges, and sessions whose audio side already resolved
    // (even if a single track failed) are excluded so they never stall.
    audioMergePending:
      (sessionMeta?.sessionMode ?? 'Remote') === 'Remote' &&
      !sessionMeta?.mergedAudioUrl &&
      !AUDIO_MERGE_TERMINAL_STATUSES.has((sessionMeta?.mergedAudioStatus ?? '').toLowerCase()) &&
      AUDIO_MERGE_PENDING_STATUSES.has(
        (sessionMeta?.mergedTranscriptStatus ?? 'none').toLowerCase(),
      ),
    workspaceImageUrls,
    hasTranscript: Boolean(transcript || transcriptPreview),
    hasPDF: false,
    hasSnapshot: workspaceImageUrls.length > 0,
    hasAudio: Boolean(sessionMeta?.mergedAudioUrl || sessionMeta?.audioUrl || sessionMeta?.interviewerAudioUrl),
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

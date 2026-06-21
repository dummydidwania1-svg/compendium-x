/**
 * Firebase Cloud Functions for Compendium X.
 *
 * Functions exported:
 *
 * 1. `transcribeRecording` — UNCHANGED for local/old sessions.
 *    Triggers on `sessions/{sessionId}` writes where `recording.transcriptStatus`
 *    transitions to 'pending'. Writes transcript back to embedded `recording` map.
 *
 * 2. `transcribeParticipantRecording` — Part 2, dual-mic remote sessions.
 *    Triggers on `sessions/{sessionId}/recordings/{role}` writes where
 *    `transcriptStatus` transitions to 'pending'. Refactored from the same
 *    `runTranscription` core but writes back to the subcollection doc.
 *    Requests per-turn timing markers from Gemini so the merge function can
 *    interleave by global offset.
 *
 * 3. `mergeTranscripts` — Part 2.
 *    Triggers on `sessions/{sessionId}/recordings/{role}` writes when any
 *    track reaches a terminal transcript state. Checks the sibling track and
 *    `session.interviewerAudioCaptured`. When both tracks are terminal (or
 *    when a partial outcome is confirmed), merges into `session.mergedTranscript`.
 *
 * 4. `promoteAbandonedSessions` — UNCHANGED (hourly scheduler).
 */
import { initializeApp, getApps } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'

if (getApps().length === 0) initializeApp()
const db = getFirestore()

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')
const GEMINI_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.5-flash-lite'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'
const FILE_READY_ATTEMPTS = 90
const FILE_READY_WAIT_MS = 2000
const GENERATION_MAX_ATTEMPTS = 3

const MIN_AUDIO_BYTES = 150 * 1024

const INAUDIBLE_TOKEN = 'INAUDIBLE'
const MIN_TRANSCRIPT_CHARS = 40

// Grace window before declaring a partial transcript when the interviewer
// track is absent. If the candidate track completes and we haven't heard from
// the interviewer track within this window, we treat it as candidate-only.
const MERGE_GRACE_MS = 5 * 60 * 1000 // 5 minutes

type GeminiFile = {
  name?: string
  uri?: string
  mimeType?: string
  state?: string
  error?: { message?: string }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeMimeType(value: string | null | undefined): string {
  if (!value || value.trim().length === 0) return 'audio/webm'
  const clean = value.split(';')[0]?.trim()
  return clean && clean.startsWith('audio/') ? clean : 'audio/webm'
}

function extractGeminiErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const errorValue = (payload as { error?: { message?: unknown } }).error
    if (errorValue && typeof errorValue === 'object' && 'message' in errorValue) {
      const message = (errorValue as { message?: unknown }).message
      if (typeof message === 'string' && message.trim().length > 0) return message.trim()
    }
  }
  return 'Gemini request failed.'
}

function parseGeminiFile(payload: unknown): GeminiFile | null {
  if (!payload || typeof payload !== 'object') return null
  if ('file' in payload) {
    const fileWrapper = (payload as { file?: unknown }).file
    if (fileWrapper && typeof fileWrapper === 'object') return fileWrapper as GeminiFile
  }
  return payload as GeminiFile
}

function extractTranscriptText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const candidates = (payload as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return ''
  const chunks: string[] = []
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const content = (candidate as { content?: unknown }).content
    if (!content || typeof content !== 'object') continue
    const parts = (content as { parts?: unknown }).parts
    if (!Array.isArray(parts)) continue
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string' && text.trim().length > 0) chunks.push(text.trim())
    }
  }
  return chunks.join('\n').trim()
}

function stripTimestamps(value: string): string {
  return value
    .replace(/\[\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*\]/g, '')
    .replace(/\(\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*\)/g, '')
    .replace(/<\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*>/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

/**
 * Parse per-turn timing markers produced by the dual-mic Gemini prompt.
 * Format per turn: `[t=30.5]` at the start of the line (seconds from track start).
 * Returns { cleanText, turnOffsets } where cleanText has all [t=...] stripped.
 */
function parseTurnOffsets(raw: string): { cleanText: string; turnOffsets: number[] } {
  const turnOffsets: number[] = []
  const lines = raw.split('\n')
  const cleanLines: string[] = []
  const MARKER_RE = /^\[t=([\d.]+)\]\s*/

  for (const line of lines) {
    const match = MARKER_RE.exec(line)
    if (match) {
      turnOffsets.push(parseFloat(match[1]))
      cleanLines.push(line.slice(match[0].length))
    } else {
      cleanLines.push(line)
    }
  }
  return { cleanText: cleanLines.join('\n').trim(), turnOffsets }
}

async function waitForFileReady(fileName: string, apiKey: string): Promise<GeminiFile> {
  const endpoint = `${GEMINI_API_BASE}/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`
  for (let attempt = 0; attempt < FILE_READY_ATTEMPTS; attempt += 1) {
    const response = await fetch(endpoint, { method: 'GET' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(extractGeminiErrorMessage(payload))
    const file = parseGeminiFile(payload)
    if (!file) throw new Error('Gemini did not return file metadata.')
    const state = String(file.state ?? 'STATE_UNSPECIFIED').toUpperCase()
    if (state === 'ACTIVE' || (state === 'STATE_UNSPECIFIED' && typeof file.uri === 'string')) {
      return file
    }
    if (state === 'FAILED') {
      throw new Error(file.error?.message || 'Gemini failed to process the audio file.')
    }
    await sleep(FILE_READY_WAIT_MS)
  }
  throw new Error('Gemini file processing timed out. Try a shorter clip or retry.')
}

async function deleteGeminiFile(fileName: string, apiKey: string): Promise<void> {
  try {
    await fetch(`${GEMINI_API_BASE}/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`, {
      method: 'DELETE',
    })
  } catch {
    // best-effort cleanup
  }
}

/**
 * Core transcription logic, refactored to write to a generic target.
 *
 * writeTarget:
 *   - 'embedded': writes to `sessions/{sessionId}.recording.*`
 *   - 'subcollection': writes fields directly to the provided trackRef doc,
 *     and (for completed tracks) stores parsed turnOffsets for the merge step.
 */
type WriteTarget =
  | { kind: 'embedded'; sessionRef: FirebaseFirestore.DocumentReference }
  | {
      kind: 'subcollection'
      trackRef: FirebaseFirestore.DocumentReference
      sessionRef: FirebaseFirestore.DocumentReference
      role: 'candidate' | 'interviewer'
    }

async function runTranscription(args: {
  target: WriteTarget
  sessionId: string
  audioUrl: string
  requestedMimeType: string
  storagePath: string
  apiKey: string
}): Promise<void> {
  const { target, sessionId, audioUrl, requestedMimeType, storagePath, apiKey } = args

  const markProcessing = async () => {
    if (target.kind === 'embedded') {
      await target.sessionRef.set(
        {
          recording: {
            transcriptStatus: 'processing',
            transcriptRequestedAt: FieldValue.serverTimestamp(),
            transcriptError: null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    } else {
      await target.trackRef.set(
        {
          transcriptStatus: 'processing',
          transcriptRequestedAt: FieldValue.serverTimestamp(),
          transcriptError: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }
  }

  const writeSuccess = async (fields: {
    transcript: string
    transcriptPreview: string
    usageMetadata: unknown
    finalMimeType: string
    byteSize: number
    turnOffsets: number[]
  }) => {
    const successFields = {
      transcriptStatus: 'completed',
      transcript: fields.transcript,
      transcriptPreview: fields.transcriptPreview,
      transcriptCompletedAt: FieldValue.serverTimestamp(),
      transcriptModel: GEMINI_MODEL,
      transcriptUsage: fields.usageMetadata,
      transcriptMimeType: fields.finalMimeType,
      transcriptByteSize: fields.byteSize,
      transcriptStoragePath: storagePath,
      transcriptError: null,
    }
    if (target.kind === 'embedded') {
      await target.sessionRef.set(
        { recording: successFields, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
    } else {
      await target.trackRef.set(
        {
          ...successFields,
          // Store parsed turn offsets for the merge function.
          transcriptTurnOffsets: fields.turnOffsets,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }
  }

  const writeFailure = async (message: string) => {
    if (target.kind === 'embedded') {
      await target.sessionRef.set(
        {
          recording: {
            transcriptStatus: 'failed',
            transcriptFailedAt: FieldValue.serverTimestamp(),
            transcriptError: message,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    } else {
      await target.trackRef.set(
        {
          transcriptStatus: 'failed',
          transcriptFailedAt: FieldValue.serverTimestamp(),
          transcriptError: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }
  }

  await markProcessing()

  // Per-track prompt for dual-mic: label all speech with the known role and
  // request a timing marker [t=XX.X] at the start of each new turn so the
  // merge function can interleave both tracks by global offset.
  // Embedded (single-track) prompt: unchanged from the original.
  const buildPrompt = () => {
    if (target.kind === 'embedded') {
      return [
        'Transcribe this interview audio verbatim.',
        'Use speaker labels where possible (for example: Speaker 1, Speaker 2).',
        'Keep it concise and clean for downstream feedback analysis.',
        'Do not include any timestamps, timecodes, or bracketed time markers.',
        'Return only the transcript text.',
        `If the audio is silent, contains no clear speech, is mostly background noise, or is too short to be a real interview, respond with the single word ${INAUDIBLE_TOKEN} and nothing else.`,
        'Never invent or hallucinate dialogue. Only transcribe what you can clearly hear.',
      ].join(' ')
    }
    const roleLabel = target.role === 'candidate' ? 'Candidate' : 'Interviewer'
    return [
      `You are transcribing the ${target.role}'s audio from a case interview.`,
      `Label ALL speech in this track as "${roleLabel}:" — do not use any other speaker labels since this is a single-speaker track.`,
      'Before each new speaker turn, output a timing marker on the same line in the format [t=XX.X] where XX.X is the approximate seconds since the audio started. For example: [t=0.0] Candidate: Hello, welcome to the case.',
      'Keep it concise and clean for downstream feedback analysis.',
      'Return only the transcript text with the [t=XX.X] timing markers. Do not include any other timestamps or bracketed time markers.',
      `If the audio is silent, contains no clear speech, is mostly background noise, or is too short to be a real interview, respond with the single word ${INAUDIBLE_TOKEN} and nothing else.`,
      'Never invent or hallucinate dialogue. Only transcribe what you can clearly hear.',
    ].join(' ')
  }

  let uploadedFileName = ''
  try {
    const audioResponse = await fetch(audioUrl)
    if (!audioResponse.ok) {
      throw new Error(`Unable to download audio artifact (HTTP ${audioResponse.status}).`)
    }
    const sourceMimeType = normalizeMimeType(
      requestedMimeType || audioResponse.headers.get('content-type'),
    )
    const audioBytes = await audioResponse.arrayBuffer()
    const byteSize = audioBytes.byteLength
    if (byteSize === 0) throw new Error('Audio artifact is empty.')
    if (byteSize < MIN_AUDIO_BYTES) {
      throw new Error(
        `Recording is too short to transcribe reliably (${Math.round(byteSize / 1024)} KB; need at least ${MIN_AUDIO_BYTES / 1024} KB). Record for at least ~1 minute.`,
      )
    }

    const startUploadResponse = await fetch(
      `${GEMINI_API_BASE}/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(byteSize),
          'X-Goog-Upload-Header-Content-Type': sourceMimeType,
        },
        body: JSON.stringify({ file: { display_name: `session-${sessionId}-${Date.now()}` } }),
      },
    )
    const uploadUrl = startUploadResponse.headers.get('x-goog-upload-url')
    if (!startUploadResponse.ok || !uploadUrl) {
      const payload = await startUploadResponse.json().catch(() => null)
      throw new Error(extractGeminiErrorMessage(payload))
    }
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(byteSize),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: audioBytes,
    })
    const uploadPayload = await uploadResponse.json().catch(() => null)
    if (!uploadResponse.ok) throw new Error(extractGeminiErrorMessage(uploadPayload))
    const uploadedFile = parseGeminiFile(uploadPayload)
    if (!uploadedFile?.name) {
      throw new Error('Gemini file upload succeeded but file name was missing.')
    }
    uploadedFileName = uploadedFile.name
    const readyFile = await waitForFileReady(uploadedFile.name, apiKey)
    if (!readyFile.uri) throw new Error('Gemini returned a file without URI.')

    const generationRequestBody = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildPrompt() },
            {
              file_data: {
                mime_type: readyFile.mimeType || sourceMimeType,
                file_uri: readyFile.uri,
              },
            },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    })
    let generationResponse: Response | null = null
    let generationPayload: unknown = null
    let lastError = ''
    for (let attempt = 1; attempt <= GENERATION_MAX_ATTEMPTS; attempt += 1) {
      generationResponse = await fetch(
        `${GEMINI_API_BASE}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: generationRequestBody,
        },
      )
      generationPayload = await generationResponse.json().catch(() => null)
      if (generationResponse.ok) break
      lastError = extractGeminiErrorMessage(generationPayload)
      const retriable = generationResponse.status >= 500 || generationResponse.status === 429
      if (!retriable || attempt === GENERATION_MAX_ATTEMPTS) break
      await sleep(500 * 3 ** (attempt - 1))
    }
    if (!generationResponse) throw new Error(lastError || 'Gemini request failed.')
    if (!generationResponse.ok) throw new Error(extractGeminiErrorMessage(generationPayload))

    const rawTranscript = extractTranscriptText(generationPayload)

    const normalizedCheck = rawTranscript.replace(/[^a-z]/gi, '').toUpperCase()
    if (normalizedCheck === INAUDIBLE_TOKEN) {
      throw new Error(
        'No clear speech detected in the recording. Make sure your mic is unmuted and you speak audibly.',
      )
    }

    // For subcollection tracks: parse [t=XX.X] timing markers for merge ordering,
    // then strip them from the displayed transcript text.
    // For embedded (legacy) tracks: just strip any stray timestamps.
    let displayTranscript: string
    let turnOffsets: number[] = []
    if (target.kind === 'subcollection') {
      const parsed = parseTurnOffsets(rawTranscript)
      displayTranscript = stripTimestamps(parsed.cleanText)
      turnOffsets = parsed.turnOffsets
    } else {
      displayTranscript = stripTimestamps(rawTranscript)
    }

    if (!displayTranscript) throw new Error('Gemini returned an empty transcript.')
    if (displayTranscript.length < MIN_TRANSCRIPT_CHARS) {
      throw new Error(
        `Transcript was too short to be a real session (${displayTranscript.length} characters). Re-record with at least ~1 minute of speech.`,
      )
    }

    const usageMetadata =
      (generationPayload as { usageMetadata?: unknown } | null)?.usageMetadata ?? null
    const finalMimeType = readyFile.mimeType || sourceMimeType

    await writeSuccess({
      transcript: displayTranscript,
      transcriptPreview: displayTranscript.slice(0, 1000),
      usageMetadata,
      finalMimeType,
      byteSize,
      turnOffsets,
    })

    logger.info('transcript_completed', {
      sessionId,
      kind: target.kind,
      role: target.kind === 'subcollection' ? target.role : undefined,
      bytes: byteSize,
      model: GEMINI_MODEL,
      turnCount: turnOffsets.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown transcription error.'
    logger.error('transcript_failed', {
      sessionId,
      kind: target.kind,
      role: target.kind === 'subcollection' ? target.role : undefined,
      message,
    })
    await writeFailure(message)
  } finally {
    if (uploadedFileName) {
      await deleteGeminiFile(uploadedFileName, apiKey)
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Merge helper                                                                */
/* -------------------------------------------------------------------------- */

type TrackData = {
  transcript: string
  transcriptTurnOffsets?: number[]
  startOffsetMs?: number
  transcriptStatus?: string
}

/**
 * Interleave two per-track transcripts into one speaker-labeled merged transcript.
 *
 * Strategy (option #1 from spec): each track's Gemini output contains per-turn
 * timing markers [t=XX.X] parsed into `transcriptTurnOffsets` (seconds from
 * track start). Global position of each turn = startOffsetMs + turnOffset*1000.
 * We interleave all turns by global position and concatenate.
 *
 * If turn offsets are absent (Gemini didn't emit them), fall back to option #2:
 * interleave at the TRACK granularity using each track's startOffsetMs, placing
 * the earlier-starting track first and appending the later one after it.
 * This is documented as approximate in the merge result.
 */
function mergeTranscriptTracks(
  candidate: TrackData | null,
  interviewer: TrackData | null,
): string {
  // Fallback: if only one track, just return it.
  if (!candidate && !interviewer) return ''
  if (!candidate) return interviewer!.transcript
  if (!interviewer) return candidate.transcript

  const candidateOffsets = candidate.transcriptTurnOffsets ?? []
  const interviewerOffsets = interviewer.transcriptTurnOffsets ?? []

  // Option #1: per-turn interleaving by global ms offset.
  if (candidateOffsets.length > 0 || interviewerOffsets.length > 0) {
    const cStart = candidate.startOffsetMs ?? 0
    const iStart = interviewer.startOffsetMs ?? 0

    // Split each transcript into turns by splitting on newlines that start with a role label.
    // Gemini outputs one turn per line for this format.
    const cLines = candidate.transcript.split('\n').filter((l) => l.trim())
    const iLines = interviewer.transcript.split('\n').filter((l) => l.trim())

    type Turn = { globalMs: number; text: string }
    const turns: Turn[] = []

    for (let i = 0; i < cLines.length; i++) {
      const offset = candidateOffsets[i] !== undefined ? candidateOffsets[i] * 1000 : i * 5000
      turns.push({ globalMs: cStart + offset, text: cLines[i] })
    }
    for (let i = 0; i < iLines.length; i++) {
      const offset = interviewerOffsets[i] !== undefined ? interviewerOffsets[i] * 1000 : i * 5000
      turns.push({ globalMs: iStart + offset, text: iLines[i] })
    }

    turns.sort((a, b) => a.globalMs - b.globalMs)
    return turns.map((t) => t.text).join('\n')
  }

  // Option #2 fallback: track-level interleaving by startOffsetMs.
  // Approximation: whoever started earlier goes first, other appended after.
  const cStart = candidate.startOffsetMs ?? 0
  const iStart = interviewer.startOffsetMs ?? 0
  const [first, second] = cStart <= iStart
    ? [candidate.transcript, interviewer.transcript]
    : [interviewer.transcript, candidate.transcript]
  // Note: this is an approximation — turns are not interleaved within each block.
  return `${first}\n${second}`
}

/* -------------------------------------------------------------------------- */
/* Cloud Function 1 — local/old sessions (unchanged)                          */
/* -------------------------------------------------------------------------- */

/**
 * Fires whenever any session document is created or updated. We only act
 * when `recording.transcriptStatus` transitions to `'pending'` — that's
 * the signal from the Next.js client that an audio upload finished or a
 * retry was requested. For local sessions and old remote sessions only.
 */
export const transcribeRecording = onDocumentWritten(
  {
    document: 'sessions/{sessionId}',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [GEMINI_API_KEY],
    retry: false,
  },
  async (event) => {
    const beforeStatus = event.data?.before?.data()?.recording?.transcriptStatus
    const afterData = event.data?.after?.data()
    const afterStatus = afterData?.recording?.transcriptStatus

    if (afterStatus !== 'pending') return
    if (beforeStatus === 'pending') return
    if (beforeStatus === 'processing') return

    const recording = afterData?.recording as
      | { audioUrl?: string; mimeType?: string; storagePath?: string }
      | undefined
    const audioUrl = recording?.audioUrl
    const storagePath = recording?.storagePath
    if (!audioUrl || !storagePath) {
      logger.warn('transcribe_skipped_no_audio', {
        sessionId: event.params.sessionId,
        hasAudioUrl: Boolean(audioUrl),
        hasStoragePath: Boolean(storagePath),
      })
      return
    }

    const sessionRef = db.collection('sessions').doc(event.params.sessionId)
    await runTranscription({
      target: { kind: 'embedded', sessionRef },
      sessionId: event.params.sessionId,
      audioUrl,
      requestedMimeType: recording.mimeType ?? '',
      storagePath,
      apiKey: GEMINI_API_KEY.value(),
    })
  },
)

/* -------------------------------------------------------------------------- */
/* Cloud Function 2 — per-track transcription for dual-mic remote sessions    */
/* -------------------------------------------------------------------------- */

/**
 * Fires when a `sessions/{sessionId}/recordings/{role}` doc transitions its
 * `transcriptStatus` to 'pending'. Runs the same Gemini transcription core
 * as transcribeRecording but writes back to the subcollection doc and includes
 * per-turn timing markers in the prompt for the merge step.
 */
export const transcribeParticipantRecording = onDocumentWritten(
  {
    document: 'sessions/{sessionId}/recordings/{role}',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [GEMINI_API_KEY],
    retry: false,
  },
  async (event) => {
    const beforeStatus = event.data?.before?.data()?.transcriptStatus
    const afterData = event.data?.after?.data()
    const afterStatus = afterData?.transcriptStatus

    if (afterStatus !== 'pending') return
    if (beforeStatus === 'pending') return
    if (beforeStatus === 'processing') return

    const role = event.params.role as 'candidate' | 'interviewer'
    if (role !== 'candidate' && role !== 'interviewer') {
      logger.warn('transcribe_participant_unknown_role', { role })
      return
    }

    const audioUrl = afterData?.audioUrl as string | undefined
    const storagePath = afterData?.storagePath as string | undefined
    if (!audioUrl || !storagePath) {
      logger.warn('transcribe_participant_no_audio', {
        sessionId: event.params.sessionId,
        role,
      })
      return
    }

    const trackRef = db
      .collection('sessions')
      .doc(event.params.sessionId)
      .collection('recordings')
      .doc(role)
    const sessionRef = db.collection('sessions').doc(event.params.sessionId)

    await runTranscription({
      target: { kind: 'subcollection', trackRef, sessionRef, role },
      sessionId: event.params.sessionId,
      audioUrl,
      requestedMimeType: (afterData?.mimeType as string | undefined) ?? '',
      storagePath,
      apiKey: GEMINI_API_KEY.value(),
    })
  },
)

/* -------------------------------------------------------------------------- */
/* Cloud Function 3 — merge transcripts after per-track completion            */
/* -------------------------------------------------------------------------- */

/**
 * Fires on every write to `sessions/{sessionId}/recordings/{role}`.
 * Attempts to merge candidate + interviewer transcripts into one
 * `session.mergedTranscript` once both tracks reach a terminal state.
 *
 * Terminal states: 'completed' | 'failed'.
 * Partial outcome: candidate completed + interviewer absent/declined.
 *
 * Idempotency: guarded by `mergedTranscriptStatus: 'processing'` written
 * before the merge begins. Checks `before`→`after` to avoid re-running
 * on writes that aren't terminal-state transitions.
 */
export const mergeTranscripts = onDocumentWritten(
  {
    document: 'sessions/{sessionId}/recordings/{role}',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
    secrets: [],
    retry: false,
  },
  async (event) => {
    const afterStatus = event.data?.after?.data()?.transcriptStatus as string | undefined
    const beforeStatus = event.data?.before?.data()?.transcriptStatus as string | undefined

    // Only act when this write transitions to a terminal state.
    const terminal = (s: string | undefined) => s === 'completed' || s === 'failed'
    if (!terminal(afterStatus)) return
    if (terminal(beforeStatus)) return // already was terminal — don't re-merge

    const sessionId = event.params.sessionId
    const sessionRef = db.collection('sessions').doc(sessionId)

    // Idempotency: grab the session doc and bail if already merged/processing.
    const sessionSnap = await sessionRef.get()
    if (!sessionSnap.exists) return
    const sessionData = sessionSnap.data() ?? {}
    const existingMergeStatus = sessionData.mergedTranscriptStatus as string | undefined
    if (existingMergeStatus === 'completed' || existingMergeStatus === 'processing') return

    // Read both track docs.
    const recordingsCol = sessionRef.collection('recordings')
    const [candidateSnap, interviewerSnap] = await Promise.all([
      recordingsCol.doc('candidate').get(),
      recordingsCol.doc('interviewer').get(),
    ])

    const candidateData = candidateSnap.exists ? (candidateSnap.data() as TrackData) : null
    const interviewerData = interviewerSnap.exists ? (interviewerSnap.data() as TrackData) : null

    const candidateStatus = candidateData?.transcriptStatus
    const interviewerStatus = interviewerData?.transcriptStatus
    const interviewerDeclined = sessionData.interviewerAudioCaptured === false

    // Determine if we have a complete picture yet.
    const candidateDone = terminal(candidateStatus as string | undefined)
    const interviewerKnown =
      terminal(interviewerStatus as string | undefined) ||
      interviewerDeclined ||
      // If the interviewer track doc doesn't exist and the interviewer explicitly
      // declined, we can proceed with candidate-only.
      (!interviewerSnap.exists && interviewerDeclined)

    // Also allow proceeding if we're past the grace window after the candidate track
    // completed and still no interviewer track.
    const candidateCompletedAt = (candidateData as { transcriptCompletedAt?: { toMillis: () => number } } | null)
      ?.transcriptCompletedAt?.toMillis()
    const pastGraceWindow =
      candidateDone &&
      !interviewerSnap.exists &&
      candidateCompletedAt &&
      Date.now() - candidateCompletedAt > MERGE_GRACE_MS

    if (!candidateDone) return // wait for the candidate track (required)
    if (!interviewerKnown && !pastGraceWindow) return // wait for interviewer

    // Mark processing to prevent concurrent runs.
    await sessionRef.set(
      { mergedTranscriptStatus: 'processing', updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )

    try {
      const hasInterviewerTrack =
        interviewerSnap.exists && interviewerStatus === 'completed'
      const candidateCompleted = candidateStatus === 'completed'

      if (!candidateCompleted && !hasInterviewerTrack) {
        // Both failed — nothing usable.
        await sessionRef.set(
          {
            mergedTranscriptStatus: 'failed',
            mergedTranscriptError: 'Both recording tracks failed to transcribe.',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        return
      }

      const merged = mergeTranscriptTracks(
        candidateCompleted ? (candidateData as TrackData) : null,
        hasInterviewerTrack ? (interviewerData as TrackData) : null,
      )

      const isPartial = !candidateCompleted || !hasInterviewerTrack
      await sessionRef.set(
        {
          mergedTranscript: merged,
          mergedTranscriptStatus: isPartial ? 'partial' : 'completed',
          mergedTranscriptCompletedAt: FieldValue.serverTimestamp(),
          mergedTranscriptError: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      logger.info('merge_completed', {
        sessionId,
        isPartial,
        hasCandidateTrack: candidateCompleted,
        hasInterviewerTrack,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown merge error.'
      logger.error('merge_failed', { sessionId, message })
      await sessionRef.set(
        {
          mergedTranscriptStatus: 'failed',
          mergedTranscriptError: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }
  },
)

/* -------------------------------------------------------------------------- */
/* promoteAbandonedSessions — unchanged                                       */
/* -------------------------------------------------------------------------- */

export const promoteAbandonedSessions = onSchedule(
  {
    schedule: 'every 1 hours',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
    const cutoff = Timestamp.fromMillis(Date.now() - TWENTY_FOUR_HOURS_MS)

    const snapshot = await db
      .collection('sessions')
      .where('status', '==', 'abandoned')
      .where('abandonedAt', '<=', cutoff)
      .get()

    if (snapshot.empty) {
      logger.info('fallback_promote: no eligible sessions')
      return
    }

    logger.info(`fallback_promote: found ${snapshot.docs.length} eligible session(s)`)

    for (const sessionDoc of snapshot.docs) {
      const sessionId = sessionDoc.id
      const data = sessionDoc.data()

      if (data.status === 'fallback_unrated') continue

      const candidateId = typeof data.candidateId === 'string' ? data.candidateId : null
      const caseId = typeof data.caseId === 'string' ? data.caseId : null
      if (!candidateId || !caseId) {
        logger.warn('fallback_promote: skipping session with missing candidateId or caseId', { sessionId })
        continue
      }

      const existingEval = await db
        .collection('evaluations')
        .where('lobbyId', '==', sessionId)
        .limit(1)
        .get()
      if (!existingEval.empty) {
        await sessionDoc.ref.set({ status: 'fallback_unrated', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        logger.info('fallback_promote: eval already exists, marking session', { sessionId })
        continue
      }

      let caseTitle = 'Untitled Case'
      let caseType: string | null = null
      let industry: string | null = null
      try {
        const caseSnap = await db.collection('cases').doc(caseId).get()
        if (caseSnap.exists) {
          const caseData = caseSnap.data() ?? {}
          if (typeof caseData.title === 'string' && caseData.title.trim()) caseTitle = caseData.title.trim()
          if (typeof caseData.case_type === 'string') caseType = caseData.case_type
          else if (typeof caseData.caseType === 'string') caseType = caseData.caseType
          if (typeof caseData.industry === 'string' && caseData.industry.trim()) industry = caseData.industry.trim()
        }
      } catch (err) {
        logger.warn('fallback_promote: could not fetch case metadata', { sessionId, caseId, err })
      }

      const sessionTimestamp = data.abandonedAt instanceof Timestamp
        ? data.abandonedAt
        : FieldValue.serverTimestamp()

      const evalRef = db.collection('evaluations').doc()
      const batch = db.batch()

      batch.set(evalRef, {
        caseId,
        caseTitle,
        caseType,
        industry,
        lobbyId: sessionId,
        candidateId,
        candidateEmail: typeof data.candidateEmail === 'string' ? data.candidateEmail : null,
        interviewerId: null,
        interviewerEmail: null,
        structureScore: null,
        understandingScore: null,
        deliveryScore: null,
        creativityScore: null,
        notes: 'No interviewer feedback. The session ended before the interviewer submitted a rating.',
        isUnrated: true,
        completedBy: 'timeout_fallback',
        createdAt: sessionTimestamp,
        updatedAt: FieldValue.serverTimestamp(),
      })

      batch.set(
        sessionDoc.ref,
        {
          status: 'fallback_unrated',
          completedBy: 'timeout_fallback',
          fallbackAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      await batch.commit()
      logger.info('fallback_promote: created unrated eval', { sessionId, evaluationId: evalRef.id })
    }
  },
)

export type _TimestampShape = Timestamp

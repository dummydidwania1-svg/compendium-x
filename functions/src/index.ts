/**
 * Firebase Cloud Functions for Compendium X.
 *
 * Currently exports a single Firestore-triggered function that handles
 * long-running transcription out-of-band so the Next.js API doesn't have
 * to hold an HTTP request open for several minutes.
 *
 * Trigger: `sessions/{sessionId}` write where `recording.transcriptStatus`
 *          transitions to `'pending'`.
 *
 * Steps:
 *   1. Skip if there's no audioUrl, no session in scope, or status is
 *      already being handled (idempotency guard against duplicate triggers).
 *   2. Mark `transcriptStatus: 'processing'`.
 *   3. Download audio → upload to Gemini Files API → wait for processing.
 *   4. Call generateContent → strip timestamps → write transcript fields back.
 *   5. On any failure: write `transcriptStatus: 'failed'` with the error.
 *
 * No HTTP timeout pressure: this function is configured with 540s (9 min)
 * which is the max for event-triggered functions. Plenty for 30–45 min
 * audio (Gemini Flash typically ~30–90s of processing on those lengths).
 */
import { initializeApp, getApps } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'

if (getApps().length === 0) initializeApp()
const db = getFirestore()

// `GEMINI_API_KEY` — secret value set via `firebase functions:secrets:set
// GEMINI_API_KEY` before first deploy. Loaded only on cold start of the
// function instance.
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')
const GEMINI_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.5-flash-lite'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'
const FILE_READY_ATTEMPTS = 90 // 90 × 2s = 3 minutes max wait for Gemini file processing
const FILE_READY_WAIT_MS = 2000
const GENERATION_MAX_ATTEMPTS = 3

// WebM/Opus speech at 24 kbps ≈ 3KB/sec. We reject recordings below this
// threshold because Gemini's audio models reliably hallucinate generic
// dialogue on very short / silent clips. 150KB ≈ 50 seconds of speech, which
// is well under a real case session but comfortably above a "test the mic
// for 5 seconds" recording.
const MIN_AUDIO_BYTES = 150 * 1024

// If Gemini returns this exact token (or anything obviously too short to be
// a real interview transcript), we treat it as a failure rather than letting
// hallucinated filler land in the dashboard. See the strengthened prompt
// below that explicitly instructs the model to use this signal.
const INAUDIBLE_TOKEN = 'INAUDIBLE'
const MIN_TRANSCRIPT_CHARS = 40

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

async function runTranscription(args: {
  sessionId: string
  audioUrl: string
  requestedMimeType: string
  storagePath: string
  apiKey: string
}): Promise<void> {
  const { sessionId, audioUrl, requestedMimeType, storagePath, apiKey } = args
  const sessionRef = db.collection('sessions').doc(sessionId)

  // Mark processing so duplicate triggers don't race us.
  await sessionRef.set(
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
      // Refuse early — sending too-short audio to Gemini reliably produces
      // hallucinated dialogue rather than an honest "couldn't transcribe".
      throw new Error(
        `Recording is too short to transcribe reliably (${Math.round(
          byteSize / 1024,
        )} KB; need at least ${MIN_AUDIO_BYTES / 1024} KB). Record for at least ~1 minute.`,
      )
    }

    // Resumable upload to Gemini Files API.
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

    // generateContent with retry-with-backoff for transient 5xx/429.
    const generationRequestBody = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'Transcribe this interview audio verbatim.',
                'Use speaker labels where possible (for example: Speaker 1, Speaker 2).',
                'Keep it concise and clean for downstream feedback analysis.',
                'Do not include any timestamps, timecodes, or bracketed time markers.',
                'Return only the transcript text.',
                // Anti-hallucination: explicitly tell Gemini to refuse on
                // unclear audio rather than invent plausible-sounding filler.
                `If the audio is silent, contains no clear speech, is mostly background noise, or is too short to be a real interview, respond with the single word ${INAUDIBLE_TOKEN} and nothing else.`,
                'Never invent or hallucinate dialogue. Only transcribe what you can clearly hear.',
              ].join(' '),
            },
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

    const transcript = stripTimestamps(extractTranscriptText(generationPayload))
    if (!transcript) throw new Error('Gemini returned an empty transcript.')

    // Anti-hallucination: reject the explicit INAUDIBLE refusal token, and
    // also reject suspiciously short responses (very short = either silence
    // or a hallucinated filler line we don't want to surface to the user).
    const normalizedTranscript = transcript.replace(/[^a-z]/gi, '').toUpperCase()
    if (normalizedTranscript === INAUDIBLE_TOKEN) {
      throw new Error(
        'No clear speech detected in the recording. Make sure your mic is unmuted and you speak audibly.',
      )
    }
    if (transcript.length < MIN_TRANSCRIPT_CHARS) {
      throw new Error(
        `Transcript was too short to be a real session (${transcript.length} characters). Re-record with at least ~1 minute of speech.`,
      )
    }

    const usageMetadata =
      (generationPayload as { usageMetadata?: unknown } | null)?.usageMetadata ?? null
    const finalMimeType = readyFile.mimeType || sourceMimeType

    await sessionRef.set(
      {
        recording: {
          transcriptStatus: 'completed',
          transcript,
          transcriptPreview: transcript.slice(0, 1000),
          transcriptCompletedAt: FieldValue.serverTimestamp(),
          transcriptModel: GEMINI_MODEL,
          transcriptUsage: usageMetadata,
          transcriptMimeType: finalMimeType,
          transcriptByteSize: byteSize,
          transcriptStoragePath: storagePath,
          transcriptError: null,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    logger.info('transcript_completed', { sessionId, bytes: byteSize, model: GEMINI_MODEL })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown transcription error.'
    logger.error('transcript_failed', { sessionId, message })
    await sessionRef.set(
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
  } finally {
    if (uploadedFileName) {
      await deleteGeminiFile(uploadedFileName, apiKey)
    }
  }
}

/**
 * Fires whenever any session document is created or updated. We only act
 * when `recording.transcriptStatus` transitions to `'pending'` — that's
 * the signal from the Next.js client that an audio upload finished or a
 * retry was requested.
 */
export const transcribeRecording = onDocumentWritten(
  {
    document: 'sessions/{sessionId}',
    region: 'us-central1',
    timeoutSeconds: 540, // 9 minutes — max for event-triggered Cloud Functions
    memory: '1GiB',
    secrets: [GEMINI_API_KEY],
    retry: false, // We handle retries via Firestore status field, not at the function layer.
  },
  async (event) => {
    const beforeStatus = event.data?.before?.data()?.recording?.transcriptStatus
    const afterData = event.data?.after?.data()
    const afterStatus = afterData?.recording?.transcriptStatus

    // Only act when the recording subdoc has just transitioned TO 'pending'.
    if (afterStatus !== 'pending') return
    if (beforeStatus === 'pending') return // duplicate fire — already in flight
    if (beforeStatus === 'processing') return // a previous run is still working

    const recording = afterData?.recording as
      | {
          audioUrl?: string
          mimeType?: string
          storagePath?: string
        }
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

    await runTranscription({
      sessionId: event.params.sessionId,
      audioUrl,
      requestedMimeType: recording.mimeType ?? '',
      storagePath,
      apiKey: GEMINI_API_KEY.value(),
    })
  },
)

/**
 * Runs every hour. Finds sessions abandoned more than 24 hours ago that
 * haven't yet been promoted to a fallback dashboard entry, creates an
 * unrated evaluation doc so the candidate sees the case in their case log,
 * and marks the session as `fallback_unrated`.
 *
 * The evaluation's `createdAt` is set to `abandonedAt` (the actual session
 * end time) so the case log timestamp reflects when the session happened,
 * not when this function ran.
 *
 * Unrated entries are excluded from score-based analytics; they appear only
 * in the case log with audio/transcript if available.
 */
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

    // Query sessions that are abandoned, older than 24h, and not yet promoted.
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

      // Skip if already promoted (idempotency guard).
      if (data.status === 'fallback_unrated') continue

      const candidateId = typeof data.candidateId === 'string' ? data.candidateId : null
      const caseId = typeof data.caseId === 'string' ? data.caseId : null
      if (!candidateId || !caseId) {
        logger.warn('fallback_promote: skipping session with missing candidateId or caseId', { sessionId })
        continue
      }

      // Check no evaluation already exists for this lobby (e.g. interviewer
      // submitted after candidate left but before the 24h window closed).
      const existingEval = await db
        .collection('evaluations')
        .where('lobbyId', '==', sessionId)
        .limit(1)
        .get()
      if (!existingEval.empty) {
        // Interviewer rated it — just mark session completed normally.
        await sessionDoc.ref.set({ status: 'fallback_unrated', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        logger.info('fallback_promote: eval already exists, marking session', { sessionId })
        continue
      }

      // Pull case metadata for denormalized fields on the evaluation doc.
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

      // Use abandonedAt as the evaluation timestamp so the case log shows
      // the actual session time, not the time this function ran.
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
        // All scores null — this entry is unrated.
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

// Suppress "unused" warnings for the imported `Timestamp` if a type
// reference goes away after edits; it's commonly handy on this surface.
export type _TimestampShape = Timestamp

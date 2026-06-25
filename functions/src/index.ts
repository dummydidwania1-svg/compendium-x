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
 *
 * 5. `finalizePendingMerges` — FIX 1c, 30-minute sweep for sessions where the
 *    interviewer never recorded and never explicitly declined. Calls evaluateAndMerge
 *    once the grace window (MERGE_GRACE_MS) has elapsed past candidateTranscriptCompletedAt.
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
const GEMINI_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.5-flash'

// --- ElevenLabs Scribe (ASR) transcription, for dual-mic tracks --------------
// Gemini *generates* [t=] timestamps as LLM tokens (unreliable / non-monotonic /
// compressed). ElevenLabs Scribe is an ASR model that *measures* each word's
// start/end from the audio waveform, so offsets are monotonic and span the full
// take by construction. We use it as the timestamp source for subcollection
// (dual-mic) tracks when TRANSCRIBE_PROVIDER === 'elevenlabs'. Default is
// 'gemini' so simply deploying this code changes nothing until the flag flips.
// On any ElevenLabs error we fall back to the existing Gemini path per-track.
const ELEVENLABS_API_KEY = defineSecret('ELEVENLABS_API_KEY')
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'scribe_v2'
const ELEVEN_TURN_GAP_MS = Number(process.env.ELEVEN_TURN_GAP_MS || 1500)
// Default is now 'elevenlabs' (verified live on dual-mic sessions). Override
// back to Gemini at any time by setting TRANSCRIBE_PROVIDER=gemini in
// functions/.env and redeploying. Per-track auto-fallback to Gemini on any
// ElevenLabs error remains in place regardless of this default.
const TRANSCRIBE_PROVIDER = process.env.TRANSCRIBE_PROVIDER || 'elevenlabs'
const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text'

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

type Turn = { offsetMs: number | null; text: string }

/**
 * Parse per-turn timing markers produced by the dual-mic Gemini prompt.
 * Markers look like `[t=30.5]` (seconds from track start) and Gemini emits them
 * INLINE within the running text (not necessarily at the start of a line), often
 * followed by a redundant role label such as "Candidate:" / "Interviewer:".
 * This splits the text on every marker occurrence (anywhere in the string),
 * strips the redundant leading role label from each turn (the role is already
 * known per track), and returns structured turns plus a clean display string.
 * offsetMs is null for any leading text that appears before the first marker.
 */
function parseTurnOffsets(raw: string): { turns: Turn[]; cleanText: string } {
  const turns: Turn[] = []
  // Match a marker anywhere in the text, capturing its seconds value.
  const MARKER_RE = /\[t=([\d.]+)\]/g
  // Strip a single redundant leading speaker label (e.g. "Interviewer:").
  const LABEL_RE = /^\s*(?:candidate|interviewer|speaker\s*\d*)\s*:\s*/i

  const clean = (text: string): string => {
    let out = text.trim()
    // Gemini may repeat the label multiple times in a row; strip them all.
    while (LABEL_RE.test(out)) {
      out = out.replace(LABEL_RE, '').trim()
    }
    return out
  }

  let lastIndex = 0
  let match: RegExpExecArray | null
  let pendingOffset: number | null = null
  while ((match = MARKER_RE.exec(raw)) !== null) {
    // Text that appeared since the previous marker belongs to the previous turn
    // (or to a leading null-offset turn if no marker has been seen yet).
    const segment = raw.slice(lastIndex, match.index)
    const text = clean(segment)
    if (text) turns.push({ offsetMs: pendingOffset, text })
    pendingOffset = parseFloat(match[1]) * 1000
    lastIndex = match.index + match[0].length
  }
  // Trailing text after the final marker.
  const tail = clean(raw.slice(lastIndex))
  if (tail) turns.push({ offsetMs: pendingOffset, text: tail })

  // Fallback: if no markers were found at all, keep the whole thing as one
  // null-offset turn so display still works (merge will interpolate/fallback).
  if (turns.length === 0) {
    const whole = clean(raw)
    if (whole) turns.push({ offsetMs: null, text: whole })
  }

  return { turns, cleanText: turns.map((t) => t.text).join('\n') }
}

// One word as returned by ElevenLabs Scribe.
type ElevenWord = { text: string; start: number; end: number; type: string }

// Call ElevenLabs Scribe with raw audio bytes and return its words[] array.
// Each word carries a waveform-measured start/end (seconds). Retries on 429/5xx
// with the same backoff schedule as the Gemini generation loop.
async function elevenLabsWords(
  audioBytes: ArrayBuffer,
  mimeType: string,
  apiKey: string,
): Promise<ElevenWord[]> {
  let lastError = ''
  for (let attempt = 1; attempt <= GENERATION_MAX_ATTEMPTS; attempt += 1) {
    const form = new FormData()
    form.append('model_id', ELEVENLABS_MODEL)
    form.append('timestamps_granularity', 'word')
    form.append(
      'file',
      new Blob([audioBytes], { type: mimeType || 'audio/webm' }),
      'audio.webm',
    )
    const response = await fetch(ELEVENLABS_STT_URL, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
    })
    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as { words?: ElevenWord[] } | null
      return payload?.words ?? []
    }
    lastError = `ElevenLabs HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`
    const retriable = response.status >= 500 || response.status === 429
    if (!retriable || attempt === GENERATION_MAX_ATTEMPTS) break
    await sleep(500 * 3 ** (attempt - 1))
  }
  throw new Error(lastError || 'ElevenLabs request failed.')
}

// Group Scribe words into Turn[] {offsetMs,text}. A new turn starts after a
// silence gap of >= gapMs between the previous word's end and the next word's
// start. offsetMs = the first word's measured start (ms from track start).
function elevenWordsToTurns(words: ElevenWord[], gapMs: number = ELEVEN_TURN_GAP_MS): Turn[] {
  const real = words.filter((w) => w.type === 'word' && typeof w.start === 'number')
  const grouped: Array<{ offsetMs: number; text: string }> = []
  let current: { offsetMs: number; text: string } | null = null
  let prevEndMs: number | null = null
  for (const word of real) {
    const startMs = Math.round(word.start * 1000)
    if (current === null || (prevEndMs !== null && startMs - prevEndMs >= gapMs)) {
      current = { offsetMs: startMs, text: word.text }
      grouped.push(current)
    } else {
      current.text += (word.text.startsWith("'") ? '' : ' ') + word.text
    }
    prevEndMs = Math.round(word.end * 1000)
  }
  return grouped.map((t) => ({ offsetMs: t.offsetMs, text: t.text.trim() }))
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
  elevenApiKey?: string
}): Promise<void> {
  const { target, sessionId, audioUrl, requestedMimeType, storagePath, apiKey, elevenApiKey } = args
  // Tracks which provider actually produced the transcript, so writeSuccess can
  // record the right transcriptModel. Defaults to Gemini; set true only when the
  // ElevenLabs path succeeds for a dual-mic track.
  let usedEleven = false

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
    turns: Turn[]
  }) => {
    const successFields = {
      transcriptStatus: 'completed',
      transcript: fields.transcript,
      transcriptPreview: fields.transcriptPreview,
      transcriptCompletedAt: FieldValue.serverTimestamp(),
      transcriptModel: usedEleven ? `elevenlabs:${ELEVENLABS_MODEL}` : GEMINI_MODEL,
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
          // Structured turns for the merge function (text + offsetMs, never desyncs).
          transcriptTurns: fields.turns,
          // Parallel offsets array kept for backward-compat readers (seconds).
          transcriptTurnOffsets: fields.turns.map((t) => (t.offsetMs ?? 0) / 1000),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      // Denormalize candidate completion onto the session doc so the scheduled
      // sweep (finalizePendingMerges) can query sessions where the candidate
      // transcription completed but the merge hasn't run yet (FIX 1c).
      if (target.role === 'candidate') {
        await target.sessionRef.set(
          {
            candidateTranscriptStatus: 'completed',
            candidateTranscriptCompletedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }
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

    // Shared result holders so both the ElevenLabs and Gemini paths feed the
    // same writeSuccess() below.
    let displayTranscript = ''
    let turns: Turn[] = []
    let usageMetadata: unknown = null
    let finalMimeType = sourceMimeType

    // ---- ElevenLabs Scribe path (dual-mic only, flag-gated, auto-fallback) ----
    // When enabled, we transcribe with Scribe and SKIP the Gemini upload+generate
    // entirely (cost saver). On any error we log and fall through to Gemini below,
    // so a bad key / outage degrades gracefully instead of failing the session.
    if (
      target.kind === 'subcollection' &&
      TRANSCRIBE_PROVIDER === 'elevenlabs' &&
      elevenApiKey
    ) {
      try {
        const words = await elevenLabsWords(audioBytes, sourceMimeType, elevenApiKey)
        const elevenTurns = elevenWordsToTurns(words)
        if (elevenTurns.length === 0) throw new Error('ElevenLabs returned no words.')
        turns = elevenTurns
        displayTranscript = elevenTurns.map((t) => t.text).join('\n')
        finalMimeType = sourceMimeType
        usedEleven = true
      } catch (elevenErr) {
        logger.warn('elevenlabs_failed_fallback_gemini', {
          sessionId,
          role: target.kind === 'subcollection' ? target.role : undefined,
          message: elevenErr instanceof Error ? elevenErr.message : String(elevenErr),
        })
        // usedEleven stays false -> Gemini block runs below.
      }
    }

    if (!usedEleven) {
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
    if (target.kind === 'subcollection') {
      const parsed = parseTurnOffsets(rawTranscript)
      displayTranscript = stripTimestamps(parsed.cleanText)
      turns = parsed.turns
    } else {
      displayTranscript = stripTimestamps(rawTranscript)
    }

    usageMetadata =
      (generationPayload as { usageMetadata?: unknown } | null)?.usageMetadata ?? null
    finalMimeType = readyFile.mimeType || sourceMimeType
    } // end if (!usedEleven) — Gemini path

    // ---- Shared validation + write (both providers) ----
    if (!displayTranscript) throw new Error('Transcription returned an empty transcript.')
    if (displayTranscript.length < MIN_TRANSCRIPT_CHARS) {
      throw new Error(
        `Transcript was too short to be a real session (${displayTranscript.length} characters). Re-record with at least ~1 minute of speech.`,
      )
    }

    await writeSuccess({
      transcript: displayTranscript,
      transcriptPreview: displayTranscript.slice(0, 1000),
      usageMetadata,
      finalMimeType,
      byteSize,
      turns,
    })

    logger.info('transcript_completed', {
      sessionId,
      kind: target.kind,
      role: target.kind === 'subcollection' ? target.role : undefined,
      bytes: byteSize,
      model: usedEleven ? `elevenlabs:${ELEVENLABS_MODEL}` : GEMINI_MODEL,
      turnCount: turns.length,
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
  transcriptTurns?: Turn[]
  transcriptTurnOffsets?: number[]
  startOffsetMs?: number
  transcriptStatus?: string
  audioUrl?: string
}

/**
 * Interleave two per-track transcripts into one merged transcript using structured
 * turns and partial-marker interpolation.
 *
 * Priority for turn data (most to least structured):
 *   1. transcriptTurns (new format — text + offsetMs, no desync risk)
 *   2. transcriptTurnOffsets + matching line count (748d1ca-era parallel arrays)
 *   3. raw transcript lines with no timing (all offsetMs treated as null)
 *
 * Turns with offsetMs=null are interpolated between their nearest marked neighbours
 * within the same track, so sparse markers degrade gracefully rather than forcing
 * a whole-block fallback. Only when a track has zero turns at all does it fall back
 * to the raw transcript string.
 */
function mergeTranscriptTracks(
  candidate: TrackData | null,
  interviewer: TrackData | null,
): string {
  // Label each line with its known speaker. In dual-mic, the role is 100% certain
  // (each track is one person), so no diarization guessing is needed.
  const labelLines = (text: string, role: 'Candidate' | 'Interviewer'): string =>
    text
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => `${role}: ${l}`)
      .join('\n')

  if (!candidate && !interviewer) return ''
  if (!candidate) return labelLines(interviewer!.transcript, 'Interviewer')
  if (!interviewer) return labelLines(candidate.transcript, 'Candidate')

  type PositionedTurn = {
    globalMs: number
    seqKey: number
    text: string
    role: 'Candidate' | 'Interviewer'
  }

  function buildPositioned(
    track: TrackData,
    trackStart: number,
    seqBase: number,
    role: 'Candidate' | 'Interviewer',
  ): PositionedTurn[] {
    // Resolve the best available turn representation.
    let turns: Array<{ offsetMs: number | null; text: string }>

    if (track.transcriptTurns && track.transcriptTurns.length > 0) {
      turns = track.transcriptTurns
    } else if (track.transcriptTurnOffsets) {
      const lines = track.transcript.split('\n').filter((l) => l.trim())
      const offsets = track.transcriptTurnOffsets
      if (lines.length === offsets.length && lines.length > 0) {
        turns = lines.map((text, i) => ({ offsetMs: offsets[i] * 1000, text }))
      } else {
        turns = lines.map((text) => ({ offsetMs: null, text }))
      }
    } else {
      turns = track.transcript.split('\n').filter((l) => l.trim()).map((text) => ({ offsetMs: null, text }))
    }

    if (turns.length === 0) return []

    // First pass: assign globalMs to marker-bearing turns.
    const tentative: (number | null)[] = turns.map((t) =>
      t.offsetMs !== null ? Math.max(0, trackStart + t.offsetMs) : null,
    )

    // Second pass: interpolate null positions between known neighbours.
    for (let i = 0; i < turns.length; i++) {
      if (tentative[i] !== null) continue

      let prevMs = trackStart
      let prevIdx = -1
      for (let p = i - 1; p >= 0; p--) {
        if (tentative[p] !== null) { prevMs = tentative[p]!; prevIdx = p; break }
      }

      let nextMs: number | null = null
      let nextIdx = turns.length
      for (let n = i + 1; n < turns.length; n++) {
        if (tentative[n] !== null) { nextMs = tentative[n]!; nextIdx = n; break }
      }

      if (nextMs !== null) {
        const steps = nextIdx - prevIdx
        tentative[i] = prevMs + ((nextMs - prevMs) * (i - prevIdx)) / steps
      } else {
        // No following marker: place 1 ms per position after last known point.
        tentative[i] = prevMs + (i - prevIdx) * 1
      }
    }

    return turns.map((t, i) => ({
      globalMs: tentative[i] as number,
      // seqKey preserves within-track order on ties; candidate uses 0..N-1,
      // interviewer uses 1_000_000..1_000_000+M-1 (non-overlapping ranges).
      seqKey: seqBase + i,
      text: t.text,
      role,
    }))
  }

  const cStart = Math.max(0, candidate.startOffsetMs ?? 0)
  const iStart = Math.max(0, interviewer.startOffsetMs ?? 0)

  const cTurns = buildPositioned(candidate, cStart, 0, 'Candidate')
  const iTurns = buildPositioned(interviewer, iStart, 1_000_000, 'Interviewer')

  if (cTurns.length === 0 && iTurns.length === 0) return ''
  if (cTurns.length === 0) return labelLines(interviewer.transcript, 'Interviewer')
  if (iTurns.length === 0) return labelLines(candidate.transcript, 'Candidate')

  const all = [...cTurns, ...iTurns]
  all.sort((a, b) => (a.globalMs !== b.globalMs ? a.globalMs - b.globalMs : a.seqKey - b.seqKey))

  return all.map((t) => `${t.role}: ${t.text}`).join('\n')
}

/* -------------------------------------------------------------------------- */
/* evaluateAndMerge — shared merge decision (FIX 1a)                         */
/* -------------------------------------------------------------------------- */

/**
 * Core merge-decision function called from multiple trigger paths:
 *  - mergeTranscripts (track-doc write trigger)
 *  - transcribeRecording (session-doc trigger, for interviewerAudioCaptured signal)
 *  - finalizePendingMerges (scheduled sweep)
 *
 * Idempotency: 'processing' and 'completed' statuses block re-entry.
 * 'partial' does NOT block re-entry so a late interviewer track can upgrade it.
 */
async function evaluateAndMerge(sessionId: string): Promise<void> {
  const sessionRef = db.collection('sessions').doc(sessionId)

  const sessionSnap = await sessionRef.get()
  if (!sessionSnap.exists) return
  const sessionData = sessionSnap.data() ?? {}
  const existingMergeStatus = sessionData.mergedTranscriptStatus as string | undefined
  if (existingMergeStatus === 'completed' || existingMergeStatus === 'processing') return

  const recordingsCol = sessionRef.collection('recordings')
  const [candidateSnap, interviewerSnap] = await Promise.all([
    recordingsCol.doc('candidate').get(),
    recordingsCol.doc('interviewer').get(),
  ])

  const candidateData = candidateSnap.exists ? (candidateSnap.data() as TrackData) : null
  const interviewerData = interviewerSnap.exists ? (interviewerSnap.data() as TrackData) : null

  // Backfill audio URLs from subcollection onto the session doc if missing.
  // Existing sessions pre-748d1ca only have audioUrl on the subcollection doc.
  const audioUrlBackfill: Record<string, string> = {}
  if (!sessionData.candidateAudioUrl && candidateData?.audioUrl) {
    audioUrlBackfill.candidateAudioUrl = candidateData.audioUrl
  }
  if (!sessionData.interviewerAudioUrl && interviewerData?.audioUrl) {
    audioUrlBackfill.interviewerAudioUrl = interviewerData.audioUrl
  }

  const candidateStatus = candidateData?.transcriptStatus
  const interviewerStatus = interviewerData?.transcriptStatus
  const interviewerDeclined = sessionData.interviewerAudioCaptured === false

  const terminal = (s: string | undefined) => s === 'completed' || s === 'failed'

  const candidateDone = terminal(candidateStatus as string | undefined)
  const interviewerKnown =
    terminal(interviewerStatus as string | undefined) ||
    interviewerDeclined ||
    (!interviewerSnap.exists && interviewerDeclined)

  const candidateCompletedAt = (
    candidateData as { transcriptCompletedAt?: { toMillis: () => number } } | null
  )?.transcriptCompletedAt?.toMillis()

  // 'recording' means a periodic flush wrote the doc but no final/beacon ever arrived.
  // Treat it like absent for the grace-window check so a stuck session still merges.
  const interviewerStuckInRecording =
    interviewerSnap.exists &&
    !terminal(interviewerStatus as string | undefined) &&
    interviewerStatus !== 'pending' &&
    interviewerStatus !== 'processing'

  const pastGraceWindow =
    candidateDone &&
    (!interviewerSnap.exists || interviewerStuckInRecording) &&
    candidateCompletedAt !== undefined &&
    Date.now() - candidateCompletedAt > MERGE_GRACE_MS

  if (!candidateDone) return
  if (!interviewerKnown && !pastGraceWindow) return

  // Safety net: if the interviewer track is stuck in 'recording' (beacon never fired),
  // upgrade it to 'pending' and return — transcription will fire, then mergeTranscripts
  // will call evaluateAndMerge again once the track reaches a terminal state.
  if (interviewerStuckInRecording && pastGraceWindow) {
    await recordingsCol.doc('interviewer').set(
      { transcriptStatus: 'pending', interviewerInterrupted: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    await sessionRef.set(
      { interviewerInterrupted: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    return
  }

  await sessionRef.set(
    { mergedTranscriptStatus: 'processing', ...audioUrlBackfill, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )

  try {
    const hasInterviewerTrack = interviewerSnap.exists && interviewerStatus === 'completed'
    const candidateCompleted = candidateStatus === 'completed'
    const interviewerInterrupted = sessionData.interviewerInterrupted === true

    if (!candidateCompleted && !hasInterviewerTrack) {
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

    // If interrupted, mark partial regardless of track completion and prepend a note.
    const isPartial = !candidateCompleted || !hasInterviewerTrack || interviewerInterrupted
    const finalMerged =
      interviewerInterrupted && hasInterviewerTrack && merged
        ? '[Note: the interviewer left mid-session; their audio is partial up to the point they disconnected.]\n\n' + merged
        : merged

    await sessionRef.set(
      {
        mergedTranscript: finalMerged,
        mergedTranscriptStatus: isPartial ? 'partial' : 'completed',
        mergedTranscriptCompletedAt: FieldValue.serverTimestamp(),
        mergedTranscriptError: null,
        mergedTranscriptReason: interviewerInterrupted ? 'interviewer_interrupted' : null,
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
    const beforeData = event.data?.before?.data()
    const afterData = event.data?.after?.data()

    // 1b: When interviewerAudioCaptured flips to false (decline signal written by
    // the presence route), immediately re-evaluate the merge so the candidate-only
    // partial transcript is produced without waiting for the next track write.
    // The interviewerAudioCaptured field lives on the session doc, not the
    // recordings subcollection, so this is the only trigger that sees it.
    const beforeCaptured = beforeData?.interviewerAudioCaptured
    const afterCaptured = afterData?.interviewerAudioCaptured
    if (beforeCaptured !== afterCaptured && afterCaptured === false) {
      await evaluateAndMerge(event.params.sessionId)
    }

    // Original path: local/old-session transcription triggered by pending status.
    const beforeStatus = beforeData?.recording?.transcriptStatus
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
    secrets: [GEMINI_API_KEY, ELEVENLABS_API_KEY],
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
      // ElevenLabs key is read lazily; only used when TRANSCRIBE_PROVIDER === 'elevenlabs'.
      elevenApiKey: ELEVENLABS_API_KEY.value(),
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

    await evaluateAndMerge(event.params.sessionId)
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

/* -------------------------------------------------------------------------- */
/* finalizePendingMerges — scheduled grace-window sweep (FIX 1c)              */
/* -------------------------------------------------------------------------- */

/**
 * Runs every 30 minutes to catch sessions where the interviewer never recorded
 * and never explicitly declined — meaning no realtime trigger would ever re-fire
 * the merge after the grace window elapses.
 *
 * Relies on `candidateTranscriptStatus` / `candidateTranscriptCompletedAt` being
 * denormalized onto the session doc when the candidate track completes (see
 * writeSuccess in runTranscription). Sessions where the interviewer's decline
 * signal already arrived are handled immediately by 1b (transcribeRecording), so
 * this sweep is a safety net for the silent no-show case.
 */
export const finalizePendingMerges = onSchedule(
  {
    schedule: 'every 30 minutes',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const snapshot = await db
      .collection('sessions')
      .where('candidateTranscriptStatus', '==', 'completed')
      .get()

    if (snapshot.empty) {
      logger.info('finalize_pending: no candidate-completed sessions')
      return
    }

    let evaluated = 0
    for (const sessionDoc of snapshot.docs) {
      const data = sessionDoc.data()
      const mergedStatus = data.mergedTranscriptStatus as string | undefined
      if (mergedStatus === 'completed' || mergedStatus === 'processing') continue

      const interviewerDeclined = data.interviewerAudioCaptured === false
      const completedAtMs = (
        data.candidateTranscriptCompletedAt as { toMillis?: () => number } | null
      )?.toMillis?.()
      const pastGrace =
        completedAtMs !== undefined && Date.now() - completedAtMs > MERGE_GRACE_MS

      if (!interviewerDeclined && !pastGrace) continue

      evaluated++
      await evaluateAndMerge(sessionDoc.id)
    }

    logger.info(`finalize_pending: evaluated ${evaluated} session(s)`)
  },
)

export type _TimestampShape = Timestamp

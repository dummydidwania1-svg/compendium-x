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
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import * as functionsV1 from 'firebase-functions/v1'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  buildOnboardingEmailHtml,
  buildVerificationEmailHtml,
  firstNameFrom,
  sendGmail,
} from './emails.js'

if (getApps().length === 0) initializeApp()
const db = getFirestore()
const execFileAsync = promisify(execFile)

// PCM format used by normalizeAudioTimestamps below -- picked once so the
// decode and re-encode steps agree, and so duration can be computed directly
// from byte size without needing ffprobe (not bundled with ffmpeg-static).
const PCM_SAMPLE_RATE = 48000
const PCM_CHANNELS = 1
const PCM_BYTES_PER_SAMPLE = 2 // s16le

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
// Separate API key for split-screen (local) mode — independent of the remote-mode
// key so grant budgets are tracked separately. Set via:
//   firebase functions:secrets:set ELEVENLABS_SPLITSCREEN_API_KEY
const ELEVENLABS_SPLITSCREEN_API_KEY = defineSecret('ELEVENLABS_SPLITSCREEN_API_KEY')
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'scribe_v2'
const ELEVEN_TURN_GAP_MS = Number(process.env.ELEVEN_TURN_GAP_MS || 1500)
// ElevenLabs Scribe is the sole primary provider for remote (dual-mic) tracks;
// Gemini remains the automatic fallback if ElevenLabs fails.
const TRANSCRIBE_PROVIDER = process.env.TRANSCRIBE_PROVIDER || 'elevenlabs'
// Independent flag for split-screen mode — defaults to 'elevenlabs'.
const SPLITSCREEN_TRANSCRIBE_PROVIDER = process.env.SPLITSCREEN_TRANSCRIBE_PROVIDER || 'elevenlabs'
const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text'

// Server-side audio merge (dual-mic): time-align both mic recordings by their
// startOffsetMs and mix into one mono file written to Storage as mergedAudioUrl.
// Best-effort: any failure is logged and never blocks the transcript merge.
// Disable by setting MERGE_AUDIO=off.
const MERGE_AUDIO_ENABLED = (process.env.MERGE_AUDIO || 'on') !== 'off'

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
  if (!value || value.trim().length === 0) return 'audio/mp4'
  const clean = value.split(';')[0]?.trim()
  return clean && clean.startsWith('audio/') ? clean : 'audio/mp4'
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

type Turn = { offsetMs: number | null; text: string; speaker?: string }

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
    form.append('no_verbatim', 'true')
    form.append('temperature', '0')
    // language_code: 'en' forces Roman script output for single-speaker remote
    // tracks. Without it, a predominantly Hindi speaker gets Devanagari since
    // Scribe auto-detects Hindi as dominant on that track. Split-screen omits
    // this because both speakers share one file and English stays dominant.
    form.append('language_code', 'en')
    form.append(
      'file',
      new Blob([audioBytes], { type: mimeType || 'audio/mp4' }),
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

// ---- ElevenLabs split-screen (local/single-mic) helpers --------------------

type ElevenWordDiarized = ElevenWord & { speaker_id?: string }

// Like elevenLabsWords() but enables diarization for a single mixed-mic file.
// language_code: 'en' forces Roman script output — same behaviour as remote mode
// so Hindi speech stays in Hinglish rather than Devanagari.
async function elevenLabsSplitScreenWords(
  audioBytes: ArrayBuffer,
  mimeType: string,
  apiKey: string,
): Promise<ElevenWordDiarized[]> {
  let lastError = ''
  for (let attempt = 1; attempt <= GENERATION_MAX_ATTEMPTS; attempt += 1) {
    const form = new FormData()
    form.append('model_id', ELEVENLABS_MODEL)
    form.append('timestamps_granularity', 'word')
    form.append('diarize', 'true')
    form.append('num_speakers', '2')
    form.append('no_verbatim', 'true')
    form.append('temperature', '0')
    form.append('language_code', 'en')
    form.append(
      'file',
      new Blob([audioBytes], { type: mimeType || 'audio/mp4' }),
      'audio.webm',
    )
    const response = await fetch(ELEVENLABS_STT_URL, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
    })
    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as { words?: ElevenWordDiarized[] } | null
      return payload?.words ?? []
    }
    lastError = `ElevenLabs HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`
    const retriable = response.status >= 500 || response.status === 429
    if (!retriable || attempt === GENERATION_MAX_ATTEMPTS) break
    await sleep(500 * 3 ** (attempt - 1))
  }
  throw new Error(lastError || 'ElevenLabs split-screen request failed.')
}

// Converts diarized Scribe words into speaker-labeled turns.
// Groups consecutive words by speaker_id — a new turn starts when the speaker
// changes OR when there's a silence gap >= gapMs. Maps the lowest speaker_id
// seen to 'S1' and the other to 'S2'.
function elevenSplitScreenToTurns(
  words: ElevenWordDiarized[],
  gapMs: number = ELEVEN_TURN_GAP_MS,
): Turn[] {
  const real = words.filter((w) => w.type === 'word' && typeof w.start === 'number')
  if (real.length === 0) return []

  // Build stable S1/S2 mapping from first-seen speaker_id.
  const speakerMap = new Map<string, 'S1' | 'S2'>()
  for (const w of real) {
    if (w.speaker_id != null && speakerMap.size < 2 && !speakerMap.has(w.speaker_id)) {
      speakerMap.set(w.speaker_id, speakerMap.size === 0 ? 'S1' : 'S2')
    }
  }
  const labelFor = (id: string | undefined): string =>
    (id != null ? speakerMap.get(id) : undefined) ?? 'S1'

  const grouped: Array<{ offsetMs: number; text: string; speaker: string }> = []
  let current: { offsetMs: number; text: string; speaker: string } | null = null
  let prevEndMs: number | null = null

  for (const word of real) {
    const startMs = Math.round(word.start * 1000)
    const label = labelFor(word.speaker_id)
    const speakerChanged = current !== null && label !== current.speaker
    const silenceGap = prevEndMs !== null && startMs - prevEndMs >= gapMs
    if (current === null || speakerChanged || silenceGap) {
      current = { offsetMs: startMs, text: word.text, speaker: label }
      grouped.push(current)
    } else {
      current.text += (word.text.startsWith("'") ? '' : ' ') + word.text
    }
    prevEndMs = Math.round(word.end * 1000)
  }

  return grouped.map((t) => ({ offsetMs: t.offsetMs, text: t.text.trim(), speaker: t.speaker }))
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
  const { target, sessionId, audioUrl: _audioUrl, requestedMimeType, storagePath, apiKey, elevenApiKey } = args
  // Tracks which provider actually produced the transcript, so writeSuccess can
  // record the right transcriptModel. Defaults to Gemini; set true only when the
  // ElevenLabs path succeeds for a dual-mic track.
  let usedEleven = false
  // Computed once provider paths settle; helper to keep writeSuccess + logger in sync.
  const getTranscriptModelLabel = () => {
    if (usedEleven) return target.kind === 'embedded' ? `elevenlabs:${ELEVENLABS_MODEL}:diarized` : `elevenlabs:${ELEVENLABS_MODEL}`
    return GEMINI_MODEL
  }

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
          // Clear the stuck-processing rescue marker (if this attempt was
          // itself triggered by that sweep) now that a fresh worker has
          // actually started — otherwise it would linger and incorrectly
          // let some later, unrelated 'processing' write bypass the re-entry
          // guard above.
          processingStuckRescue: false,
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
    const transcriptModelLabel = getTranscriptModelLabel()

    const successFields = {
      transcriptStatus: 'completed',
      transcript: fields.transcript,
      transcriptPreview: fields.transcriptPreview,
      transcriptCompletedAt: FieldValue.serverTimestamp(),
      transcriptModel: transcriptModelLabel,
      transcriptUsage: fields.usageMetadata,
      transcriptMimeType: fields.finalMimeType,
      transcriptByteSize: fields.byteSize,
      transcriptStoragePath: storagePath,
      transcriptError: null,
    }
    if (target.kind === 'embedded') {
      const embeddedExtra = usedEleven
        ? { transcriptTurns: fields.turns }
        : {}
      await target.sessionRef.set(
        { recording: { ...successFields, ...embeddedExtra }, updatedAt: FieldValue.serverTimestamp() },
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
      // Denormalize completion onto the session doc so the scheduled sweep
      // (finalizePendingMerges) can query sessions where transcription
      // terminated (succeeded OR failed — see writeFailure's matching
      // denormalization below) but the merge hasn't run yet (FIX 1c).
      // Candidate and interviewer each get their own role-prefixed pair so the
      // sweep can anchor its grace window off whichever side actually finished,
      // instead of only ever being able to see the candidate's outcome.
      const roleTranscriptStatusField = target.role === 'candidate' ? 'candidateTranscriptStatus' : 'interviewerTranscriptStatus'
      const roleTranscriptCompletedAtField = target.role === 'candidate' ? 'candidateTranscriptCompletedAt' : 'interviewerTranscriptCompletedAt'
      await target.sessionRef.set(
        {
          [roleTranscriptStatusField]: 'completed',
          [roleTranscriptCompletedAtField]: FieldValue.serverTimestamp(),
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
      // Same denormalization as writeSuccess, but reflecting 'failed' — without
      // this, a failed transcript never starts the 5-minute grace-window clock
      // (evaluateAndMerge/finalizePendingMerges only ever saw the success case),
      // so a session where the candidate's transcript genuinely failed (e.g.
      // audio too short) would otherwise be stuck waiting on the interviewer
      // forever, with no safety net ever kicking in.
      const roleTranscriptStatusField = target.role === 'candidate' ? 'candidateTranscriptStatus' : 'interviewerTranscriptStatus'
      const roleTranscriptCompletedAtField = target.role === 'candidate' ? 'candidateTranscriptCompletedAt' : 'interviewerTranscriptCompletedAt'
      await target.sessionRef.set(
        {
          [roleTranscriptStatusField]: 'failed',
          [roleTranscriptCompletedAtField]: FieldValue.serverTimestamp(),
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
    // Use the Admin SDK (service-account credentials) instead of fetch(audioUrl)
    // so that download-token invalidation — caused by the static interviewer-live.webm
    // path being overwritten on every periodic flush — never blocks transcription.
    const adminFile = getStorage().bucket().file(storagePath)
    const [audioBuffer] = await adminFile.download()
    const [fileMeta] = await adminFile.getMetadata()
    const sourceMimeType = normalizeMimeType(requestedMimeType || fileMeta.contentType)
    const audioBytes: ArrayBuffer = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength,
    ) as ArrayBuffer
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

    // ---- ElevenLabs Scribe path — split-screen (embedded/local) mode ----------
    // Single mixed-mic file with diarization: produces S1/S2 labeled turns.
    // Uses a separate API key (ELEVENLABS_SPLITSCREEN_API_KEY) and a separate
    // provider flag (SPLITSCREEN_TRANSCRIBE_PROVIDER) so each mode is toggled
    // independently. On any error, falls through to Gemini below.
    if (
      target.kind === 'embedded' &&
      SPLITSCREEN_TRANSCRIBE_PROVIDER === 'elevenlabs' &&
      elevenApiKey
    ) {
      try {
        const words = await elevenLabsSplitScreenWords(audioBytes, sourceMimeType, elevenApiKey)
        const diarizedTurns = elevenSplitScreenToTurns(words)
        if (diarizedTurns.length === 0) throw new Error('ElevenLabs returned no words.')
        turns = diarizedTurns
        // Build display transcript with S1:/S2: prefixes so the dashboard can
        // parse and render speaker bubbles without extra Firestore fields.
        displayTranscript = diarizedTurns.map((t) => `${t.speaker ?? 'S1'}: ${t.text}`).join('\n')
        finalMimeType = sourceMimeType
        usedEleven = true
      } catch (elevenErr) {
        logger.warn('elevenlabs_splitscreen_failed_fallback_gemini', {
          sessionId,
          message: elevenErr instanceof Error ? elevenErr.message : String(elevenErr),
        })
        // usedEleven stays false -> Gemini block runs below.
      }
    }

    // ---- ElevenLabs Scribe path (dual-mic only, sole primary, auto-fallback) --
    // ElevenLabs is the only remote-mode provider. On any error we fall through
    // to Gemini as the last-resort fallback.
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
    } // end if (!usedEleven) — Gemini fallback path

    // ---- Shared validation + write (ElevenLabs or Gemini fallback) ----
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
      model: getTranscriptModelLabel(),
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
  byteSize?: number
  durationMs?: number
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

/**
 * A MediaRecorder session that was paused/resumed (e.g. the mic dropped and
 * came back) and later concatenated client-side into one file produces a
 * container whose internal segments each restart their own timestamps from
 * roughly zero. ffmpeg (and browsers) read the FIRST segment's duration as
 * the whole file's duration and refuse to play/report past it, even though
 * every segment's audio samples are actually present and decodable end to
 * end. Confirmed on a real affected file: -fflags +genpts and +igndts alone
 * do not fix this (the demuxer still clamps the later segments' timestamps
 * backward instead of offsetting them forward) -- the only combination that
 * actually produced a correct duration was decoding fully to raw PCM first
 * (which sidesteps the broken container timestamps entirely, since PCM has
 * none) and re-encoding that PCM into a fresh container from scratch.
 *
 * Returns the corrected file's duration in ms, computed directly from the
 * PCM byte size (no ffprobe dependency) rather than trusting any container
 * duration field again.
 */
async function normalizeAudioTimestamps(
  ffmpegPath: string,
  inPath: string,
  outPath: string,
  trimStartSec = 0,
): Promise<number> {
  const pcmPath = `${outPath}.pcm`
  try {
    await execFileAsync(
      ffmpegPath,
      ['-y', '-fflags', '+genpts+igndts+discardcorrupt', '-i', inPath,
        '-ac', String(PCM_CHANNELS), '-ar', String(PCM_SAMPLE_RATE), '-f', 's16le', pcmPath],
      { maxBuffer: 1024 * 1024 * 64 },
    )
    const pcmBytes = (await readFile(pcmPath)).length
    const durationMs = Math.round(
      (pcmBytes / (PCM_SAMPLE_RATE * PCM_CHANNELS * PCM_BYTES_PER_SAMPLE)) * 1000,
    )

    // Sample-accurate trim (Safari primed-recording dead head) applies here,
    // on the now-correct PCM timeline, instead of on the original file's
    // broken timestamps.
    const trimArgs = trimStartSec > 0.05 ? ['-ss', trimStartSec.toFixed(3)] : []

    await execFileAsync(
      ffmpegPath,
      ['-y', '-f', 's16le', '-ar', String(PCM_SAMPLE_RATE), '-ac', String(PCM_CHANNELS), '-i', pcmPath,
        ...trimArgs, '-c:a', 'libopus', '-b:a', '64k', outPath],
      { maxBuffer: 1024 * 1024 * 64 },
    )

    return trimArgs.length > 0 ? Math.max(0, durationMs - Math.round(trimStartSec * 1000)) : durationMs
  } finally {
    await rm(pcmPath, { force: true }).catch(() => {})
  }
}

/* -------------------------------------------------------------------------- */
/* mergeSessionAudio — time-aligned mono mix of both mic tracks (best-effort) */
/* -------------------------------------------------------------------------- */

/**
 * Download both mic recordings, delay each by its startOffsetMs so the two
 * voices line up exactly like the real conversation (the same offsets the
 * transcript merge uses), mix into one mono Opus/WebM, upload to Storage, and
 * return a token-based download URL. Returns null if anything is missing.
 *
 * ffmpeg recipe (proven on real sessions):
 *   [0:a]aresample=async=1,adelay=Cms:all=1[a];
 *   [1:a]aresample=async=1,adelay=Ims:all=1[b];
 *   [a][b]amix=inputs=2:normalize=0:dropout_transition=0[mix];
 *   [mix]alimiter=limit=0.95[out]
 *
 * This is best-effort: callers must wrap it so a failure never blocks the
 * transcript merge.
 */
async function mergeSessionAudio(
  sessionId: string,
  candidate: { audioUrl?: string; startOffsetMs?: number } | null,
  interviewer: { audioUrl?: string; startOffsetMs?: number } | null,
): Promise<{ url: string; durationMs: number } | null> {
  if (!candidate?.audioUrl || !interviewer?.audioUrl) return null

  // ffmpeg-static exports the absolute path to a bundled ffmpeg binary.
  const ffmpegMod = (await import('ffmpeg-static')) as unknown as { default: string | null }
  const ffmpegPath = ffmpegMod.default
  if (!ffmpegPath) {
    logger.warn('audio_merge_skipped_no_ffmpeg', { sessionId })
    return null
  }

  const cDelay = Math.max(0, Math.round(candidate.startOffsetMs ?? 0))
  const iDelay = Math.max(0, Math.round(interviewer.startOffsetMs ?? 0))

  const workDir = await mkdtemp(join(tmpdir(), `merge-${sessionId}-`))
  const cRawPath = join(workDir, 'candidate-raw.webm')
  const iRawPath = join(workDir, 'interviewer-raw.webm')
  const cPath = join(workDir, 'candidate.webm')
  const iPath = join(workDir, 'interviewer.webm')
  const outPath = join(workDir, 'merged.webm')

  try {
    const [cRes, iRes] = await Promise.all([fetch(candidate.audioUrl), fetch(interviewer.audioUrl)])
    if (!cRes.ok || !iRes.ok) {
      logger.warn('audio_merge_download_failed', {
        sessionId,
        candidateStatus: cRes.status,
        interviewerStatus: iRes.status,
      })
      return null
    }
    await Promise.all([
      writeFile(cRawPath, Buffer.from(await cRes.arrayBuffer())),
      writeFile(iRawPath, Buffer.from(await iRes.arrayBuffer())),
    ])

    // Pre-normalize each side individually before mixing -- either track may
    // independently have gone through a mic-drop/resume cycle (see
    // normalizeAudioTimestamps' doc comment), and amix below has no way to
    // correct a broken input's timestamps itself.
    const [cDurationMs, iDurationMs] = await Promise.all([
      normalizeAudioTimestamps(ffmpegPath, cRawPath, cPath),
      normalizeAudioTimestamps(ffmpegPath, iRawPath, iPath),
    ])

    const filter =
      `[0:a]aresample=async=1,adelay=${cDelay}:all=1[a];` +
      `[1:a]aresample=async=1,adelay=${iDelay}:all=1[b];` +
      `[a][b]amix=inputs=2:normalize=0:dropout_transition=0[mix];` +
      `[mix]alimiter=limit=0.95[out]`

    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-i', cPath,
        '-i', iPath,
        '-filter_complex', filter,
        '-map', '[out]',
        '-ac', '1',
        '-c:a', 'libopus',
        '-b:a', '64k',
        outPath,
      ],
      { maxBuffer: 1024 * 1024 * 64 },
    )

    const merged = await readFile(outPath)

    // Upload to a server-controlled path and mint a Firebase download token so
    // the URL works in the existing <audio> player exactly like per-track URLs.
    const bucket = getStorage().bucket()
    const objectPath = `merged-audio/${sessionId}/merged.webm`
    const token = randomUUID()
    const file = bucket.file(objectPath)
    await file.save(merged, {
      resumable: false,
      contentType: 'audio/webm',
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    })

    const mergedAudioUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(objectPath)}?alt=media&token=${token}`

    const durationMs = Math.max(cDelay + cDurationMs, iDelay + iDurationMs)
    logger.info('audio_merge_completed', { sessionId, cDelay, iDelay, bytes: merged.length, durationMs })
    return { url: mergedAudioUrl, durationMs }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

/* transcodeSessionAudio — single-track re-encode for same-device sessions   */
/* -------------------------------------------------------------------------- */

/**
 * Re-encodes a single candidate track through ffmpeg (Opus/WebM) so it plays
 * on Safari. Same pipeline as mergeSessionAudio but with one input and no mix
 * step. Best-effort: callers must wrap it so a failure never blocks anything.
 *
 * Also runs the recording through normalizeAudioTimestamps -- a track that
 * went through a mic-drop/resume cycle client-side (see workspace/page.tsx's
 * mic-recovery fix, which deliberately keeps appending to one growing blob
 * across the drop) is exactly the kind of multi-segment concatenation that
 * produces a container with a misleadingly short duration. Returns the
 * corrected duration in ms alongside the URL so the caller can store the
 * true length instead of trusting the (broken) container metadata again.
 */
async function transcodeSessionAudio(
  sessionId: string,
  audioUrl: string,
  trimStartSec = 0,
): Promise<{ url: string; durationMs: number } | null> {
  const ffmpegMod = (await import('ffmpeg-static')) as unknown as { default: string | null }
  const ffmpegPath = ffmpegMod.default
  if (!ffmpegPath) {
    logger.warn('audio_transcode_skipped_no_ffmpeg', { sessionId })
    return null
  }

  const workDir = await mkdtemp(join(tmpdir(), `transcode-${sessionId}-`))
  const inPath = join(workDir, 'candidate.webm')
  const outPath = join(workDir, 'merged.webm')

  try {
    const res = await fetch(audioUrl)
    if (!res.ok) {
      logger.warn('audio_transcode_download_failed', { sessionId, status: res.status })
      return null
    }
    await writeFile(inPath, Buffer.from(await res.arrayBuffer()))

    const durationMs = await normalizeAudioTimestamps(ffmpegPath, inPath, outPath, trimStartSec)

    const transcoded = await readFile(outPath)

    const bucket = getStorage().bucket()
    const objectPath = `merged-audio/${sessionId}/merged.webm`
    const token = randomUUID()
    const file = bucket.file(objectPath)
    await file.save(transcoded, {
      resumable: false,
      contentType: 'audio/webm',
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    })

    const mergedAudioUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(objectPath)}?alt=media&token=${token}`

    logger.info('audio_transcode_completed', { sessionId, bytes: transcoded.length, durationMs })
    return { url: mergedAudioUrl, durationMs }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
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
 * Idempotency: only 'processing' blocks re-entry (never interrupt an
 * in-flight merge). 'completed' does NOT block re-entry — a reload/close
 * mid-recording can re-open a track's transcriptStatus (see the route.ts
 * finalProtected guard) once genuinely different audio lands, and when that
 * happens the resulting fresh per-track transcript needs to be able to
 * re-merge and overwrite the stale mergedTranscript, not be silently skipped
 * because a merge already completed once before the reload.
 * 'partial' does NOT block re-entry so a late interviewer track can upgrade it.
 */
async function evaluateAndMerge(sessionId: string): Promise<void> {
  const sessionRef = db.collection('sessions').doc(sessionId)

  const sessionSnap = await sessionRef.get()
if (!sessionSnap.exists) return
const sessionData = sessionSnap.data() ?? {}

// Defense-in-depth: same-device (local) sessions must never run through the
// dual-mic merge pipeline. With the client role-omission fix in place a
// correctly-tagged local session never reaches this function, but a stray
// local-tagged subcollection doc (old data / unaudited path) still could —
// skip it instead of writing bogus single_side / candidate_never_recorded output.
if (sessionData.sessionMode === 'local') {
  logger.warn('evaluate_and_merge_skipped_local_mode', { sessionId })
  return
}
  const existingMergeStatus = sessionData.mergedTranscriptStatus as string | undefined
  if (existingMergeStatus === 'processing') return

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

  // Candidate closed their workspace before any recording ever started (waiting
  // lobby, or mid-"replace") — set by /api/evaluations once it confirms no
  // recordings/candidate doc exists at submit time. Symmetric to
  // interviewerDeclined: a known absence, not something to keep waiting for.
  const candidateNeverRecorded = sessionData.candidateNeverRecorded === true
  // Candidate side already known to have nothing more coming — either it
  // never recorded at all, or the session has already ended (nobody is
  // actively recording anymore, so there's no risk of cutting off a live
  // conversation by treating the interviewer's missing track as known-absent
  // below).
  const candidateKnownAbsentOrEnded =
    candidateNeverRecorded || sessionData.status === 'completed' || sessionData.status === 'abandoned'

  const interviewerKnown =
    terminal(interviewerStatus as string | undefined) ||
    interviewerDeclined ||
    (!interviewerSnap.exists && interviewerDeclined) ||
    // Interviewer never had a track at all (never attempted, and never
    // explicitly declined either — interviewerAudioCaptured was simply never
    // set, e.g. because the candidate opted out first and the interviewer's
    // own flow never reached a point that writes that flag). Previously this
    // combination — genuinely no track on EITHER side, with no explicit
    // decline flag — had no bypass at all: candidateNeverRecorded covers the
    // candidate side, but nothing covered the interviewer side when its
    // absence was implicit rather than explicit. Only trusted once the
    // candidate side is ALSO already known-absent, so this never fires while
    // a real, in-progress candidate recording is still live and might just be
    // waiting on the interviewer to start theirs. Confirmed via session
    // ewi4qc: candidateNeverRecorded:true, no interviewer track, no
    // interviewerAudioCaptured flag ever set — evaluateAndMerge returned at
    // the interviewerKnown gate forever, never reaching the "both absent"
    // resolution branch a few lines below.
    (!interviewerSnap.exists && candidateKnownAbsentOrEnded)

  // Anchor the grace-window clock off whichever terminal timestamp the
  // candidate track actually has — transcriptCompletedAt on success,
  // transcriptFailedAt on failure. Previously only read the success field, so
  // a failed candidate transcript never started this clock at all.
  const candidateTerminalAt = (
    candidateData as { transcriptCompletedAt?: { toMillis: () => number }; transcriptFailedAt?: { toMillis: () => number } } | null
  )
  const candidateCompletedAt =
    candidateTerminalAt?.transcriptCompletedAt?.toMillis() ?? candidateTerminalAt?.transcriptFailedAt?.toMillis()

  // Session-level fallback anchor for the grace-window clock, used only when
  // the side that would normally provide it has no completion timestamp at
  // all (no track doc ever existed — e.g. candidateNeverRecorded, or the
  // interviewer never attempted/declined without a track). Previously the
  // grace window could ONLY start from a real track's own completion time,
  // so a session where one side never had a track at all had no way to ever
  // start the clock, even once the OTHER side was stuck forever. selectedAt
  // (set once when the case actually starts) is the natural anchor; createdAt
  // (session/lobby creation) is a further fallback if selectedAt is missing.
  const sessionAnchorAt = (
    (sessionData.selectedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ??
    (sessionData.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.()
  )
  const sessionAlreadyEnded = sessionData.status === 'completed' || sessionData.status === 'abandoned'

  // 'recording' means a periodic flush wrote the doc but no final/beacon ever arrived.
  // Treat it like absent for the grace-window check so a stuck session still merges.
  const interviewerStuckInRecording =
    interviewerSnap.exists &&
    !terminal(interviewerStatus as string | undefined) &&
    interviewerStatus !== 'pending' &&
    interviewerStatus !== 'processing'

  // Symmetric to interviewerStuckInRecording: the candidate's periodic flush
  // wrote a track doc but no final upload / interrupted beacon / promote-hook
  // ever moved it off 'recording'.
  const candidateStuckInRecording =
    candidateSnap.exists &&
    !terminal(candidateStatus as string | undefined) &&
    candidateStatus !== 'pending' &&
    candidateStatus !== 'processing'

  // candidateKnownAbsentOrEnded is declared earlier (needed by interviewerKnown
  // above). Mirror for the interviewer side, used to rescue a stuck CANDIDATE
  // track — previously there was no equivalent rescue at all for this direction.
  const interviewerKnownAbsentOrEnded = interviewerDeclined || sessionAlreadyEnded

  const pastGraceWindow =
    candidateDone &&
    (!interviewerSnap.exists || interviewerStuckInRecording) &&
    candidateCompletedAt !== undefined &&
    Date.now() - candidateCompletedAt > MERGE_GRACE_MS

  // Fallback version of the same check, anchored on session start instead of
  // the candidate's own completion time — only trusted once the candidate
  // side is already known to have nothing coming, so this never shortens or
  // interrupts a genuinely still-in-progress candidate recording.
  const pastGraceWindowFallback =
    candidateKnownAbsentOrEnded &&
    interviewerStuckInRecording &&
    sessionAnchorAt !== undefined &&
    Date.now() - sessionAnchorAt > MERGE_GRACE_MS

  // Symmetric fallback for rescuing a stuck CANDIDATE track when the
  // interviewer side is the one already known-absent/ended.
  const pastGraceWindowFallbackForCandidate =
    interviewerKnownAbsentOrEnded &&
    candidateStuckInRecording &&
    sessionAnchorAt !== undefined &&
    Date.now() - sessionAnchorAt > MERGE_GRACE_MS

  // Bypass the hard gate when we know for certain no candidate audio is
  // coming at all — mirrors how interviewerDeclined already bypasses
  // interviewerKnown for the interviewer side. Also let a stuck candidate
  // track through once the fallback grace window says it's safe to stop
  // waiting — previously this gate returned unconditionally whenever
  // candidateStuckInRecording was true, making the candidate-stuck rescue
  // block below permanently unreachable in every scenario except a side
  // effect of the interviewer's own "End Case & Evaluate" submission.
  if (!candidateDone && !candidateNeverRecorded && !pastGraceWindowFallbackForCandidate) return
  if (!interviewerKnown && !pastGraceWindow && !pastGraceWindowFallback) return

  // Safety net for a stuck candidate track. Fires immediately (no grace
  // window) when reached via the original path — the realistic trigger there
  // is /api/evaluations's own promote-hook already having flipped the status
  // by the time this function runs (fired by the interviewer's "End Case &
  // Evaluate" submit), so there's real audio ready to transcribe with nothing
  // left to wait for. Also reachable via pastGraceWindowFallbackForCandidate
  // above, once the interviewer side is known-absent/ended and 5 minutes have
  // passed since the session started — the fallback for the case that was
  // previously never rescued at all.
  if (candidateStuckInRecording) {
    await recordingsCol.doc('candidate').set(
      { transcriptStatus: 'pending', candidateInterrupted: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    await sessionRef.set(
      { candidateInterrupted: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    return
  }

  // Safety net: if the interviewer track is stuck in 'recording' (beacon never fired),
  // upgrade it to 'pending' and return — transcription will fire, then mergeTranscripts
  // will call evaluateAndMerge again once the track reaches a terminal state.
  if (interviewerStuckInRecording && (pastGraceWindow || pastGraceWindowFallback)) {
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
      // Neither side transcribed — covers both explicit-decline/opt-out
      // combinations (including candidate "continue without recording",
      // which also suppresses the interviewer's own upload by existing
      // client-side design) as well as both sides genuinely failing
      // transcription. Audio side gets the same definite "none" answer here
      // too, since this branch returns before ever reaching the main
      // audio-resolution block below.
      await sessionRef.set(
        {
          mergedTranscriptStatus: 'failed',
          mergedTranscriptError: 'Both recording tracks failed to transcribe.',
          ...(!sessionData.mergedAudioUrl && sessionData.mergedAudioStatus !== 'none'
            ? { mergedAudioStatus: 'none', mergedAudioReason: 'no_audio', mergedAudioCompletedAt: FieldValue.serverTimestamp() }
            : {}),
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

    // When the interviewer track completed successfully, the interviewerInterrupted
    // flag is stale (set by the grace-window sweep before the late upload arrived).
    // Only treat as partial when a track is actually missing.
    const isPartial = !candidateCompleted || !hasInterviewerTrack
    const finalMerged =
      interviewerInterrupted && !hasInterviewerTrack && merged
        ? '[Note: the interviewer left mid-session; their audio is partial up to the point they disconnected.]\n\n' + merged
        : merged

    const mergedTranscriptReason =
      interviewerInterrupted && !hasInterviewerTrack
        ? 'interviewer_interrupted'
        : sessionData.candidateInterrupted === true && candidateCompleted
          ? 'candidate_interrupted'
          : candidateNeverRecorded && !candidateSnap.exists
            ? 'candidate_never_recorded'
            // Candidate's track genuinely existed and uploaded something, but
            // transcription rejected it (too short/silent) — distinct from
            // candidate_never_recorded (no track at all). Previously fell
            // through to null, which the frontend's fallback copy wrongly
            // read as "your audio was captured" — the opposite of what
            // actually happened.
            : candidateSnap.exists && candidateStatus === 'failed' && !candidateCompleted
              ? 'candidate_transcription_failed'
              : null

    await sessionRef.set(
      {
        mergedTranscript: finalMerged,
        mergedTranscriptStatus: isPartial ? 'partial' : 'completed',
        mergedTranscriptCompletedAt: FieldValue.serverTimestamp(),
        mergedTranscriptError: null,
        mergedTranscriptReason,
        // Clear stale interruption flags once each side's track actually arrived.
        ...(hasInterviewerTrack ? { interviewerInterrupted: FieldValue.delete() } : {}),
        ...(candidateCompleted ? { candidateInterrupted: FieldValue.delete() } : {}),
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

    // Give the audio side the same kind of definite, terminal answer the
    // transcript already has above (completed/partial/failed), instead of
    // silently doing nothing when one or both sides lack usable audio. A
    // track counts as "usable" only if it actually has an audioUrl AND its
    // own transcript didn't fail — a phantom/too-short recording (upload
    // succeeded, but rejected as too short/silent to transcribe) is treated
    // as absent for audio purposes too, matching how it's already treated as
    // absent for transcript purposes.
    const candidateAudioUsable = Boolean(candidateData?.audioUrl) && candidateStatus !== 'failed'
    const interviewerAudioUsable = Boolean(interviewerData?.audioUrl) && interviewerStatus !== 'failed'

    // Re-runs (overwriting a previous mergedAudioUrl) when the source audio has
    // genuinely changed since the last successful merge — same "last write
    // wins" principle as route.ts's finalProtected guard: a reload/close
    // mid-recording can re-open a track and produce a longer/different
    // recording, and the merged audio should catch up to it rather than stay
    // frozen on the pre-reload pairing. mergedAudioSourceSizes snapshots the
    // byteSize of each source track at the moment of the last successful merge.
    const mergedAudioSourceSizes = sessionData.mergedAudioSourceSizes as
      | { candidate?: number; interviewer?: number }
      | undefined
    const audioSourcesUnchanged =
      !!sessionData.mergedAudioUrl &&
      mergedAudioSourceSizes?.candidate === candidateData?.byteSize &&
      mergedAudioSourceSizes?.interviewer === interviewerData?.byteSize

    if (MERGE_AUDIO_ENABLED && candidateAudioUsable && interviewerAudioUsable && !audioSourcesUnchanged) {
      // Best-effort time-aligned audio merge. Wrapped in its own try/catch so
      // any failure (ffmpeg, download, upload) is logged and NEVER affects
      // the transcript merge above. Retries a couple of times first, since
      // most failures here are transient (slow download, brief ffmpeg
      // hiccup) — only after those are exhausted does this give up and write
      // a real terminal 'failed' status, instead of leaving the dashboard's
      // "Stitching your audio together" spinner running forever with no way
      // to tell it had actually already given up.
      const MERGE_AUDIO_RETRY_ATTEMPTS = 3
      let mergedAudioResult: { url: string; durationMs: number } | null = null
      let lastAudioErr: unknown = null
      for (let attempt = 1; attempt <= MERGE_AUDIO_RETRY_ATTEMPTS; attempt++) {
        try {
          mergedAudioResult = await mergeSessionAudio(
            sessionId,
            { audioUrl: candidateData!.audioUrl, startOffsetMs: candidateData?.startOffsetMs },
            { audioUrl: interviewerData!.audioUrl, startOffsetMs: interviewerData?.startOffsetMs },
          )
          lastAudioErr = null
          break
        } catch (audioErr) {
          lastAudioErr = audioErr
          const m = audioErr instanceof Error ? audioErr.message : 'Unknown audio merge error.'
          logger.warn('audio_merge_failed', { sessionId, attempt, message: m })
          if (attempt < MERGE_AUDIO_RETRY_ATTEMPTS) await sleep(1000 * attempt)
        }
      }
      if (lastAudioErr) {
        const m = lastAudioErr instanceof Error ? lastAudioErr.message : 'Unknown audio merge error.'
        await sessionRef.set(
          {
            mergedAudioStatus: 'failed',
            mergedAudioReason: 'merge_failed',
            mergedAudioError: m,
            mergedAudioCompletedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      } else if (mergedAudioResult) {
        await sessionRef.set(
          {
            mergedAudioUrl: mergedAudioResult.url,
            mergedAudioDurationMs: mergedAudioResult.durationMs,
            mergedAudioCompletedAt: FieldValue.serverTimestamp(),
            mergedAudioStatus: 'completed',
            mergedAudioReason: null,
            mergedAudioSourceSizes: {
              candidate: candidateData?.byteSize ?? null,
              interviewer: interviewerData?.byteSize ?? null,
            },
          },
          { merge: true },
        )
      }
    } else if (candidateAudioUsable !== interviewerAudioUsable) {
      // Exactly one side has usable audio. mergedAudioUrl points directly at
      // that side's own track URL (no ffmpeg step needed) — but that URL
      // embeds a Firebase Storage download TOKEN that is invalidated the
      // moment the underlying file at that same stable path is uploaded
      // again (e.g. the interviewer's own final upload landing right after
      // this function already ran once using an earlier periodic-flush
      // token). Re-write whenever the usable side's byteSize has changed
      // since the last time this branch wrote mergedAudioUrl, using the same
      // mergedAudioSourceSizes snapshot the full-merge branch already uses —
      // this is what makes the URL/token "last write wins" here too, instead
      // of freezing on a token that may already be dead by the time anyone
      // clicks play. Confirmed via session 41te8g: merge ran early against
      // the interviewer's periodic-flush token, the interviewer's own final
      // upload landed a second later with a fresh token, and mergedAudioUrl
      // was never refreshed — "permission denied" on click.
      const singleSideSourceUnchanged =
        !!sessionData.mergedAudioUrl &&
        sessionData.mergedAudioStatus === 'single_side' &&
        mergedAudioSourceSizes?.candidate === candidateData?.byteSize &&
        mergedAudioSourceSizes?.interviewer === interviewerData?.byteSize

      if (!singleSideSourceUnchanged) {
        if (candidateAudioUsable) {
          const reason = interviewerDeclined ? 'interviewer_declined' : 'interviewer_no_audio'
          await sessionRef.set(
            {
              mergedAudioUrl: candidateData!.audioUrl,
              // The raw track's own durationMs (wall-clock, set client-side)
              // is used as-is here rather than reading it back from the file
              // itself -- no ffmpeg step runs in this branch, so a track that
              // went through a mic-drop/resume cycle would otherwise show the
              // same misleading short container duration described in
              // normalizeAudioTimestamps' doc comment.
              mergedAudioDurationMs: candidateData?.durationMs ?? null,
              mergedAudioStatus: 'single_side',
              mergedAudioReason: reason,
              mergedAudioCompletedAt: FieldValue.serverTimestamp(),
              mergedAudioSourceSizes: {
                candidate: candidateData?.byteSize ?? null,
                interviewer: interviewerData?.byteSize ?? null,
              },
            },
            { merge: true },
          )
        } else {
          await sessionRef.set(
            {
              mergedAudioUrl: interviewerData!.audioUrl,
              mergedAudioDurationMs: interviewerData?.durationMs ?? null,
              mergedAudioStatus: 'single_side',
              mergedAudioReason: 'candidate_no_audio',
              mergedAudioCompletedAt: FieldValue.serverTimestamp(),
              mergedAudioSourceSizes: {
                candidate: candidateData?.byteSize ?? null,
                interviewer: interviewerData?.byteSize ?? null,
              },
            },
            { merge: true },
          )
        }
      }
    } else if (!candidateAudioUsable && !interviewerAudioUsable && sessionData.mergedAudioStatus !== 'none') {
      // Neither side has usable audio — this is a genuine, final answer, not
      // a "still waiting" state. Write it definitively so the dashboard can
      // stop showing "generating" forever. Also covers MERGE_AUDIO_ENABLED=false,
      // which previously had this identical "never resolves" symptom for
      // every remote session, not just these ones.
      await sessionRef.set(
        {
          mergedAudioStatus: 'none',
          mergedAudioReason: 'no_audio',
          mergedAudioCompletedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }
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
    secrets: [GEMINI_API_KEY, ELEVENLABS_SPLITSCREEN_API_KEY],
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

    // Mirror of the above for the candidate side: when candidateNeverRecorded
    // flips to true (written by /api/evaluations once it confirms no
    // recordings/candidate doc exists — e.g. candidate clicked "continue
    // without recording"), re-evaluate the merge. Without this, a session
    // where neither side ever wrote a recordings/{role} doc at all (so
    // mergeTranscripts never fires) and interviewerAudioCaptured was never
    // explicitly set to false either (so the check above never fires) had NO
    // trigger that ever called evaluateAndMerge — not even the 5-minute sweep,
    // since that queries candidateTranscriptStatus, which is also never
    // written when no candidate track exists. Confirmed via sessions nm7p7so
    // and iq74s: both stuck forever on "generating" with mergedAudioStatus
    // never written, because evaluateAndMerge itself was never invoked.
    const beforeNeverRecorded = beforeData?.candidateNeverRecorded
    const afterNeverRecorded = afterData?.candidateNeverRecorded
    if (beforeNeverRecorded !== afterNeverRecorded && afterNeverRecorded === true) {
      await evaluateAndMerge(event.params.sessionId)
    }

    // Original path: local/old-session transcription triggered by pending status.
    const beforeStatus = beforeData?.recording?.transcriptStatus
    const afterStatus = afterData?.recording?.transcriptStatus

    if (afterStatus !== 'pending') return
    if (beforeStatus === 'pending') return
    if (beforeStatus === 'processing') return

    const recording = afterData?.recording as
      | { audioUrl?: string; mimeType?: string; storagePath?: string; trimStartMs?: number }
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

    const sessionId = event.params.sessionId
    const sessionRef = db.collection('sessions').doc(sessionId)
    await runTranscription({
      target: { kind: 'embedded', sessionRef },
      sessionId,
      audioUrl,
      requestedMimeType: recording.mimeType ?? '',
      storagePath,
      apiKey: GEMINI_API_KEY.value(),
      // ElevenLabs split-screen key — used when SPLITSCREEN_TRANSCRIBE_PROVIDER === 'elevenlabs'.
      elevenApiKey: ELEVENLABS_SPLITSCREEN_API_KEY.value(),
    })

    // Re-encode the candidate track through ffmpeg so it plays on Safari.
    // Same pipeline as remote mergeSessionAudio but single-input (no mix step).
    // Best-effort: never blocks the transcript result.
    if (MERGE_AUDIO_ENABLED) {
      const freshSnap = await sessionRef.get()
      if (!freshSnap.data()?.mergedAudioUrl) {
        try {
          const trimStartSec = (recording?.trimStartMs ?? 0) / 1000
          const result = await transcodeSessionAudio(sessionId, audioUrl, trimStartSec)
          if (result) {
            await sessionRef.set(
              {
                mergedAudioUrl: result.url,
                mergedAudioDurationMs: result.durationMs,
                mergedAudioCompletedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            )
          }
        } catch (audioErr) {
          const m = audioErr instanceof Error ? audioErr.message : 'Unknown transcode error.'
          logger.warn('audio_transcode_failed', { sessionId, message: m })
        }
      }
    }
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

    // processingStuckRescue is set only by finalizePendingMerges' stuck-in-
    // 'processing' sweep, once it has confirmed (via transcriptRequestedAt
    // being far older than this function's own 540s ceiling) that whatever
    // worker was previously running has certainly already died. This is the
    // one deliberate, narrow bypass of the processing re-entry guard below —
    // every other 'processing' -> anything write still correctly blocks
    // re-entry against a genuinely still-running worker.
    const isStuckRescue = afterData?.processingStuckRescue === true

    if (afterStatus !== 'pending') return
    if (beforeStatus === 'pending') return
    if (beforeStatus === 'processing' && !isStuckRescue) return

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
    // Raised from 120s/256MiB: evaluateAndMerge now runs a best-effort ffmpeg
    // audio merge that downloads both webm tracks and re-encodes to opus.
    timeoutSeconds: 300,
    memory: '1GiB',
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
 * Runs every 5 minutes to catch sessions where the interviewer never recorded
 * and never explicitly declined — meaning no realtime trigger would ever re-fire
 * the merge after the grace window elapses.
 *
 * Relies on `candidateTranscriptStatus` / `candidateTranscriptCompletedAt` being
 * denormalized onto the session doc when the candidate track terminates, either
 * successfully (writeSuccess) or with a failure (writeFailure) — previously this
 * only happened on success, so a session where the candidate's own transcript
 * failed (audio too short, upload failed, etc.) would never be picked up by this
 * sweep at all, regardless of how long it had been stuck. Sessions where the
 * interviewer's decline signal already arrived are handled immediately by 1b
 * (transcribeRecording), so this sweep is a safety net for the silent no-show case.
 */
export const finalizePendingMerges = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-central1',
    // Raised from 120s/256MiB: this sweep calls evaluateAndMerge, which now runs
    // a best-effort ffmpeg audio merge (download + opus re-encode) per session.
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async () => {
    const snapshot = await db
      .collection('sessions')
      .where('candidateTranscriptStatus', 'in', ['completed', 'failed'])
      .get()

    if (snapshot.empty) {
      logger.info('finalize_pending: no terminal candidate-transcript sessions')
      return
    }

    let evaluated = 0
    for (const sessionDoc of snapshot.docs) {
      const data = sessionDoc.data()
// Same-device (local) sessions resolve synchronously via the embedded
// transcribeRecording pipeline and never populate candidateTranscriptStatus,
// so they should never reach this sweep — skip defensively for stray data.
if (data.sessionMode === 'local') continue
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

    // ------------------------------------------------------------------
    // Stuck-in-'processing' rescue (remote/dual-mic tracks only).
    //
    // transcribeParticipantRecording writes transcriptStatus:'processing'
    // before calling the transcription API, then unconditionally refuses to
    // re-enter (`if (beforeStatus === 'processing') return`) — the correct
    // guard against double-processing a track that's genuinely still being
    // worked on. But if that function instance is killed mid-call (its hard
    // 540s/9min Cloud Functions Gen2 ceiling for event-triggered functions,
    // or a crash/cold-start issue), the 'processing' status is left behind
    // with nobody ever coming back to it — the guard above then blocks any
    // future attempt forever, and since evaluateAndMerge waits for both
    // sides to reach a terminal state, the whole session's merge is stuck
    // too. This only affects the recordings subcollection (remote/dual-mic
    // mode) — same-device mode's embedded session.recording path is
    // untouched here, matching how the rest of this pipeline already treats
    // the two modes separately.
    //
    // A track is considered dead-stuck once transcriptRequestedAt is older
    // than PROCESSING_STUCK_MS — comfortably past the 540s function ceiling
    // plus room for upload/network time, so this never resets a track a
    // worker is still genuinely, actively transcribing. Resetting back to
    // 'pending' re-fires the same trigger a normal upload would, giving it a
    // fresh attempt. Capped at PROCESSING_RETRY_LIMIT attempts so a track
    // that fails the same way every time (e.g. audio too long for one
    // 9-minute shift to ever transcribe) settles into a real 'failed'
    // terminal state instead of being reset every 5 minutes forever.
    const PROCESSING_STUCK_MS = 12 * 60 * 1000 // 12 minutes — past the 9-min function ceiling with buffer
    const PROCESSING_RETRY_LIMIT = 3

    const stuckSnapshot = await db
      .collectionGroup('recordings')
      .where('transcriptStatus', '==', 'processing')
      .get()

    let rescued = 0
    for (const trackDoc of stuckSnapshot.docs) {
      const trackData = trackDoc.data()
      const requestedAtMs = (
        trackData.transcriptRequestedAt as { toMillis?: () => number } | undefined
      )?.toMillis?.()
      if (requestedAtMs === undefined || Date.now() - requestedAtMs <= PROCESSING_STUCK_MS) continue

      const priorAttempts = (trackData.processingStuckRetryCount as number | undefined) ?? 0
      const sessionId = trackDoc.ref.parent.parent?.id
      if (!sessionId) continue

      if (priorAttempts >= PROCESSING_RETRY_LIMIT) {
        await trackDoc.ref.set(
          {
            transcriptStatus: 'failed',
            transcriptError: 'Transcription worker never returned after repeated retries.',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        logger.warn('processing_stuck_gave_up', { sessionId, role: trackDoc.id, priorAttempts })
        await evaluateAndMerge(sessionId)
        continue
      }

      await trackDoc.ref.set(
        {
          transcriptStatus: 'pending',
          processingStuckRescue: true,
          processingStuckRetryCount: priorAttempts + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      rescued++
      logger.info('processing_stuck_rescued', { sessionId, role: trackDoc.id, attempt: priorAttempts + 1 })
    }

    if (rescued > 0 || stuckSnapshot.size > 0) {
      logger.info(`finalize_pending: rescued ${rescued} stuck-processing track(s) of ${stuckSnapshot.size} checked`)
    }
  },
)

export type _TimestampShape = Timestamp

/* -------------------------------------------------------------------------- */
/* Account emails — onboarding + verification (templates live in emails.ts)   */
/* -------------------------------------------------------------------------- */

// Best-effort first name for an account: Auth displayName, else the fullName
// on the profile doc (the signup client writes it right after account
// creation, so on the onCreate path it may not have landed yet — one short
// retry covers the common race).
async function resolveFirstName(uid: string, displayName: string | null | undefined): Promise<string> {
  if (displayName && displayName.trim()) return firstNameFrom(displayName)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const snap = await db.collection('profiles').doc(uid).get()
      const fullName = snap.exists ? (snap.data()?.fullName as string | undefined) : undefined
      if (typeof fullName === 'string' && fullName.trim()) return firstNameFrom(fullName)
    } catch {
      /* ignore — fall through to the default */
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return firstNameFrom(null)
}

const ONBOARDING_SUBJECT = 'Your first case is 3 minutes away 🚀'
const VERIFICATION_SUBJECT = 'Verify your email for Case CompendiumX'

// Claims the one-time onboarding-email slot for a uid. Returns true only for
// the first caller; every later call returns false, so the onboarding email is
// sent exactly once across the onCreate (Google) and post-verification
// (email/password) paths.
async function claimOnboardingSend(uid: string): Promise<boolean> {
  const flagRef = db.collection('mailFlags').doc(uid)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(flagRef)
    if (snap.exists && snap.data()?.onboardingSent === true) return false
    tx.set(flagRef, { onboardingSent: true, onboardingSentAt: FieldValue.serverTimestamp() }, { merge: true })
    return true
  })
}

async function releaseOnboardingClaim(uid: string): Promise<void> {
  try {
    await db.collection('mailFlags').doc(uid).set(
      { onboardingSent: false, onboardingSentAt: FieldValue.delete() },
      { merge: true },
    )
  } catch {
    /* best-effort rollback */
  }
}

/**
 * sendWelcomeEmail — auth onCreate.
 *   - Google / pre-verified accounts  -> onboarding email immediately.
 *   - Email + password accounts       -> verification email; the onboarding
 *     email follows only after they verify (sendOnboardingEmail callable).
 */
export const sendWelcomeEmail = functionsV1
  .runWith({ secrets: ['GMAIL_SA_KEY'], timeoutSeconds: 60, memory: '256MB' })
  .auth.user()
  .onCreate(async (user) => {
    if (!user.email) return
    if (!process.env.GMAIL_SA_KEY) {
      console.error('[sendWelcomeEmail] GMAIL_SA_KEY secret missing')
      return
    }

    try {
      const firstName = await resolveFirstName(user.uid, user.displayName)

      if (user.emailVerified) {
        // Google (or otherwise already-verified) -> onboarding now, once.
        const claimed = await claimOnboardingSend(user.uid)
        if (!claimed) return
        try {
          await sendGmail({ to: user.email, subject: ONBOARDING_SUBJECT, html: buildOnboardingEmailHtml(firstName) })
          console.log('[sendWelcomeEmail] onboarding sent to', user.email)
        } catch (err) {
          await releaseOnboardingClaim(user.uid)
          throw err
        }
        return
      }

      // Email + password -> verification only. Onboarding is sent post-verify.
      const verificationLink = await getAuth()
        .generateEmailVerificationLink(user.email)
        .catch((e) => {
          console.error('[sendWelcomeEmail] generateEmailVerificationLink failed:', String(e))
          return null
        })
      if (!verificationLink) return
      await sendGmail({ to: user.email, subject: VERIFICATION_SUBJECT, html: buildVerificationEmailHtml(firstName, verificationLink) })
      console.log('[sendWelcomeEmail] verification sent to', user.email)
    } catch (err) {
      console.error('[sendWelcomeEmail] FAILED uid=' + user.uid, err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '')
    }
  })

/**
 * sendVerificationEmail — callable. Sends (or resends) the custom verification
 * email to the signed-in caller. No-ops if the account is already verified.
 */
export const sendVerificationEmail = functionsV1
  .runWith({ secrets: ['GMAIL_SA_KEY'], timeoutSeconds: 60, memory: '256MB' })
  .https.onCall(async (_data, context) => {
    const uid = context.auth?.uid
    if (!uid) throw new functionsV1.https.HttpsError('unauthenticated', 'Sign in to continue.')

    const user = await getAuth().getUser(uid)
    if (!user.email) throw new functionsV1.https.HttpsError('failed-precondition', 'This account has no email.')
    if (user.emailVerified) return { ok: true, alreadyVerified: true }

    const firstName = await resolveFirstName(uid, user.displayName)
    const verificationLink = await getAuth().generateEmailVerificationLink(user.email)
    await sendGmail({ to: user.email, subject: VERIFICATION_SUBJECT, html: buildVerificationEmailHtml(firstName, verificationLink) })
    return { ok: true }
  })

/**
 * sendOnboardingEmail — callable. Sends the onboarding email once, after an
 * email/password account has verified. Idempotent via the mailFlags claim, so
 * the client can safely call it on every verified sign-in.
 */
export const sendOnboardingEmail = functionsV1
  .runWith({ secrets: ['GMAIL_SA_KEY'], timeoutSeconds: 60, memory: '256MB' })
  .https.onCall(async (_data, context) => {
    const uid = context.auth?.uid
    if (!uid) throw new functionsV1.https.HttpsError('unauthenticated', 'Sign in to continue.')

    const user = await getAuth().getUser(uid)
    if (!user.email) throw new functionsV1.https.HttpsError('failed-precondition', 'This account has no email.')
    if (!user.emailVerified) return { ok: false, reason: 'not-verified' }

    const claimed = await claimOnboardingSend(uid)
    if (!claimed) return { ok: true, alreadySent: true }

    try {
      const firstName = await resolveFirstName(uid, user.displayName)
      await sendGmail({ to: user.email, subject: ONBOARDING_SUBJECT, html: buildOnboardingEmailHtml(firstName) })
    } catch (err) {
      await releaseOnboardingClaim(uid)
      throw err
    }
    return { ok: true }
  })

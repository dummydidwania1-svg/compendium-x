import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonError, jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { transcribeInput } from '@/lib/firebase/inputs'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'
const DEFAULT_TRANSCRIBE_MODEL = 'gemini-2.5-flash-lite'
const MAX_AUDIO_BYTES = 100 * 1024 * 1024
const FILE_READY_ATTEMPTS = 45
const FILE_READY_WAIT_MS = 2000

type GeminiFile = {
  name?: string
  uri?: string
  mimeType?: string
  state?: string
  error?: {
    message?: string
  }
}

type GeminiUsageMetadata = {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}

export const runtime = 'nodejs'
export const maxDuration = 300

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

function isValidStoragePath(storagePath: string, uid: string, sessionId: string): boolean {
  const cleanPath = storagePath.replace(/^\/+|\/+$/g, '')
  return cleanPath.startsWith(`session-recordings/${uid}/${sessionId}/`)
}

function matchesFirebaseDownloadUrl(audioUrl: string, storagePath: string): boolean {
  try {
    const parsedUrl = new URL(audioUrl)
    if (parsedUrl.protocol !== 'https:') return false
    if (!parsedUrl.hostname.includes('firebasestorage')) return false
    const encodedPath = encodeURIComponent(storagePath.replace(/^\/+|\/+$/g, ''))
    return parsedUrl.pathname.includes(`/o/${encodedPath}`)
  } catch {
    return false
  }
}

function parseGeminiFile(payload: unknown): GeminiFile | null {
  if (!payload || typeof payload !== 'object') return null

  if ('file' in payload) {
    const fileWrapper = (payload as { file?: unknown }).file
    if (fileWrapper && typeof fileWrapper === 'object') {
      return fileWrapper as GeminiFile
    }
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
      if (typeof text === 'string' && text.trim().length > 0) {
        chunks.push(text.trim())
      }
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

    if (!response.ok) {
      throw new Error(extractGeminiErrorMessage(payload))
    }

    const file = parseGeminiFile(payload)
    if (!file) {
      throw new Error('Gemini did not return file metadata.')
    }

    const state = String(file.state ?? 'STATE_UNSPECIFIED').toUpperCase()
    if (state === 'ACTIVE' || (state === 'STATE_UNSPECIFIED' && typeof file.uri === 'string')) {
      return file
    }

    if (state === 'FAILED') {
      throw new Error(file.error?.message || 'Gemini failed to process the audio file.')
    }

    await sleep(FILE_READY_WAIT_MS)
  }

  throw new Error('Gemini file processing timed out. Try again with a shorter clip.')
}

async function deleteGeminiFile(fileName: string, apiKey: string): Promise<void> {
  const endpoint = `${GEMINI_API_BASE}/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`
  try {
    await fetch(endpoint, { method: 'DELETE' })
  } catch {
    // Best-effort cleanup only.
  }
}

async function mergeRecording(sessionId: string, fields: Record<string, unknown>): Promise<void> {
  try {
    await adminDb
      .collection('sessions')
      .doc(sessionId)
      .set(
        {
          recording: fields,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
  } catch {
    // Transcript metadata is best-effort — never crash a successful
    // transcription because we couldn't update the session doc.
  }
}

export const POST = authenticatedRoute('/api/transcribe', async (request, caller) => {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL

  if (!apiKey) {
    return jsonError(500, 'gemini_unconfigured', 'Missing GEMINI_API_KEY. Configure it in environment variables.')
  }

  const body = await parseBody(request, transcribeInput)
  const audioUrl = body.audioUrl.trim()
  const sessionId = body.sessionId.trim()
  const storagePath = body.storagePath.trim()
  const requestedMimeType = body.mimeType?.trim() ?? ''

  if (!isValidStoragePath(storagePath, caller.uid, sessionId)) {
    throw new TransitionError(403, 'storage_path_mismatch', 'Storage path does not belong to caller.')
  }

  if (!matchesFirebaseDownloadUrl(audioUrl, storagePath)) {
    throw new TransitionError(400, 'audio_url_mismatch', 'audioUrl does not match provided storagePath.')
  }

  await mergeRecording(sessionId, {
    transcriptStatus: 'processing',
    transcriptRequestedAt: FieldValue.serverTimestamp(),
    transcriptError: null,
  })

  let uploadedFileName = ''

  try {
    const audioResponse = await fetch(audioUrl)
    if (!audioResponse.ok) {
      throw new Error(`Unable to download audio artifact (HTTP ${audioResponse.status}).`)
    }

    const sourceMimeType = normalizeMimeType(requestedMimeType || audioResponse.headers.get('content-type'))
    const audioBytes = await audioResponse.arrayBuffer()
    const byteSize = audioBytes.byteLength

    if (byteSize === 0) {
      throw new Error('Audio artifact is empty.')
    }

    if (byteSize > MAX_AUDIO_BYTES) {
      throw new Error('Audio artifact is too large for direct transcription in this API route.')
    }

    const startUploadResponse = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(byteSize),
        'X-Goog-Upload-Header-Content-Type': sourceMimeType,
      },
      body: JSON.stringify({
        file: {
          display_name: `session-${sessionId}-${Date.now()}`,
        },
      }),
    })

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
    if (!uploadResponse.ok) {
      throw new Error(extractGeminiErrorMessage(uploadPayload))
    }

    const uploadedFile = parseGeminiFile(uploadPayload)
    if (!uploadedFile?.name) {
      throw new Error('Gemini file upload succeeded but file name was missing.')
    }

    uploadedFileName = uploadedFile.name
    const readyFile = await waitForFileReady(uploadedFile.name, apiKey)

    if (!readyFile.uri) {
      throw new Error('Gemini returned a file without URI.')
    }

    // generateContent is the main flaky step in practice — Gemini sometimes
    // 503s or hits a deadline on long audio. Retry up to 3 times with
    // exponential backoff before giving up; transient failures stop reaching
    // the client (and the user no longer needs to hit Retry Transcript).
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
      generationConfig: {
        temperature: 0,
      },
    })

    let generationResponse: Response | null = null
    let generationPayload: unknown = null
    let lastError = ''
    const MAX_ATTEMPTS = 3
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      generationResponse = await fetch(
        `${GEMINI_API_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
      if (!retriable || attempt === MAX_ATTEMPTS) break

      // Exponential backoff: 500ms, 1500ms, 4500ms…
      await sleep(500 * 3 ** (attempt - 1))
    }

    if (!generationResponse) {
      throw new Error(lastError || 'Gemini request failed.')
    }
    if (!generationResponse.ok) {
      throw new Error(extractGeminiErrorMessage(generationPayload))
    }

    const transcript = stripTimestamps(extractTranscriptText(generationPayload))
    if (!transcript) {
      throw new Error('Gemini returned an empty transcript.')
    }

    const usageMetadata = (generationPayload as { usageMetadata?: GeminiUsageMetadata }).usageMetadata
    const finalMimeType = readyFile.mimeType || sourceMimeType

    await mergeRecording(sessionId, {
      transcriptStatus: 'completed',
      transcript,
      transcriptPreview: transcript.slice(0, 1000),
      transcriptCompletedAt: FieldValue.serverTimestamp(),
      transcriptModel: model,
      transcriptUsage: usageMetadata ?? null,
      transcriptMimeType: finalMimeType,
      transcriptByteSize: byteSize,
      transcriptStoragePath: storagePath,
      transcriptError: null,
    })

    return jsonOk({
      transcript,
      model,
      mimeType: finalMimeType,
      byteSize,
      usageMetadata: usageMetadata ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to transcribe audio.'
    await mergeRecording(sessionId, {
      transcriptStatus: 'failed',
      transcriptFailedAt: FieldValue.serverTimestamp(),
      transcriptError: message,
    })
    return jsonError(500, 'transcribe_failed', message)
  } finally {
    if (uploadedFileName) {
      await deleteGeminiFile(uploadedFileName, apiKey)
    }
  }
})

import { NextResponse } from 'next/server'
import { AuthError, verifyRequest } from '@/lib/auth/verifyRequest'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'
const DEFAULT_TRANSCRIBE_MODEL = 'gemini-2.5-flash-lite'
const MAX_AUDIO_BYTES = 100 * 1024 * 1024
const FILE_READY_ATTEMPTS = 45
const FILE_READY_WAIT_MS = 2000

type TranscribeRequestBody = {
  audioUrl?: string
  mimeType?: string
  sessionId?: string
  storagePath?: string
}

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

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing GEMINI_API_KEY. Configure it in environment variables.' },
      { status: 500 }
    )
  }

  let requester
  try {
    requester = await verifyRequest(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized request.' }, { status: err.status })
    }
    throw err
  }

  let body: TranscribeRequestBody
  try {
    body = (await request.json()) as TranscribeRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 })
  }

  const audioUrl = typeof body.audioUrl === 'string' ? body.audioUrl.trim() : ''
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : ''
  const requestedMimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : ''

  if (!audioUrl) {
    return NextResponse.json({ error: 'audioUrl is required.' }, { status: 400 })
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })
  }

  if (!storagePath) {
    return NextResponse.json({ error: 'storagePath is required.' }, { status: 400 })
  }

  if (!isValidStoragePath(storagePath, requester.uid, sessionId)) {
    return NextResponse.json({ error: 'Unauthorized storage path.' }, { status: 403 })
  }

  if (!matchesFirebaseDownloadUrl(audioUrl, storagePath)) {
    return NextResponse.json({ error: 'audioUrl does not match provided storagePath.' }, { status: 400 })
  }

  let uploadedFileName = ''

  try {
    const audioResponse = await fetch(audioUrl)
    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: `Unable to download audio artifact (HTTP ${audioResponse.status}).` },
        { status: 400 }
      )
    }

    const sourceMimeType = normalizeMimeType(requestedMimeType || audioResponse.headers.get('content-type'))
    const audioBytes = await audioResponse.arrayBuffer()
    const byteSize = audioBytes.byteLength

    if (byteSize === 0) {
      return NextResponse.json({ error: 'Audio artifact is empty.' }, { status: 400 })
    }

    if (byteSize > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'Audio artifact is too large for direct transcription in this API route.' },
        { status: 413 }
      )
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

    const generationResponse = await fetch(
      `${GEMINI_API_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
      }
    )

    const generationPayload = await generationResponse.json().catch(() => null)
    if (!generationResponse.ok) {
      throw new Error(extractGeminiErrorMessage(generationPayload))
    }

    const transcript = stripTimestamps(extractTranscriptText(generationPayload))
    if (!transcript) {
      throw new Error('Gemini returned an empty transcript.')
    }

    const usageMetadata = (generationPayload as { usageMetadata?: GeminiUsageMetadata }).usageMetadata

    return NextResponse.json({
      transcript,
      model,
      mimeType: readyFile.mimeType || sourceMimeType,
      byteSize,
      usageMetadata: usageMetadata ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to transcribe audio.',
      },
      { status: 500 }
    )
  } finally {
    if (uploadedFileName) {
      await deleteGeminiFile(uploadedFileName, apiKey)
    }
  }
}

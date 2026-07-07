'use client'

import Link from 'next/link'
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import PlatformLoader from '@/components/PlatformLoader'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage, waitForAuthUser } from '@/lib/firebase/config'
import { mapEvaluationDoc } from '@/lib/dashboard/mappers'
import type { EvaluationRecord } from '@/lib/dashboard/types'
import { apiPost } from '@/lib/api/client'

function scoreLabel(value: number | null) {
  return typeof value === 'number' ? `${value} / 5` : 'N/A'
}

function formatDate(value: EvaluationRecord['createdAt']) {
  if (!value) return 'Unknown date'
  return value.toDate().toLocaleString()
}

function overallScore(record: EvaluationRecord): string {
  const values = [
    record.scores.structure,
    record.scores.understanding,
    record.scores.delivery,
    record.scores.creativity,
  ].filter((value): value is number => typeof value === 'number')

  if (values.length === 0) return 'N/A'
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return `${mean.toFixed(2)} / 5`
}

function safeFileExtension(filename: string): string {
  const normalized = filename.toLowerCase()
  const parts = normalized.split('.')
  const raw = parts.length > 1 ? parts[parts.length - 1] : 'jpg'
  const clean = raw.replace(/[^a-z0-9]/g, '')
  return clean || 'jpg'
}

type SessionRecordingView = {
  status: string | null
  transcriptStatus: string | null
  transcript: string | null
  transcriptPreview: string | null
  transcriptError: string | null
  transcriptModel: string | null
  audioUrl: string | null
  interviewerAudioUrl: string | null
  mergedAudioUrl: string | null
  mergedAudioStatus: string | null
  mergedAudioReason: string | null
  isRemote: boolean
  // True for a Remote (dual-mic) session whose merged audio is still being
  // generated — gates the audio link so no single-mic track is shown meanwhile.
  audioMergePending: boolean
}

// Merge-in-progress states: merged audio is expected but not written yet.
// 'completed' is included because the audio merge CF runs after the transcript
// merge, so there is a brief window (~5-10s) where mergedTranscriptStatus is
// 'completed' but mergedAudioUrl is not yet written.
const AUDIO_MERGE_PENDING_STATUSES = new Set(['none', 'pending', 'processing', 'partial', 'completed'])
// Terminal audio-merge outcomes — once mergedAudioStatus reaches one of these,
// the audio side is definitively resolved and should never show "generating"
// again, regardless of what mergedTranscriptStatus says.
const AUDIO_MERGE_TERMINAL_STATUSES = new Set(['completed', 'single_side', 'none'])

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function mapSessionRecording(value: unknown): SessionRecordingView | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const mergedAudioUrl = asNullableString(source.mergedAudioUrl)
  // sessionMode + mergedTranscriptStatus are folded in from the session-doc
  // root by the caller alongside mergedAudioUrl.
  const rawMode = asNullableString(source.sessionMode) ?? asNullableString(source.mode)
  const isRemote = rawMode
    ? rawMode.toLowerCase().replace(/[_\s-]+/g, '') !== 'samedevice' &&
      rawMode.toLowerCase().replace(/[_\s-]+/g, '') !== 'local'
    : Boolean(mergedAudioUrl)
  const mergedTranscriptStatus = asNullableString(source.mergedTranscriptStatus)
  const mergedAudioStatus = asNullableString(source.mergedAudioStatus)
  return {
    status: asNullableString(source.status),
    transcriptStatus: asNullableString(source.transcriptStatus),
    transcript: asNullableString(source.transcript),
    transcriptPreview: asNullableString(source.transcriptPreview),
    transcriptError: asNullableString(source.transcriptError),
    transcriptModel: asNullableString(source.transcriptModel),
    audioUrl: asNullableString(source.audioUrl),
    // interviewerAudioUrl/mergedAudioStatus/mergedAudioReason live on the
    // session-doc root, folded in by the caller alongside mergedAudioUrl.
    interviewerAudioUrl: asNullableString(source.interviewerAudioUrl),
    // mergedAudioUrl lives on the session-doc root (written by the Cloud
    // Function), not under `recording`, so the caller passes it in explicitly.
    mergedAudioUrl,
    mergedAudioStatus,
    mergedAudioReason: asNullableString(source.mergedAudioReason),
    isRemote,
    audioMergePending:
      isRemote &&
      !mergedAudioUrl &&
      !AUDIO_MERGE_TERMINAL_STATUSES.has((mergedAudioStatus ?? '').toLowerCase()) &&
      AUDIO_MERGE_PENDING_STATUSES.has((mergedTranscriptStatus ?? 'none').toLowerCase()),
  }
}

function stripTranscriptTimestamps(value: string): string {
  return value
    .replace(/\[\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*\]/g, '')
    .replace(/\(\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*\)/g, '')
    .replace(/<\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*>/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

export default function EvaluationDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const evaluationId = params?.id

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [record, setRecord] = useState<EvaluationRecord | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [activeWorkspaceImage, setActiveWorkspaceImage] = useState<string | null>(null)
  const [sessionRecording, setSessionRecording] = useState<SessionRecordingView | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptLoadError, setTranscriptLoadError] = useState('')

  useEffect(() => {
    if (!evaluationId) {
      setLoading(false)
      setError('Missing feedback id.')
      return
    }

    const run = async () => {
      setLoading(true)
      setError('')
      try {
        const user = await waitForAuthUser()
        if (!user) {
          router.replace(`/login?redirect=${encodeURIComponent(`/dashboard/evaluations/${evaluationId}`)}`)
          return
        }
        setCurrentUserId(user.uid)

        const snapshot = await getDoc(doc(db, 'evaluations', evaluationId))
        if (!snapshot.exists()) {
          setRecord(null)
          setError('Feedback entry not found.')
          return
        }

        setRecord(mapEvaluationDoc(snapshot.id, snapshot.data()))
      } catch (fetchError) {
        setRecord(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load feedback entry.')
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [evaluationId, router])

  const title = useMemo(() => record?.caseTitle ?? 'Feedback Detail', [record?.caseTitle])
  const cleanedTranscript = useMemo(() => {
    const rawTranscript = sessionRecording?.transcript || sessionRecording?.transcriptPreview || ''
    return rawTranscript ? stripTranscriptTimestamps(rawTranscript) : ''
  }, [sessionRecording?.transcript, sessionRecording?.transcriptPreview])
  const canUploadWorkspaceImage = useMemo(() => {
    if (!record || !currentUserId) return false
    if (!record.candidateId) return true
    return record.candidateId === currentUserId
  }, [currentUserId, record])

  const handleWorkspaceImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !record || !currentUserId) return

    setUploadError('')
    setUploadSuccess('')

    if (!canUploadWorkspaceImage) {
      setUploadError('You can upload images only for your own case attempts.')
      return
    }

    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file.')
      return
    }

    const maxFileSizeBytes = 10 * 1024 * 1024
    if (file.size > maxFileSizeBytes) {
      setUploadError('Image size must be under 10MB.')
      return
    }

    setUploadingImage(true)
    try {
      const extension = safeFileExtension(file.name)
      const filePath = `workspace-images/${currentUserId}/${record.id}/${Date.now()}.${extension}`
      const fileRef = storageRef(storage, filePath)

      await uploadBytes(fileRef, file, { contentType: file.type })
      const downloadUrl = await getDownloadURL(fileRef)

      await apiPost(`/api/evaluations/${encodeURIComponent(record.id)}/workspace-image`, {
        storagePath: filePath,
        workspaceImageUrl: downloadUrl,
      })

      setRecord((current) => {
        if (!current) return current
        if (current.workspaceImageUrls.includes(downloadUrl)) return current
        return {
          ...current,
          workspaceImageUrls: [...current.workspaceImageUrls, downloadUrl],
        }
      })
      setActiveWorkspaceImage(downloadUrl)
      setUploadSuccess('Workspace image uploaded successfully.')
    } catch (uploadIssue) {
      setUploadError(uploadIssue instanceof Error ? uploadIssue.message : 'Unable to upload workspace image.')
    } finally {
      setUploadingImage(false)
    }
  }

  useEffect(() => {
    if (!record || record.workspaceImageUrls.length === 0) {
      setActiveWorkspaceImage(null)
      return
    }
    if (!activeWorkspaceImage) return
    if (!record.workspaceImageUrls.includes(activeWorkspaceImage)) {
      setActiveWorkspaceImage(record.workspaceImageUrls[0])
    }
  }, [activeWorkspaceImage, record])

  useEffect(() => {
    const lobbyId = record?.lobbyId
    if (!lobbyId) {
      setSessionRecording(null)
      setTranscriptLoadError('')
      setTranscriptLoading(false)
      return
    }

    let cancelled = false

    const loadSessionRecording = async () => {
      setTranscriptLoading(true)
      setTranscriptLoadError('')
      try {
        const snapshot = await getDoc(doc(db, 'sessions', lobbyId))
        if (!snapshot.exists()) {
          if (!cancelled) {
            setSessionRecording(null)
          }
          return
        }

        const sessionData = snapshot.data() ?? {}
        const rawRecording = sessionData.recording
        // Fold the root-level mergedAudioUrl into the recording view so the
        // player can prefer the combined audio over a single mic track.
        const recordingSource =
          rawRecording && typeof rawRecording === 'object'
            ? {
                ...(rawRecording as Record<string, unknown>),
                mergedAudioUrl: sessionData.mergedAudioUrl,
                mergedTranscriptStatus: sessionData.mergedTranscriptStatus,
                mergedAudioStatus: sessionData.mergedAudioStatus,
                mergedAudioReason: sessionData.mergedAudioReason,
                interviewerAudioUrl: sessionData.interviewerAudioUrl,
                sessionMode: sessionData.sessionMode ?? sessionData.mode,
              }
            : rawRecording
        const mapped = mapSessionRecording(recordingSource)
        if (!cancelled) {
          setSessionRecording(mapped)
        }
      } catch (issue) {
        if (!cancelled) {
          setSessionRecording(null)
          setTranscriptLoadError(issue instanceof Error ? issue.message : 'Unable to load transcript data.')
        }
      } finally {
        if (!cancelled) {
          setTranscriptLoading(false)
        }
      }
    }

    void loadSessionRecording()

    return () => {
      cancelled = true
    }
  }, [record?.lobbyId])

  useEffect(() => {
    if (!activeWorkspaceImage) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveWorkspaceImage(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeWorkspaceImage])

  if (loading) return <PlatformLoader message="Loading your feedback" />

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020b17] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(245,158,11,0.16),transparent_40%),radial-gradient(circle_at_84%_18%,rgba(59,130,246,0.2),transparent_36%),linear-gradient(180deg,#020b17_0%,#05162c_52%,#071b2f_100%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#f8fafc_1px,transparent_1px),linear-gradient(to_bottom,#f8fafc_1px,transparent_1px)] [background-size:36px_36px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm text-slate-300 hover:text-white transition">
            ← Back to Dashboard
          </Link>
          {record?.caseId && (
            <Link
              href={`/case/${record.caseId}/interviewer?preview=1`}
              className="rounded-md border border-cyan-400/50 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:border-cyan-300/80 hover:bg-cyan-300/20 transition"
            >
              Open Case
            </Link>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-300/60 bg-red-900/35 p-4 text-sm text-red-200 mb-4">
            {error}
          </div>
        )}

        {record && (
          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/75 shadow-xl backdrop-blur">
            <div className="border-b border-slate-700 px-6 py-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Feedback Detail</p>
              <h1 className="mt-2 text-3xl font-serif text-white">{title}</h1>
              <p className="mt-2 text-sm text-slate-300">Overall Score: {overallScore(record)}</p>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <div className="rounded-xl border border-slate-700 bg-slate-950/55 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Date</p>
                  <p className="mt-2 font-medium text-slate-100">{formatDate(record.createdAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/55 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Type / Industry</p>
                  <p className="mt-2 font-medium text-slate-100">
                    {record.caseType ?? 'General'} / {record.industry ?? 'General'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500 mb-3">Parameter Scores</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <p className="text-sm text-slate-300">
                    Structure: <span className="font-semibold text-slate-100">{scoreLabel(record.scores.structure)}</span>
                  </p>
                  <p className="text-sm text-slate-300">
                    Understanding:{' '}
                    <span className="font-semibold text-slate-100">{scoreLabel(record.scores.understanding)}</span>
                  </p>
                  <p className="text-sm text-slate-300">
                    Delivery: <span className="font-semibold text-slate-100">{scoreLabel(record.scores.delivery)}</span>
                  </p>
                  <p className="text-sm text-slate-300">
                    Creativity: <span className="font-semibold text-slate-100">{scoreLabel(record.scores.creativity)}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500 mb-3">Interviewer Notes</p>
                <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{record.notes}</p>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500 mb-3">AI Transcript</p>

                {!record.lobbyId && (
                  <p className="text-sm text-slate-400">
                    Transcript is available for linked remote sessions only.
                  </p>
                )}

                {record.lobbyId && transcriptLoading && (
                  <p className="text-sm text-slate-300">Loading transcript status...</p>
                )}

                {record.lobbyId && transcriptLoadError && (
                  <p className="rounded-md border border-red-300/60 bg-red-900/30 px-3 py-2 text-xs text-red-200">
                    {transcriptLoadError}
                  </p>
                )}

                {record.lobbyId && !transcriptLoading && !transcriptLoadError && !sessionRecording && (
                  <p className="text-sm text-slate-400">No recording metadata found for this session yet.</p>
                )}

                {record.lobbyId && sessionRecording && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-slate-200">
                        Transcript: {sessionRecording.transcriptStatus ?? 'pending'}
                      </span>
                      {sessionRecording.transcriptModel && (
                        <span className="rounded-full border border-cyan-400/40 bg-cyan-300/10 px-2.5 py-1 text-cyan-100">
                          Model: {sessionRecording.transcriptModel}
                        </span>
                      )}
                      {sessionRecording.mergedAudioUrl ? (
                        <a
                          href={sessionRecording.mergedAudioUrl}
                          className="rounded-full border border-emerald-400/40 bg-emerald-300/10 px-2.5 py-1 text-emerald-100 transition hover:border-emerald-300/80 hover:bg-emerald-300/20"
                        >
                          {sessionRecording.mergedAudioStatus === 'single_side' ? 'Open Session Audio (one side only)' : 'Open Session Audio'}
                        </a>
                      ) : sessionRecording.audioMergePending ? (
                        <span className="rounded-full border border-amber-400/40 bg-amber-300/10 px-2.5 py-1 text-amber-100">
                          Stitching your audio together, check back in 5
                        </span>
                      ) : sessionRecording.audioUrl ? (
                        <a
                          href={sessionRecording.audioUrl}
                          className="rounded-full border border-emerald-400/40 bg-emerald-300/10 px-2.5 py-1 text-emerald-100 transition hover:border-emerald-300/80 hover:bg-emerald-300/20"
                        >
                          Open Session Audio{sessionRecording.isRemote ? ' (candidate only)' : ''}
                        </a>
                      ) : sessionRecording.interviewerAudioUrl ? (
                        <a
                          href={sessionRecording.interviewerAudioUrl}
                          className="rounded-full border border-emerald-400/40 bg-emerald-300/10 px-2.5 py-1 text-emerald-100 transition hover:border-emerald-300/80 hover:bg-emerald-300/20"
                        >
                          Open Session Audio (interviewer only)
                        </a>
                      ) : sessionRecording.mergedAudioStatus === 'none' ? (
                        <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-slate-400">
                          No audio for this session
                        </span>
                      ) : null}
                    </div>

                    {sessionRecording.transcriptError && (
                      <p className="rounded-md border border-red-300/60 bg-red-900/30 px-3 py-2 text-xs text-red-200">
                        {sessionRecording.transcriptError}
                      </p>
                    )}

                    {cleanedTranscript ? (
                      <div className="max-h-80 overflow-auto rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-200">
                          {cleanedTranscript}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">
                        Transcript is not ready yet. Status will update after processing completes.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500 mb-3">Workspace Images</p>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-cyan-400/50 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/80 hover:bg-cyan-300/20">
                    {uploadingImage ? 'Uploading...' : 'Upload Image'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleWorkspaceImageUpload}
                      disabled={!canUploadWorkspaceImage || uploadingImage}
                      className="hidden"
                    />
                  </label>
                  {!canUploadWorkspaceImage && (
                    <p className="text-xs text-amber-200">Only the candidate can upload workspace images for this entry.</p>
                  )}
                </div>

                {uploadError && (
                  <p className="mt-3 rounded-md border border-red-300/60 bg-red-900/30 px-3 py-2 text-xs text-red-200">
                    {uploadError}
                  </p>
                )}
                {uploadSuccess && (
                  <p className="mt-3 rounded-md border border-emerald-300/50 bg-emerald-900/25 px-3 py-2 text-xs text-emerald-200">
                    {uploadSuccess}
                  </p>
                )}

                {record.workspaceImageUrls.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">No workspace images uploaded yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {record.workspaceImageUrls.map((url, index) => (
                      <button
                        key={`${url}-${index + 1}`}
                        type="button"
                        onClick={() => setActiveWorkspaceImage(url)}
                        className="block rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-cyan-100 transition hover:border-cyan-300/70 hover:text-cyan-50"
                      >
                        Open Workspace Image {index + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {activeWorkspaceImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          onClick={() => setActiveWorkspaceImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Workspace Image</p>
              <div className="flex items-center gap-2">
                <a
                  href={activeWorkspaceImage}
                  download
                  className="rounded-md border border-cyan-400/50 bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/80 hover:bg-cyan-300/20"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setActiveWorkspaceImage(null)}
                  className="h-7 w-7 rounded-md border border-slate-600 text-sm text-slate-200 transition hover:border-slate-400 hover:text-white"
                  aria-label="Close preview"
                >
                  X
                </button>
              </div>
            </div>
            <div className="overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-2">
              <img
                src={activeWorkspaceImage}
                alt="Workspace upload preview"
                className="mx-auto max-h-[70vh] w-auto rounded object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

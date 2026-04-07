'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type User } from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage, waitForAuthUser } from '@/lib/firebase/config'

type SessionState = {
  status?: 'waiting' | 'in_progress' | 'completed'
  caseId?: string
  completedBy?: string
  sessionMode?: RecordingMode
}

type TranscribeResponse = {
  transcript?: string
  model?: string
  mimeType?: string
  byteSize?: number
  usageMetadata?: Record<string, unknown> | null
  error?: string
}

type RecordingMode = 'remote' | 'local'
type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping' | 'uploading' | 'uploaded' | 'failed'
type WorkspaceToast = {
  tone: 'default' | 'success' | 'warn'
  message: string
}
type CaptureControllerLike = {
  setFocusBehavior?: (behavior: string) => void
}
type BrowserPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

const MIME_TYPE_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const candidate of MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return null
}

function fileExtensionFromType(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

function formatTranscriptFailureMessage(message: string): string {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('gemini') ||
    normalized.includes('api key') ||
    normalized.includes('generatecontent') ||
    normalized.includes('missing gemini_api_key')
  ) {
    return 'Audio saved successfully. Transcript insights are coming soon.'
  }

  return 'Audio saved successfully, but transcript review could not finish this time.'
}

function getFriendlyRecoverableCaptureMessage(mode: RecordingMode, message: string): string {
  const normalized = message.toLowerCase()

  if (mode === 'local') {
    if (
      normalized.includes('permission') ||
      normalized.includes('notallowed') ||
      normalized.includes('denied')
    ) {
      return 'Microphone access is blocked. Allow it in the address bar. This page will refresh automatically.'
    }

    return 'Allow microphone access to continue.'
  }

  if (
    normalized.includes('timeout starting video source') ||
    normalized.includes('video source') ||
    normalized.includes('screen') ||
    normalized.includes('window') ||
    normalized.includes('monitor') ||
    normalized.includes('share audio') ||
    normalized.includes('audio source') ||
    normalized.includes('audio was captured') ||
    normalized.includes('display surface') ||
    normalized.includes('meeting tab') ||
    normalized.includes('permission') ||
    normalized.includes('notallowed') ||
    normalized.includes('denied')
  ) {
    return 'Share the meeting tab with Share audio turned on.'
  }

  return 'Share the meeting tab with Share audio turned on.'
}

function CompactPlatformFooter() {
  return (
    <footer style={{ background: '#453a2a' }} className="mt-auto w-full px-6 py-6 md:px-10 md:py-7">
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-5 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center md:gap-10">
          <div>
            <Link href="/" style={{ fontFamily: "'Newsreader', serif" }} className="mb-2 inline-block text-2xl font-semibold tracking-tight transition-opacity hover:opacity-85">
              <span style={{ color: '#d5c4b1' }}>Case Compendium</span>
              <span style={{ color: '#aed0a1' }}>X</span>
            </Link>
            <p
              style={{
                fontFamily: "'Work Sans', sans-serif",
                color: 'rgba(213,196,177,0.5)',
                maxWidth: '280px',
                lineHeight: 1.6,
              }}
              className="text-xs"
            >
              AI-powered case practice and performance analytics for consulting interviews.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-3 md:gap-x-12">
            <Link
              href="/"
              style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
              className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
            >
              Home
            </Link>
            <Link
              href="/about"
              style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
              className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
            >
              About Us
            </Link>
            <Link
              href="/privacy-policy"
              style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
              className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
            >
              Privacy Policy
            </Link>
            <a
              href="mailto:contact@casecompendiumx.in?subject=Compendium%20X%20Privacy%20Request"
              style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
              className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
            >
              Contact Us
            </a>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(213,196,177,0.12)', paddingTop: '12px' }} className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <a href="https://www.linkedin.com/company/casecompendiumx" target="_blank" rel="noreferrer" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="LinkedIn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
            </a>
            <a href="mailto:contact@casecompendiumx.in" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="Email Us">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
            </a>
          </div>
          <p style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.35)', lineHeight: 1.8 }} className="text-[10px] tracking-[0.2em] uppercase">
            &copy; 2026 Case CompendiumX. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lobbyId = searchParams.get('lobby')
  const requestedMode = searchParams.get('mode') === 'local' ? 'local' : 'remote'

  const [resolvedCaseId, setResolvedCaseId] = useState('')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [sessionIssue, setSessionIssue] = useState('')
  const [recordingMode, setRecordingMode] = useState<RecordingMode>(requestedMode)
  const [preferredRecordingMode, setPreferredRecordingMode] = useState<RecordingMode>(requestedMode)
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [recordingError, setRecordingError] = useState('')
  const [, setRecordingNote] = useState('')
  const [captureWarning, setCaptureWarning] = useState('')
  const [endingSession, setEndingSession] = useState(false)
  const [completionPending, setCompletionPending] = useState(false)
  const [workspaceToast, setWorkspaceToast] = useState<WorkspaceToast | null>(null)
  const [remotePrepVisible, setRemotePrepVisible] = useState(false)
  const [remotePrepStep, setRemotePrepStep] = useState(0)
  const [localPrepVisible, setLocalPrepVisible] = useState(false)
  const [localPrepStep, setLocalPrepStep] = useState(0)
  const [microphonePermissionState, setMicrophonePermissionState] = useState<BrowserPermissionState>('unknown')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const displayStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const mixedStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const pendingBlobRef = useRef<Blob | null>(null)
  const recordingStartMsRef = useRef<number | null>(null)
  const stopReasonRef = useRef('session_completed')
  const completionHandledRef = useRef(false)
  const stopInProgressRef = useRef(false)
  const caseIdRef = useRef('')
  const autoStartAttemptedRef = useRef(false)
  const toastTimeoutRef = useRef<number | null>(null)
  const remotePrepTimersRef = useRef<number[]>([])
  const localPrepTimersRef = useRef<number[]>([])
  const previousMicrophonePermissionRef = useRef<BrowserPermissionState | null>(null)
  const microphonePermissionReloadingRef = useRef(false)

  const canStartRecording = useMemo(
    () => recordingState === 'idle' || recordingState === 'failed' || recordingState === 'uploaded',
    [recordingState]
  )
  const resolveSessionMode = useCallback(
    (value?: SessionState['sessionMode']): RecordingMode => (value === 'local' ? 'local' : 'remote'),
    []
  )

  const teardownMedia = useCallback(() => {
    for (const stream of [displayStreamRef.current, micStreamRef.current, mixedStreamRef.current]) {
      if (!stream) continue
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }
    displayStreamRef.current = null
    micStreamRef.current = null
    mixedStreamRef.current = null

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {
        // Ignore context close failures during teardown.
      })
    }
    audioContextRef.current = null
  }, [])

  const clearRemotePrep = useCallback(() => {
    for (const timer of remotePrepTimersRef.current) {
      window.clearTimeout(timer)
    }
    remotePrepTimersRef.current = []
    setRemotePrepVisible(false)
    setRemotePrepStep(0)
  }, [])

  const clearLocalPrep = useCallback(() => {
    for (const timer of localPrepTimersRef.current) {
      window.clearTimeout(timer)
    }
    localPrepTimersRef.current = []
    setLocalPrepVisible(false)
    setLocalPrepStep(0)
  }, [])

  const readMicrophonePermissionState = useCallback(async (): Promise<BrowserPermissionState> => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
      setMicrophonePermissionState('unknown')
      return 'unknown'
    }

    try {
      const status = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      })

      const nextState = status.state as BrowserPermissionState
      setMicrophonePermissionState(nextState)
      return nextState
    } catch {
      setMicrophonePermissionState('unknown')
      return 'unknown'
    }
  }, [])

  const refreshWhenMicrophonePermissionChanges = useCallback(
    async (reloadOnResolved: boolean) => {
      const nextState = await readMicrophonePermissionState()
      const previousState = previousMicrophonePermissionRef.current
      previousMicrophonePermissionRef.current = nextState

      if (
        reloadOnResolved &&
        previousState === 'denied' &&
        nextState !== 'denied' &&
        nextState !== 'unknown' &&
        !microphonePermissionReloadingRef.current
      ) {
        microphonePermissionReloadingRef.current = true
        window.setTimeout(() => {
          window.location.reload()
        }, 120)
      }

      return nextState
    },
    [readMicrophonePermissionState]
  )

  const updateSessionRecording = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!lobbyId) return
      await setDoc(
        doc(db, 'sessions', lobbyId),
        {
          recording: payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    },
    [lobbyId]
  )

  const requestTranscript = useCallback(
    async (payload: { audioUrl: string; mimeType: string; storagePath: string }) => {
      if (!currentUser) {
        throw new Error('Please sign in to process transcript generation.')
      }
      if (!lobbyId) {
        throw new Error('Session ID missing for transcript processing.')
      }

      const idToken = await currentUser.getIdToken()

      await updateSessionRecording({
        transcriptStatus: 'processing',
        transcriptRequestedAt: serverTimestamp(),
        transcriptError: null,
      })

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          audioUrl: payload.audioUrl,
          mimeType: payload.mimeType,
          sessionId: lobbyId,
          storagePath: payload.storagePath,
        }),
      })

      const result = (await response.json().catch(() => null)) as TranscribeResponse | null
      const transcriptText =
        result && typeof result.transcript === 'string' ? result.transcript.trim() : ''

      if (!response.ok || transcriptText.length === 0) {
        const message =
          result && typeof result.error === 'string' && result.error.trim().length > 0
            ? result.error.trim()
            : 'AI transcription did not return text.'
        throw new Error(message)
      }

      await updateSessionRecording({
        transcriptStatus: 'completed',
        transcript: transcriptText,
        transcriptPreview: transcriptText.slice(0, 1000),
        transcriptCompletedAt: serverTimestamp(),
        transcriptModel: typeof result?.model === 'string' ? result.model : null,
        transcriptUsage: result?.usageMetadata ?? null,
        transcriptMimeType: typeof result?.mimeType === 'string' ? result.mimeType : payload.mimeType,
        transcriptByteSize: typeof result?.byteSize === 'number' ? result.byteSize : null,
        transcriptStoragePath: payload.storagePath,
      })
    },
    [currentUser, lobbyId, updateSessionRecording]
  )

  const uploadRecordingBlob = useCallback(
    async (blob: Blob, stopReason: string, routeAfterUpload: boolean) => {
      if (!currentUser || !lobbyId) {
        setRecordingState('failed')
        setRecordingError('Unable to upload because this session is not linked to your account.')
        setCompletionPending(routeAfterUpload)
        return
      }

      setRecordingState('uploading')
      setRecordingError('')

      const mimeType = blob.type || pickSupportedMimeType() || 'audio/webm'
      const extension = fileExtensionFromType(mimeType)
      const storagePath = `session-recordings/${currentUser.uid}/${lobbyId}/${Date.now()}.${extension}`
      const recordingRef = storageRef(storage, storagePath)

      try {
        await uploadBytes(recordingRef, blob, { contentType: mimeType })
        const audioUrl = await getDownloadURL(recordingRef)
        const nowMs = Date.now()

        await updateSessionRecording({
          status: 'uploaded',
          source: 'candidate_workspace',
          mode: recordingMode,
          candidateId: currentUser.uid,
          candidateEmail: currentUser.email ?? null,
          caseId: caseIdRef.current || null,
          startedAtMs: recordingStartMsRef.current,
          stoppedAt: serverTimestamp(),
          stoppedAtMs: nowMs,
          durationMs: recordingStartMsRef.current ? nowMs - recordingStartMsRef.current : null,
          stopReason,
          storagePath,
          audioUrl,
          mimeType,
          byteSize: blob.size,
          transcriptStatus: 'pending',
        })

        setRecordingNote('Audio uploaded. Starting AI transcription...')
        try {
          await requestTranscript({ audioUrl, mimeType, storagePath })
          setRecordingNote('Audio uploaded and transcript generated successfully.')
        } catch (transcriptionError) {
          const transcriptErrorMessage =
            transcriptionError instanceof Error ? transcriptionError.message : 'Unable to transcribe recording.'
          await updateSessionRecording({
            transcriptStatus: 'failed',
            transcriptFailedAt: serverTimestamp(),
            transcriptError: transcriptErrorMessage,
          })
          setRecordingError(formatTranscriptFailureMessage(transcriptErrorMessage))
          setRecordingNote('Audio uploaded, but transcript review could not finish this time.')
        }

        pendingBlobRef.current = null
        setCompletionPending(false)
        setRecordingState('uploaded')

        if (routeAfterUpload) {
          router.replace('/dashboard')
        }
      } catch (uploadError) {
        setRecordingState('failed')
        setRecordingError(uploadError instanceof Error ? uploadError.message : 'Unable to upload recording.')
        setCompletionPending(routeAfterUpload)
        await updateSessionRecording({
          status: 'upload_failed',
          source: 'candidate_workspace',
          mode: recordingMode,
          candidateId: currentUser.uid,
          caseId: caseIdRef.current || null,
          stoppedAt: serverTimestamp(),
          stoppedAtMs: Date.now(),
          stopReason,
          error: uploadError instanceof Error ? uploadError.message : 'Upload failed',
          transcriptStatus: 'failed',
        })
      }
    },
    [currentUser, lobbyId, recordingMode, requestTranscript, router, updateSessionRecording]
  )

  const stopRecordingAndFinalize = useCallback(
    async (stopReason: string, routeAfterStop: boolean) => {
      if (stopInProgressRef.current) return
      stopInProgressRef.current = true
      stopReasonRef.current = stopReason

      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        teardownMedia()
        if (routeAfterStop) {
          router.replace('/dashboard')
        }
        stopInProgressRef.current = false
        return
      }

      setRecordingState('stopping')
      setRecordingError('')

      const stoppedBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener(
          'stop',
          () => {
            const blob = new Blob(chunksRef.current, {
              type: recorder.mimeType || pickSupportedMimeType() || 'audio/webm',
            })
            resolve(blob)
          },
          { once: true }
        )

        recorder.addEventListener(
          'error',
          () => reject(new Error('Recording failed while stopping.')),
          { once: true }
        )

        try {
          recorder.stop()
        } catch (error) {
          reject(error)
        }
      }).catch((stopError) => {
        setRecordingState('failed')
        setRecordingError(stopError instanceof Error ? stopError.message : 'Unable to stop recording.')
        return null
      })

      recorderRef.current = null
      teardownMedia()

      if (!stoppedBlob) {
        stopInProgressRef.current = false
        setCompletionPending(routeAfterStop)
        return
      }

      if (stoppedBlob.size === 0) {
        setRecordingState('failed')
        setRecordingError('Recording stopped, but no audio was captured.')
        setCompletionPending(routeAfterStop)
        stopInProgressRef.current = false
        return
      }

      pendingBlobRef.current = stoppedBlob
      await uploadRecordingBlob(stoppedBlob, stopReason, routeAfterStop)
      stopInProgressRef.current = false
    },
    [router, teardownMedia, uploadRecordingBlob]
  )

  const handleSessionCompleted = useCallback(
    async (stopReason: string) => {
      if (completionHandledRef.current) return
      completionHandledRef.current = true
      setSessionIssue('')
      await stopRecordingAndFinalize(stopReason, true)
    },
    [stopRecordingAndFinalize]
  )

  const startRecording = useCallback(
    async (mode: RecordingMode) => {
      if (!canStartRecording) return
      if (!currentUser) {
        setRecordingError('Please sign in before starting transcript recording.')
        return
      }
      if (!lobbyId) {
        setRecordingError('Recording is available only in linked practice sessions.')
        return
      }

      setRecordingMode(mode)
      setRecordingState('starting')
      setRecordingError('')
      setCaptureWarning('')
      setRecordingNote(mode === 'remote'
        ? 'Starting remote capture. In the browser prompt, choose your meeting tab and turn on Share audio.'
        : 'Starting microphone capture...')

      try {
        const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        micStreamRef.current = microphoneStream

        let displayStream: MediaStream | null = null
        let captureController: CaptureControllerLike | null = null
        if (mode === 'remote') {
          const CaptureControllerCtor =
            typeof window !== 'undefined'
              ? (
                  window as Window & {
                    CaptureController?: new () => CaptureControllerLike
                  }
                ).CaptureController
              : undefined
          captureController = CaptureControllerCtor ? new CaptureControllerCtor() : null
          displayStream = await navigator.mediaDevices.getDisplayMedia(
            captureController
              ? ({ video: true, audio: true, controller: captureController } as DisplayMediaStreamOptions & {
                  controller: CaptureControllerLike
                })
              : { video: true, audio: true }
          )
          displayStreamRef.current = displayStream

          const displayTrack = displayStream.getVideoTracks()[0]
          const displaySurface = displayTrack?.getSettings?.().displaySurface

          if (displaySurface === 'browser' && captureController?.setFocusBehavior) {
            try {
              captureController.setFocusBehavior('focus-capturing-application')
            } catch {
              // Ignore unsupported focus behavior APIs and continue recording.
            }
          }

          if (displaySurface && displaySurface !== 'browser') {
            const unsupportedSurfaceMessage = 'Share the meeting tab with Share audio turned on.'
            for (const track of displayStream.getTracks()) {
              track.stop()
            }
            displayStreamRef.current = null
            setCaptureWarning(unsupportedSurfaceMessage)
            throw new Error(unsupportedSurfaceMessage)
          }
        }

        const audioContext = new AudioContext()
        audioContextRef.current = audioContext
        await audioContext.resume()
        const destination = audioContext.createMediaStreamDestination()

        let hasAnyAudio = false

        if (displayStream) {
          const displayAudioTracks = displayStream.getAudioTracks()
          if (displayAudioTracks.length > 0) {
            const systemSource = audioContext.createMediaStreamSource(new MediaStream(displayAudioTracks))
            systemSource.connect(destination)
            hasAnyAudio = true
          } else {
            const warningMessage = 'Share the meeting tab with Share audio turned on.'
            setCaptureWarning(warningMessage)
            throw new Error(warningMessage)
          }
        }

        const micTracks = microphoneStream.getAudioTracks()
        if (micTracks.length > 0) {
          const micSource = audioContext.createMediaStreamSource(new MediaStream(micTracks))
          micSource.connect(destination)
          hasAnyAudio = true
        }

        if (!hasAnyAudio) {
          throw new Error('No audio source available for recording.')
        }

        mixedStreamRef.current = destination.stream
        const selectedMimeType = pickSupportedMimeType()
        const recorder = selectedMimeType
          ? new MediaRecorder(destination.stream, { mimeType: selectedMimeType })
          : new MediaRecorder(destination.stream)

        recorderRef.current = recorder
        chunksRef.current = []
        recordingStartMsRef.current = Date.now()
        completionHandledRef.current = false

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }

        if (displayStream) {
          for (const track of displayStream.getVideoTracks()) {
            track.onended = () => {
              if (recorderRef.current && recorderRef.current.state === 'recording') {
                void stopRecordingAndFinalize('screen_share_stopped', false)
              }
            }
          }
        }

        recorder.start(1000)
        setRecordingState('recording')
        if (mode === 'local') {
          setMicrophonePermissionState('granted')
        }
        setRecordingNote(mode === 'remote'
          ? 'Recording tab/system audio + microphone. Keep this tab open until feedback submission.'
          : 'Recording microphone audio. Keep this tab open until feedback submission.')

        await updateSessionRecording({
          status: 'recording',
          source: 'candidate_workspace',
          mode,
          candidateId: currentUser.uid,
          candidateEmail: currentUser.email ?? null,
          caseId: caseIdRef.current || null,
          startedAt: serverTimestamp(),
          startedAtMs: Date.now(),
          transcriptStatus: 'pending',
        })
      } catch (startError) {
        teardownMedia()
        recorderRef.current = null
        chunksRef.current = []
        recordingStartMsRef.current = null
        setRecordingState('failed')
        const message = startError instanceof Error ? startError.message : 'Unable to start recording.'
        if (mode === 'local') {
          const normalized = message.toLowerCase()
          if (
            normalized.includes('notallowed') ||
            normalized.includes('permission') ||
            normalized.includes('denied')
          ) {
            setMicrophonePermissionState('denied')
            setCaptureWarning(getFriendlyRecoverableCaptureMessage(mode, message))
          } else {
            void readMicrophonePermissionState()
          }
        }
        if (mode === 'remote') {
          const normalized = message.toLowerCase()
          if (
            normalized.includes('timeout') ||
            normalized.includes('video source') ||
            normalized.includes('notallowed') ||
            normalized.includes('permission') ||
            normalized.includes('gesture') ||
            normalized.includes('share audio') ||
            normalized.includes('meeting tab') ||
            normalized.includes('window') ||
            normalized.includes('screen') ||
            normalized.includes('monitor') ||
            normalized.includes('display surface') ||
            normalized.includes('audio source')
          ) {
            setCaptureWarning(getFriendlyRecoverableCaptureMessage(mode, message))
          }
        }
        setRecordingError(message)
      }
    },
    [canStartRecording, currentUser, lobbyId, readMicrophonePermissionState, stopRecordingAndFinalize, teardownMedia, updateSessionRecording]
  )

  const startCaptureFlow = useCallback(
    async (mode: RecordingMode) => {
      if (mode === 'local') {
        if (localPrepVisible || recordingState === 'starting') return

        clearRemotePrep()
        setRecordingError('')
        setCaptureWarning('')
        setWorkspaceToast(null)

        const permissionState = await readMicrophonePermissionState()
        if (permissionState === 'denied') {
          setRecordingState('failed')
          setCaptureWarning('Microphone access is blocked. Allow it in the address bar. This page will refresh automatically.')
          return
        }

        setLocalPrepVisible(true)
        setLocalPrepStep(0)

        localPrepTimersRef.current = [
          window.setTimeout(() => setLocalPrepStep(1), 800),
          window.setTimeout(() => setLocalPrepStep(2), 1600),
          window.setTimeout(() => {
            clearLocalPrep()
            void startRecording(mode)
          }, 2450),
        ]
        return
      }

      if (remotePrepVisible || localPrepVisible || recordingState === 'starting') return

      clearLocalPrep()
      setRecordingError('')
      setCaptureWarning('')
      setWorkspaceToast(null)
      setRemotePrepVisible(true)
      setRemotePrepStep(0)

      remotePrepTimersRef.current = [
        window.setTimeout(() => setRemotePrepStep(1), 800),
        window.setTimeout(() => setRemotePrepStep(2), 1600),
        window.setTimeout(() => {
          clearRemotePrep()
          void startRecording(mode)
        }, 2450),
      ]
    },
    [clearLocalPrep, clearRemotePrep, localPrepVisible, readMicrophonePermissionState, recordingState, remotePrepVisible, startRecording]
  )

  const handleRetryUpload = useCallback(async () => {
    if (!pendingBlobRef.current) {
      setRecordingError('No pending audio blob found to retry.')
      return
    }
    await uploadRecordingBlob(pendingBlobRef.current, stopReasonRef.current || 'retry_upload', completionPending)
  }, [completionPending, uploadRecordingBlob])

  const handleEnableCapture = useCallback(() => {
    if (preferredRecordingMode === 'local' && microphonePermissionState === 'denied') {
      setCaptureWarning('Microphone access is blocked. Allow it in the address bar. This page will refresh automatically.')
      void refreshWhenMicrophonePermissionChanges(true)
      return
    }
    void startCaptureFlow(preferredRecordingMode)
  }, [microphonePermissionState, preferredRecordingMode, refreshWhenMicrophonePermissionChanges, startCaptureFlow])

  const handleCandidateEndSession = useCallback(async () => {
    if (endingSession) return
    setEndingSession(true)
    setSessionIssue('')

    completionHandledRef.current = true

    try {
      if (lobbyId) {
        await setDoc(
          doc(db, 'sessions', lobbyId),
          {
            status: 'completed',
            completedBy: 'candidate',
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      }
    } catch (endError) {
      setSessionIssue(endError instanceof Error ? endError.message : 'Unable to update session state in cloud.')
    }

    localStorage.setItem(
      'compendium-session-ended',
      JSON.stringify({
        lobbyId,
        caseId: caseIdRef.current || null,
        endedAt: Date.now(),
        endedBy: 'candidate',
      })
    )

    await stopRecordingAndFinalize('candidate_ended', true)
    setEndingSession(false)
  }, [endingSession, lobbyId, stopRecordingAndFinalize])

  useEffect(() => {
    let unsubscribeSession = () => {}
    let pollTimer: ReturnType<typeof setInterval> | null = null
    const sessionRef = lobbyId ? doc(db, 'sessions', lobbyId) : null

    const clearPoll = () => {
      if (!pollTimer) return
      clearInterval(pollTimer)
      pollTimer = null
    }

    const parseAndHandleEnded = (rawValue: string | null) => {
      if (!rawValue || !caseIdRef.current) return
      try {
        const data = JSON.parse(rawValue)
        if (lobbyId && data?.lobbyId === lobbyId) {
          void handleSessionCompleted('feedback_submitted')
          return
        }
        if (!lobbyId && String(data.caseId) === caseIdRef.current) {
          void handleSessionCompleted('feedback_submitted')
        }
      } catch {
        // Ignore malformed localStorage payloads.
      }
    }

    const routeIfCompleted = (raw: SessionState | null) => {
      if (!raw) return
      setPreferredRecordingMode(resolveSessionMode(raw.sessionMode))
      if (raw.status === 'completed') {
        const stopReason = raw.completedBy === 'candidate' ? 'candidate_ended' : 'feedback_submitted'
        void handleSessionCompleted(stopReason)
      }
    }

    const init = async () => {
      const resolved = await params
      caseIdRef.current = resolved.id
      setResolvedCaseId(resolved.id)

      const user = await waitForAuthUser()
      if (!user) {
        const redirectPath = `/case/${resolved.id}/workspace${lobbyId ? `?lobby=${encodeURIComponent(lobbyId)}&mode=${encodeURIComponent(requestedMode)}` : ''}`
        router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`)
        return
      }
      setCurrentUser(user)

      parseAndHandleEnded(localStorage.getItem('compendium-session-ended'))

      if (sessionRef) {
        const startPolling = () => {
          if (pollTimer) return
          pollTimer = setInterval(async () => {
            try {
              const snapshot = await getDoc(sessionRef)
              if (!snapshot.exists()) {
                setSessionIssue('Session not found. Ask interviewer to restart this session.')
                return
              }
              setSessionIssue('')
              routeIfCompleted(snapshot.data() as SessionState)
            } catch {
              setSessionIssue('Connection unstable. Reconnecting...')
            }
          }, 4000)
        }

        unsubscribeSession = onSnapshot(
          sessionRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              setSessionIssue('Session not found. Ask interviewer to restart this session.')
              startPolling()
              return
            }
            clearPoll()
            setSessionIssue('')
            routeIfCompleted(snapshot.data() as SessionState)
          },
          () => {
            setSessionIssue('Live updates paused. Reconnecting...')
            startPolling()
          }
        )
      }
    }

    void init()

    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'compendium-session-ended') return
      parseAndHandleEnded(event.newValue)
    }

    window.addEventListener('storage', onStorage)
    return () => {
      clearPoll()
      unsubscribeSession()
      window.removeEventListener('storage', onStorage)
    }
  }, [handleSessionCompleted, lobbyId, params, requestedMode, resolveSessionMode, router])

  useEffect(() => {
    if (preferredRecordingMode !== 'local' || typeof window === 'undefined') return

    let active = true
    let permissionStatus: PermissionStatus | null = null

    const syncOnChange = () => {
      void refreshWhenMicrophonePermissionChanges(true)
    }

    const handleWindowFocus = () => {
      void refreshWhenMicrophonePermissionChanges(true)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      void refreshWhenMicrophonePermissionChanges(true)
    }

    void refreshWhenMicrophonePermissionChanges(false)

    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      void navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (!active) return

          permissionStatus = status
          const nextState = status.state as BrowserPermissionState
          setMicrophonePermissionState(nextState)
          previousMicrophonePermissionRef.current = nextState

          status.addEventListener('change', syncOnChange)
        })
        .catch(() => {
          setMicrophonePermissionState('unknown')
          previousMicrophonePermissionRef.current = 'unknown'
        })
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      if (!permissionStatus) return
      permissionStatus.removeEventListener('change', syncOnChange)
    }
  }, [preferredRecordingMode, refreshWhenMicrophonePermissionChanges])

  useEffect(() => {
    if (autoStartAttemptedRef.current) return
    if (!lobbyId || !resolvedCaseId || !currentUser) return
    if (!canStartRecording) return

    autoStartAttemptedRef.current = true
    setRecordingNote(
      preferredRecordingMode === 'remote'
        ? 'Preparing remote capture setup...'
        : 'Auto-starting microphone capture...'
    )
    void startCaptureFlow(preferredRecordingMode)
  }, [canStartRecording, currentUser, lobbyId, preferredRecordingMode, resolvedCaseId, startCaptureFlow])

  useEffect(() => {
    if (!activeBeforeUnloadState(recordingState)) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [recordingState])

  useEffect(() => {
    return () => {
      clearLocalPrep()
      clearRemotePrep()
      teardownMedia()
    }
  }, [clearLocalPrep, clearRemotePrep, teardownMedia])

  const isLocalSession = preferredRecordingMode === 'local'
  const prepVisible = isLocalSession ? localPrepVisible : remotePrepVisible
  const prepStep = isLocalSession ? localPrepStep : remotePrepStep
  const prepSteps = isLocalSession
    ? ['Keep this tab open', 'Allow microphone access', 'Continue here']
    : ['Pick your meeting tab', 'Turn on Share audio', 'Click Share']
  const localPermissionBlocked = isLocalSession && microphonePermissionState === 'denied'

  useEffect(() => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }

    if (completionPending || recordingError || captureWarning || sessionIssue || remotePrepVisible || localPrepVisible) {
      setWorkspaceToast(null)
      return
    }

    setWorkspaceToast(null)
  }, [captureWarning, completionPending, localPrepVisible, recordingError, recordingState, remotePrepVisible, sessionIssue])

  const sessionModeLabel = isLocalSession ? 'Same Device' : 'Remote Partner'
  const statusPillLabel =
    recordingState === 'recording'
      ? 'Live'
      : recordingState === 'starting'
        ? 'Preparing'
        : recordingState === 'stopping'
          ? 'Wrapping up'
          : recordingState === 'uploading'
            ? 'Syncing'
            : recordingState === 'uploaded'
              ? 'Ready'
              : recordingState === 'failed'
                ? 'Needs attention'
                : 'Waiting'
  const statusPillTone =
    recordingState === 'failed'
      ? 'warn'
      : recordingState === 'recording'
        ? 'live'
        : recordingState === 'starting' || recordingState === 'stopping' || recordingState === 'uploading'
          ? 'working'
          : recordingState === 'uploaded'
          ? 'success'
            : 'idle'
  const normalizedRecordingError = recordingError.toLowerCase()
  const isRecoverableCaptureError =
    recordingState === 'failed' &&
    (captureWarning.length > 0 ||
      normalizedRecordingError.includes('timeout') ||
      normalizedRecordingError.includes('video source') ||
      normalizedRecordingError.includes('permission') ||
      normalizedRecordingError.includes('denied') ||
      normalizedRecordingError.includes('notallowed') ||
      normalizedRecordingError.includes('screen') ||
      normalizedRecordingError.includes('window') ||
      normalizedRecordingError.includes('monitor') ||
      normalizedRecordingError.includes('share audio') ||
      normalizedRecordingError.includes('audio was captured') ||
      normalizedRecordingError.includes('audio source') ||
      normalizedRecordingError.includes('gesture'))
  const recoverableCaptureMessage = isRecoverableCaptureError
    ? getFriendlyRecoverableCaptureMessage(
        preferredRecordingMode,
        `${captureWarning} ${recordingError}`.trim()
      )
    : ''
  const persistentRecordingError = isRecoverableCaptureError ? '' : recordingError
  const workflowCurrentStep = recordingState === 'uploaded' && !completionPending ? 4 : 3
  const workflowSteps = isLocalSession
    ? [
        { num: '01', text: 'Controls ready' },
        { num: '02', text: 'Interviewer picks case' },
        { num: '03', text: 'Allow recording' },
        { num: '04', text: 'Review dashboard' },
      ]
    : [
        { num: '01', text: 'Send invite' },
        { num: '02', text: 'Interviewer picks case' },
        { num: '03', text: 'Allow recording' },
        { num: '04', text: 'Review dashboard' },
      ]
  const workspaceStatusTitle =
    recordingState === 'idle'
      ? 'Waiting for recording access'
      : recordingState === 'starting'
        ? 'Preparing capture permission'
        : recordingState === 'recording'
          ? 'Session capture is live'
          : recordingState === 'stopping'
            ? 'Ending this session'
            : recordingState === 'uploading'
              ? 'Uploading session audio'
            : recordingState === 'uploaded'
                ? 'Review is ready'
                : isRecoverableCaptureError
                  ? 'Permission needed to continue'
                  : 'Capture needs attention'
  const workspaceStatusDescription =
    recordingState === 'idle'
      ? 'We will open the Chrome prompt in a moment.'
      : recordingState === 'starting'
        ? (isLocalSession ? 'Allow microphone access when Chrome asks.' : 'Choose the meeting tab and turn on Share audio when Chrome asks.')
        : recordingState === 'recording'
          ? 'Keep this tab open while the session runs.'
          : recordingState === 'stopping'
            ? 'Saving your recording before you leave this page.'
            : recordingState === 'uploading'
              ? 'Finishing the recording and transcript in the background.'
              : recordingState === 'uploaded'
                ? 'You can move to the dashboard now.'
                : isRecoverableCaptureError
                  ? recoverableCaptureMessage
                  : 'Try recording again from this screen.'

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative min-h-screen flex flex-col overflow-hidden bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        .workspace-card {
          position: relative;
          background: rgba(255,248,240,0.6);
          backdrop-filter: blur(28px) saturate(1.5);
          -webkit-backdrop-filter: blur(28px) saturate(1.5);
          border: 1px solid rgba(92,64,51,0.08);
          box-shadow: 0 4px 14px rgba(59,47,47,0.035);
          transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s ease;
        }
        .workspace-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.03);
          border-color: rgba(61,90,53,0.15);
        }
        .workspace-card::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #3D5A35, #695c4d);
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .workspace-card:hover::after {
          opacity: 1;
        }
        @keyframes workspace-fade-up {
          from { opacity: 0; transform: translateY(16px); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes workspace-card-in {
          from { opacity: 0; transform: translateY(20px) scale(0.985); filter: blur(3px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes workspace-glow {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
          33% { transform: translate(24px, -18px) scale(1.08); opacity: 0.82; }
          66% { transform: translate(-20px, 12px) scale(0.96); opacity: 0.6; }
        }
        @keyframes workspace-bg-shift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.72; }
          50% { transform: translate3d(18px, -12px, 0) scale(1.04); opacity: 0.9; }
        }
        @keyframes workspace-prep-glow {
          0%, 100% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 10px 26px rgba(92,64,51,0.04);
            border-color: rgba(92,64,51,0.07);
          }
          50% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.82), 0 16px 34px rgba(92,64,51,0.055), 0 0 0 1px rgba(196,168,130,0.05);
            border-color: rgba(92,64,51,0.09);
          }
        }
        @keyframes workspace-prep-aura {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.42; }
          50% { transform: translate(12px, -8px) scale(1.05); opacity: 0.56; }
        }
        @keyframes workspace-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes workspace-pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0.6; }
        }
        .workspace-btn {
          background: rgba(255,248,240,0.84);
          border: 1px solid rgba(61,90,53,0.16);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72), 0 1px 2px rgba(61,90,53,0.04);
          transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .workspace-btn:hover {
          background: rgba(61,90,53,0.08);
          border-color: rgba(61,90,53,0.28);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 6px 14px rgba(61,90,53,0.06);
          transform: translateY(-1px);
        }
        .workspace-btn-primary {
          background: #3D5A35;
          border: 1px solid #3D5A35;
          color: white;
          box-shadow: 0 10px 24px rgba(61,90,53,0.14);
        }
        .workspace-btn-primary:hover {
          background: rgba(255,248,240,0.9);
          color: #3D5A35;
        }
        .workspace-inline-note {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          border: 1px solid rgba(61,90,53,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(244,237,227,0.72) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);
        }
        .workspace-inline-note.alert {
          border-color: rgba(196,168,130,0.16);
          background: linear-gradient(180deg, rgba(255,251,246,0.88) 0%, rgba(249,242,234,0.9) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.74), 0 6px 16px rgba(196,168,130,0.04);
        }
        .workspace-inline-note.warn {
          border-color: rgba(196,168,130,0.16);
          background: linear-gradient(180deg, rgba(255,251,245,0.88) 0%, rgba(248,241,231,0.9) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.74), 0 6px 16px rgba(196,168,130,0.04);
        }
        .workspace-prep-strip {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border: 1px solid rgba(92,64,51,0.07);
          background: rgba(255,248,240,0.6);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 10px 26px rgba(92,64,51,0.04);
          backdrop-filter: blur(28px) saturate(1.5);
          -webkit-backdrop-filter: blur(28px) saturate(1.5);
          animation: workspace-prep-glow 5.8s ease-in-out infinite;
        }
        .workspace-prep-strip::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 18% 50%, rgba(196,168,130,0.08) 0%, rgba(196,168,130,0.03) 26%, transparent 64%);
          animation: workspace-prep-aura 8s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }
        .workspace-prep-step {
          border: 1px solid rgba(92,64,51,0.06);
          background: rgba(255,248,240,0.46);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.74);
          transition: all 0.28s cubic-bezier(0.22,1,0.36,1);
        }
        .workspace-prep-step.active {
          border-color: rgba(92,64,51,0.1);
          background: rgba(255,248,240,0.76);
          box-shadow: 0 12px 24px rgba(92,64,51,0.06), inset 0 1px 0 rgba(255,255,255,0.84);
          transform: translateY(-1px);
        }
        .workspace-prep-step.done {
          border-color: rgba(92,64,51,0.08);
          background: rgba(255,248,240,0.58);
        }
        .workspace-step-active {
          animation: workspace-step-pulse 2.8s ease-in-out infinite;
        }
        @keyframes workspace-step-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(61,90,53,0.08), 0 0 0 0 rgba(61,90,53,0.04);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(61,90,53,0.06), 0 10px 18px rgba(61,90,53,0.08);
          }
        }
        .workspace-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 6px;
          border: 1px solid rgba(92,64,51,0.1);
          background: rgba(217,208,196,0.18);
          transition: all 0.25s ease;
        }
        .workspace-status-badge.idle {
          border-color: rgba(92,64,51,0.1);
          background: rgba(217,208,196,0.18);
        }
        .workspace-status-badge.live,
        .workspace-status-badge.success {
          border-color: rgba(61,90,53,0.16);
          background: rgba(61,90,53,0.08);
        }
        .workspace-status-badge.working {
          border-color: rgba(196,168,130,0.22);
          background: rgba(196,168,130,0.12);
        }
        .workspace-status-badge.warn {
          border-color: rgba(196,168,130,0.4);
          background: rgba(196,168,130,0.12);
        }
        .workspace-status-badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          flex-shrink: 0;
          background: rgba(92,64,51,0.35);
        }
        .workspace-status-badge.live .workspace-status-badge-dot,
        .workspace-status-badge.success .workspace-status-badge-dot {
          background: #3D5A35;
        }
        .workspace-status-badge.working .workspace-status-badge-dot,
        .workspace-status-badge.warn .workspace-status-badge-dot {
          background: #C4A882;
        }
        .workspace-status-badge.live .workspace-status-badge-dot,
        .workspace-status-badge.working .workspace-status-badge-dot {
          animation: workspace-pulse-ring 2s ease-in-out infinite;
        }
        .workspace-toast {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 16px;
          border: 1px solid rgba(61,90,53,0.1);
          background: rgba(255,248,240,0.82);
          backdrop-filter: blur(22px) saturate(1.4);
          -webkit-backdrop-filter: blur(22px) saturate(1.4);
          box-shadow: 0 12px 28px rgba(61,90,53,0.06), inset 0 1px 0 rgba(255,255,255,0.74);
          animation: workspace-toast-in 0.32s cubic-bezier(0.22,1,0.36,1);
        }
        .workspace-toast-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          flex-shrink: 0;
          background: rgba(92,64,51,0.32);
        }
        .workspace-toast.success .workspace-toast-dot {
          background: #3D5A35;
        }
        .workspace-toast.warn .workspace-toast-dot {
          background: #C4A882;
        }
        .workspace-toast.success {
          border-color: rgba(61,90,53,0.14);
        }
        .workspace-toast.warn {
          border-color: rgba(196,168,130,0.28);
          background: rgba(255,250,243,0.9);
        }
        @keyframes workspace-toast-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <header
        className="fixed top-0 w-full z-[100]"
        style={{
          height: '70px',
          background: 'rgba(255,248,240,0.9)',
          backdropFilter: 'blur(28px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
          borderBottom: '1px solid rgba(92,64,51,0.06)',
        }}
      >
        <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4 md:px-12">
          <Link href="/" className="flex items-center gap-1 text-left transition-opacity hover:opacity-85">
            <Image
              src="/logo.png"
              alt="Case Compendium X"
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
            />
            <div style={{ fontFamily: "'Newsreader', serif" }} className="text-xl font-semibold tracking-tight">
              <span className="text-[#453a2a]">Case Compendium</span>
              <span className="text-[#3D5A35]">X</span>
            </div>
          </Link>
        </div>
      </header>

      <main className="relative flex min-h-[calc(100vh-70px)] flex-1 flex-col justify-center px-4 pb-20 pt-[90px] md:px-8 md:pb-24">
        <div className="mx-auto max-w-4xl w-full">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-[320px]"
              style={{ background: 'linear-gradient(180deg, rgba(244,237,227,0.72) 0%, rgba(255,248,240,0) 100%)' }}
            />
            <div
              className="absolute -top-2 left-[8%] h-[420px] w-[420px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(61,90,53,0.095) 0%, rgba(61,90,53,0.055) 22%, transparent 68%)', animation: 'workspace-bg-shift 15s ease-in-out infinite' }}
            />
            <div
              className="absolute top-[18%] right-[6%] h-[340px] w-[340px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(92,64,51,0.065) 0%, rgba(92,64,51,0.035) 24%, transparent 70%)', animation: 'workspace-glow 17s ease-in-out infinite reverse' }}
            />
            <div
              className="absolute bottom-[12%] left-[22%] h-[260px] w-[260px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(196,168,130,0.075) 0%, transparent 66%)', animation: 'workspace-glow 18s ease-in-out infinite' }}
            />
          </div>

          <div
            className="mb-7 max-w-[760px]"
            style={{ animation: 'workspace-fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[2px]">
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#3D5A35]/20 text-[#3D5A35]/60 bg-[#3D5A35]/5 leading-tight uppercase">
                Candidate Workspace
              </span>
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight uppercase">
                {sessionModeLabel}
              </span>
            </div>
            <h1
              className="text-4xl font-light leading-[0.94] tracking-tight text-[#453a2a] md:text-5xl"
              style={{ fontFamily: "'Newsreader', serif" }}
            >
              Interview Session <span className="text-[#3D5A35]">in Progress</span>
            </h1>
            <p className="mt-4 max-w-[620px] pl-[2px] text-[13px] leading-relaxed text-[#5c4033]/62">
              Stay here while this session moves through recording and review.
            </p>
          </div>

          <section
            className="workspace-card overflow-hidden rounded-xl"
            style={{ animation: 'workspace-card-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s both' }}
          >
            <div className="relative flex flex-wrap items-start justify-between gap-4 px-6 py-5">
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(61,90,53,0.05) 0%, transparent 70%)' }}
              />
              <div
                className="pointer-events-none absolute bottom-0 left-6 right-6 h-[1px]"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(61,90,53,0.1) 20%, rgba(196,168,130,0.08) 80%, transparent 100%)' }}
              />
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3D5A35]/8">
                  <span
                    className="material-symbols-outlined text-[#3D5A35]"
                    style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}
                  >
                    mic
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    {recordingState === 'recording' ? (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inset-0 rounded-full bg-[#3D5A35]" style={{ animation: 'workspace-pulse-ring 2s ease-in-out infinite' }} />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#3D5A35]" />
                      </span>
                    ) : null}
                    <span className="text-[12px] font-medium text-[#3B2F2F]">{workspaceStatusTitle}</span>
                  </div>
                  <span className="mt-1 block max-w-[620px] text-[10px] leading-relaxed text-[#5C4033]/35">
                    {workspaceStatusDescription}
                  </span>
                </div>
              </div>
              <span className={`workspace-status-badge ${statusPillTone}`}>
                <span className="workspace-status-badge-dot" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#5C4033]/65">
                  {statusPillLabel}
                </span>
              </span>
            </div>

            <div className="px-6 py-6">
              <div className="relative">
                {workspaceToast ? (
                  <div className={`workspace-toast mb-5 ${workspaceToast.tone}`}>
                    <span className="workspace-toast-dot" />
                    <span className="text-[11px] leading-relaxed text-[#5C4033]/72">{workspaceToast.message}</span>
                  </div>
                ) : null}
                <div className="relative grid gap-5 md:grid-cols-4">
                  {workflowSteps.map((step, index) => {
                    const isCurrent = workflowCurrentStep === index + 1
                    const isPast = workflowCurrentStep > index + 1
                    return (
                      <div
                        key={step.num}
                        className="flex flex-col items-center gap-2.5 text-center"
                        style={{ animation: `workspace-step-in 0.4s cubic-bezier(0.22,1,0.36,1) ${0.24 + index * 0.08}s both` }}
                      >
                        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[9px] font-semibold tracking-wider ${
                          isCurrent
                            ? 'bg-[#3D5A35] text-white'
                            : isPast
                              ? 'bg-[#3D5A35]/10 text-[#3D5A35]'
                              : 'bg-[#D9D0C4]/25 text-[#5C4033]/40'
                        } ${isCurrent ? 'workspace-step-active' : ''}`}>
                          {step.num}
                        </span>
                        <span className={`text-[12px] leading-snug ${
                          isCurrent
                            ? 'font-medium text-[#3B2F2F]'
                            : isPast
                              ? 'text-[#5C4033]/52'
                              : 'text-[#5C4033]/50'
                        }`}>
                          {step.text}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {prepVisible ? (
                <div className="workspace-prep-strip mt-5 rounded-[22px] px-4 py-4">
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(61,90,53,0.04) 0%, rgba(61,90,53,0.02) 34%, transparent 72%)' }}
                  />
                  <div className="relative grid gap-2 md:grid-cols-3">
                    {prepSteps.map((step, index) => {
                      const isActive = prepStep === index
                      const isDone = prepStep > index

                      return (
                        <div
                          key={step}
                          className={`workspace-prep-step rounded-full px-3 py-2 text-center text-[11px] leading-relaxed ${
                            isActive ? 'active text-[#453a2a]' : isDone ? 'done text-[#5C4033]/68' : 'text-[#5C4033]/48'
                          }`}
                        >
                          {step}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {isRecoverableCaptureError ? (
                <div className="workspace-inline-note warn mt-5 rounded-[20px] px-4 py-4">
                  <span className="material-symbols-outlined mt-0.5 text-[#a5794f]/70" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>
                    warning
                  </span>
                  <p className="text-[13px] leading-relaxed text-[#7a5b3d]">
                    {recoverableCaptureMessage}
                  </p>
                </div>
              ) : null}

              {persistentRecordingError ? (
                <div className="workspace-inline-note alert mt-5 rounded-[20px] px-4 py-4">
                  <span className="material-symbols-outlined mt-0.5 text-[#a5794f]/70" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>
                    error
                  </span>
                  <p className="text-[13px] leading-relaxed text-[#7a5b3d]">
                    {persistentRecordingError}
                  </p>
                </div>
              ) : null}

              {sessionIssue ? (
                <div className="workspace-inline-note warn mt-5 rounded-[20px] px-4 py-4">
                  <span className="material-symbols-outlined mt-0.5 text-[#a5794f]/70" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>
                    wifi_off
                  </span>
                  <p className="text-[13px] leading-relaxed text-[#7a5b3d]">
                    {sessionIssue}
                  </p>
                </div>
              ) : null}

              {completionPending ? (
                <div className="workspace-inline-note warn mt-5 rounded-[24px] p-5">
                  <span className="material-symbols-outlined mt-0.5 text-[#a5794f]/70" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>
                    cloud_upload
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[#7a5b3d]/70">Upload still running</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#7a5b3d]">
                      The session is over, but we still need to upload the recording before you leave this page.
                    </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleRetryUpload()}
                      className="workspace-btn workspace-btn-primary rounded-full px-5 py-3 text-[10px] uppercase tracking-[0.22em]"
                    >
                      Retry Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => router.replace('/dashboard')}
                      className="workspace-btn rounded-full px-5 py-3 text-[10px] uppercase tracking-[0.22em]"
                    >
                      Go to Dashboard
                    </button>
                  </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {(recordingState === 'idle' || recordingState === 'failed' || prepVisible) ? (
                  <button
                    type="button"
                    onClick={handleEnableCapture}
                    disabled={!canStartRecording || !resolvedCaseId || prepVisible}
                    className="workspace-btn workspace-btn-primary rounded-full px-5 py-3 text-[10px] uppercase tracking-[0.22em] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prepVisible ? 'Opening Prompt...' : localPermissionBlocked ? 'Allow In Browser' : 'Allow Recording'}
                  </button>
                ) : null}
                {!completionPending ? (
                  <button
                    type="button"
                    onClick={() => void handleCandidateEndSession()}
                    disabled={endingSession}
                    className="workspace-btn rounded-full px-5 py-3 text-[10px] uppercase tracking-[0.22em] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {endingSession ? 'Ending Session...' : 'End Session'}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </main>

      <CompactPlatformFooter />
    </div>
  )
}

function activeBeforeUnloadState(value: RecordingState): boolean {
  return value === 'recording' || value === 'stopping' || value === 'uploading'
}

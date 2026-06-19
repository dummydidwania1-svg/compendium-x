'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type User } from 'firebase/auth'
import { getDocs, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { auth, storage, waitForAuthUser } from '@/lib/firebase/config'
import { sessionDoc, evaluationsCol } from '@/lib/firebase/collections'
import { apiPost } from '@/lib/api/client'
import { useMicPermission } from '@/lib/permissions/microphone'
import { LobbyOverlay } from '@/components/lobby/LobbyOverlay'
import {
  getActiveDisplayStream,
  releaseDisplayMedia,
} from '@/lib/permissions/displayMedia'

type SessionState = {
  status?: 'waiting' | 'in_progress' | 'completed' | 'abandoned'
  caseId?: string
  caseName?: string
  completedBy?: string
  sessionMode?: RecordingMode
  recording?: {
    transcriptStatus?: 'pending' | 'processing' | 'completed' | 'failed'
    audioUrl?: string
    mimeType?: string
    storagePath?: string
  }
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

function getFriendlyRecoverableCaptureMessage(mode: RecordingMode, message: string): string {
  const normalized = message.toLowerCase()

  if (mode === 'local') {
    if (
      normalized.includes('permission') ||
      normalized.includes('notallowed') ||
      normalized.includes('denied')
    ) {
      return 'Microphone is blocked. Click the lock icon in your address bar and set Microphone to Allow.'
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
  const [interviewerWindowClosed, setInterviewerWindowClosed] = useState(false)
  const [caseName, setCaseName] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  // ── Session-complete overlay (timed, auto-dismisses then routes to dashboard) ──
  const [sessionCompleteOverlayVisible, setSessionCompleteOverlayVisible] = useState(false)
  const sessionCompleteRouteRef = useRef(false)
  // ── Refresh-interrupted overlay (shown when page reloaded mid-session) ────────
  const [refreshInterruptedVisible, setRefreshInterruptedVisible] = useState(false)
  // ── Upload-fail overlay (replaces completion-pending inline block) ───────────
  const [uploadFailOverlayVisible, setUploadFailOverlayVisible] = useState(false)
  const uploadFailReshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ── Leave-confirm overlay (shown on back-button / nav-away while recording or uploading) ──
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false)
  const [leavingInProgress, setLeavingInProgress] = useState(false)
  const [leaveSavedOverlayVisible, setLeaveSavedOverlayVisible] = useState(false)
  // ── End-session overlay (shown when candidate clicks "End Session" button) ──
  type EndSessionOverlayKind = 'rated' | 'unrated' | null
  const [endSessionOverlayKind, setEndSessionOverlayKind] = useState<EndSessionOverlayKind>(null)
  const [endSessionActionInProgress, setEndSessionActionInProgress] = useState(false)
  const [endSessionSavedVisible, setEndSessionSavedVisible] = useState(false)
  const [endSessionSavedKind, setEndSessionSavedKind] = useState<'rated' | 'unrated'>('unrated')
  // Suppresses interviewer-window-closed and capture-error overlays after end session is triggered
  const endSessionInitiatedRef = useRef(false)
  // ── Recoverable capture error overlay ──────────────────────────────────────
  const [captureErrorOverlayVisible, setCaptureErrorOverlayVisible] = useState(false)
  const captureErrorReshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ── Persistent (fatal) recording error overlay ─────────────────────────────
  const [persistentErrorOverlayVisible, setPersistentErrorOverlayVisible] = useState(false)

  // ── Session-issue overlay (session doc missing / connection error) ─────────
  const [sessionIssueOverlayVisible, setSessionIssueOverlayVisible] = useState(false)
  const sessionIssueReshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Mic-blocked overlay (replaces MicSoftWarningBanner with reshow logic) ──
  const [micBlockedOverlayVisible, setMicBlockedOverlayVisible] = useState(false)
  const micBlockedReshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Interviewer-window-closed overlay (same-device sessions) ─────────────
  const [windowClosedOverlayVisible, setWindowClosedOverlayVisible] = useState(false)
  const windowClosedReshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titlePulseRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const originalTitleRef = useRef(
    typeof document !== 'undefined' ? document.title : 'Case CompendiumX'
  )
  const startTitlePulse = useCallback(() => {
    if (titlePulseRef.current) return
    let flip = false
    titlePulseRef.current = setInterval(() => {
      document.title = flip
        ? originalTitleRef.current
        : '🖥 Reopen Controls · Case CompendiumX'
      flip = !flip
    }, 900)
  }, [])
  const stopTitlePulse = useCallback(() => {
    if (!titlePulseRef.current) return
    clearInterval(titlePulseRef.current)
    titlePulseRef.current = null
    document.title = originalTitleRef.current
  }, [])
  useEffect(() => () => {
    stopTitlePulse()
    if (windowClosedReshowTimerRef.current) clearTimeout(windowClosedReshowTimerRef.current)
    if (sessionIssueReshowTimerRef.current) clearTimeout(sessionIssueReshowTimerRef.current)
    if (micBlockedReshowTimerRef.current) clearTimeout(micBlockedReshowTimerRef.current)
    if (uploadFailReshowTimerRef.current) clearTimeout(uploadFailReshowTimerRef.current)
    if (captureErrorReshowTimerRef.current) clearTimeout(captureErrorReshowTimerRef.current)
  }, [stopTitlePulse])

  // Reactive microphone permission tracking. The hook subscribes to
  // PermissionStatus.onchange under the hood, so this state updates the
  // moment the user grants or revokes mic in their browser — no reload.
  const {
    state: microphonePermissionState,
    request: requestMicrophone,
    retry: retryMicrophonePermission,
  } = useMicPermission()

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
  // Only true when we've previously started recording (auto-start ran) AND
  // the page was then reloaded. Set AFTER autoStartAttemptedRef so a fresh
  // case load that sees in_progress on its first snapshot doesn't trigger it.
  const sessionWasInProgressRef = useRef(false)
  const [warnBeforeReloadVisible, setWarnBeforeReloadVisible] = useState(false)
  const [warnBeforeCloseVisible, setWarnBeforeCloseVisible] = useState(false)
  // Set to true by keydown/reload-button handlers so beforeunload can tell the
  // difference between a reload and a tab-close. Only reloads show the reload overlay.
  const isReloadIntentRef = useRef(false)
  const toastTimeoutRef = useRef<number | null>(null)
  const remotePrepTimersRef = useRef<number[]>([])
  const localPrepTimersRef = useRef<number[]>([])
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
    // Also clear the cross-route display-media slot. The stream stored there
    // shares track refs with displayStreamRef so we already stopped them
    // above, but the slot needs to be nulled so a fresh session can acquire
    // again later.
    releaseDisplayMedia()

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

      // Warm up auth before the first Storage upload. On a brand-new account's
      // FIRST recording, the Firebase auth/token handshake hasn't been
      // exercised yet, so the very first uploadBytes call can be rejected with
      // an unauthenticated/permission error until the token is minted and the
      // Storage SDK has a valid credential. Force-minting a fresh ID token here
      // (and waiting for the auth user to be ready) primes that handshake so
      // the first attempt succeeds, instead of failing a few times and forcing
      // the candidate to click "Retry upload". Subsequent cases already have a
      // warm token, which is why the bug only showed on the first case.
      try {
        await auth.currentUser?.getIdToken(true)
      } catch {
        // Non-fatal — the retry loop below still covers a slow token.
      }

      // Auto-retry the upload a few times with backoff before surfacing a
      // failure overlay, as a safety net for any remaining transient failure.
      // Each attempt uses a fresh storage path (timestamp) so a partially
      // written object from a failed attempt is never reused.
      const MAX_ATTEMPTS = 5
      let lastError: unknown = null

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const storagePath = `session-recordings/${currentUser.uid}/${lobbyId}/${Date.now()}.${extension}`
        const recordingRef = storageRef(storage, storagePath)
        try {
          await uploadBytes(recordingRef, blob, { contentType: mimeType })
          const audioUrl = await getDownloadURL(recordingRef)
          const nowMs = Date.now()

          await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/recording`, {
            status: 'uploaded',
            mode: recordingMode,
            startedAtMs: recordingStartMsRef.current,
            stoppedAtMs: nowMs,
            durationMs: recordingStartMsRef.current ? nowMs - recordingStartMsRef.current : null,
            stopReason,
            storagePath,
            audioUrl,
            mimeType,
            byteSize: blob.size,
          })

          // Writing recording metadata sets transcriptStatus='pending'. The
          // Cloud Function picks it up and writes back when done — no client
          // wait, no HTTP timeout, candidate is free to navigate away.
          setRecordingNote('Audio uploaded. Transcript will finish in the background — feel free to leave this page.')

          pendingBlobRef.current = null
          setCompletionPending(false)
          setRecordingState('uploaded')

          if (routeAfterUpload) {
            setSessionCompleteOverlayVisible(true)
          }
          return
        } catch (uploadError) {
          lastError = uploadError
          // TEMP DIAGNOSTIC: log the exact failure so we can see which step
          // (uploadBytes / getDownloadURL / apiPost) fails and the error code.
          console.error(`[upload attempt ${attempt}/${MAX_ATTEMPTS}] failed`, {
            name: (uploadError as { name?: string })?.name,
            code: (uploadError as { code?: string })?.code,
            status: (uploadError as { status?: number })?.status,
            message: uploadError instanceof Error ? uploadError.message : String(uploadError),
            serverResponse: (uploadError as { customData?: { serverResponse?: string } })?.customData?.serverResponse,
            currentUserUid: currentUser?.uid,
            authUid: auth.currentUser?.uid,
            blobType: blob.type,
            blobSize: blob.size,
            startedAtMs: recordingStartMsRef.current,
            recordingMode,
          })
          if (attempt < MAX_ATTEMPTS) {
            // Backoff: 600ms, 1200ms, 1800ms. Gives the auth token / network /
            // tab-focus state time to settle before the next attempt.
            await new Promise((resolve) => setTimeout(resolve, attempt * 600))
          }
        }
      }

      // All attempts failed — surface the failure overlay so the candidate can
      // retry manually (the blob is still cached in pendingBlobRef).
      setRecordingState('failed')
      setRecordingError(lastError instanceof Error ? lastError.message : 'Unable to upload recording.')
      setCompletionPending(routeAfterUpload)
      try {
        await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/recording`, {
          status: 'upload_failed',
          mode: recordingMode,
          stoppedAtMs: Date.now(),
          stopReason,
          error: lastError instanceof Error ? lastError.message : 'Upload failed',
        })
      } catch {
        // Server-side persistence is best-effort here — UI already reflects failure.
      }
    },
    [currentUser, lobbyId, recordingMode, router]
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
          setSessionCompleteOverlayVisible(true)
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
          // Prefer the stream the candidate already authorized on the lobby
          // page. Without this we'd re-prompt mid-case which forces a
          // context-switch off the case prompt onto Chrome's tab picker.
          const preAcquired = getActiveDisplayStream()
          if (preAcquired) {
            displayStream = preAcquired
            displayStreamRef.current = displayStream
            // No captureController on a pre-acquired stream — its focus
            // behaviour was already settled when it was first granted.
            // No displaySurface validation either: acquireDisplayMedia()
            // on the lobby side already enforced that audio tracks exist.
          } else {
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
        // microphonePermissionState is now reactive (via useMicPermission);
        // no manual sync needed — the browser fires onchange when getUserMedia
        // succeeds.
        setRecordingNote(mode === 'remote'
          ? 'Recording tab/system audio + microphone. Keep this tab open until feedback submission.'
          : 'Recording microphone audio. Keep this tab open until feedback submission.')
        // Recording-in-progress is local UI state only; nothing else reads it
        // so we don't write it to Firestore. The server learns about the
        // recording when it's uploaded (or failed) via /api/sessions/[id]/recording.
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
            setCaptureWarning(getFriendlyRecoverableCaptureMessage(mode, message))
          }
          // Re-query permission state from the browser truthfully — the
          // hook is reactive, but a manual nudge after a failure helps if
          // the onchange event didn't fire (some Safari/Firefox edge cases).
          void retryMicrophonePermission()
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
            normalized.includes('audio source') ||
            // Chrome/Edge throw a bare DOMException "Invalid state" when
            // getDisplayMedia is invoked without a fresh user activation —
            // the candidate-side auto-start always hits this because the
            // route into workspace is triggered by the interviewer's
            // onSnapshot event, not a click on the candidate's tab. Treat
            // it as a recoverable "user needs to click Allow Recording"
            // case rather than surfacing the raw string.
            normalized.includes('invalid state') ||
            normalized === 'invalidstateerror'
          ) {
            setCaptureWarning(getFriendlyRecoverableCaptureMessage(mode, message))
          }
        }
        setRecordingError(message)
      }
    },
    [canStartRecording, currentUser, lobbyId, retryMicrophonePermission, stopRecordingAndFinalize, teardownMedia]
  )

  const startCaptureFlow = useCallback(
    async (mode: RecordingMode) => {
      if (mode === 'local') {
        if (localPrepVisible || recordingState === 'starting') return

        clearRemotePrep()
        setRecordingError('')
        setCaptureWarning('')
        setWorkspaceToast(null)

        const permissionState = await retryMicrophonePermission()
        if (permissionState === 'denied') {
          setRecordingState('failed')
          setCaptureWarning('Microphone is blocked. Click the lock icon in your address bar to enable, then try again.')
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
    [clearLocalPrep, clearRemotePrep, localPrepVisible, recordingState, remotePrepVisible, retryMicrophonePermission, startRecording]
  )

  const handleRetryUpload = useCallback(async () => {
    if (!pendingBlobRef.current) {
      setRecordingError('No pending audio blob found to retry.')
      return
    }
    await uploadRecordingBlob(pendingBlobRef.current, stopReasonRef.current || 'retry_upload', completionPending)
  }, [completionPending, uploadRecordingBlob])

  // Single capture-start entry point invoked by the workspace's primary
  // button and by the soft-warning banner. If mic is still denied, we
  // ask the hook to try anyway — getUserMedia rejects silently, which
  // we surface via captureWarning so the user knows what to fix.
  const handleEnableCapture = useCallback(async () => {
    if (preferredRecordingMode === 'local' && microphonePermissionState === 'denied') {
      const stream = await requestMicrophone()
      if (!stream) {
        setCaptureWarning('Microphone is blocked. Click the lock icon in your address bar to enable.')
        return
      }
      // Got a stream; release it — startCaptureFlow will reacquire as part
      // of the normal flow now that the browser has granted us access.
      stream.getTracks().forEach((track) => track.stop())
    }
    void startCaptureFlow(preferredRecordingMode)
  }, [microphonePermissionState, preferredRecordingMode, requestMicrophone, startCaptureFlow])

  // Allow-mic handler used by MicSoftWarningBanner. Tries to get the
  // microphone; on success, kicks off the capture flow. We reset the
  // auto-start guard so the effect can re-fire if it skipped earlier.
  const handleBannerAllow = useCallback(async () => {
    const stream = await requestMicrophone()
    if (!stream) {
      // Still denied. Banner stays visible; user must use address bar.
      return
    }
    stream.getTracks().forEach((track) => track.stop())
    autoStartAttemptedRef.current = false
    void startCaptureFlow(preferredRecordingMode)
  }, [preferredRecordingMode, requestMicrophone, startCaptureFlow])

  // Shared helper: reads localStorage draft and checks if all 4 scores are filled
  type DraftScores = { structure?: number; understanding?: number; delivery?: number; creativity?: number }
  const readDraftScores = useCallback((lid: string): { scores: DraftScores; notes: string } | null => {
    try {
      const raw = localStorage.getItem(`compendium-interviewer-draft-${lid}`)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { scores?: DraftScores; notes?: string }
      return parsed.scores ? { scores: parsed.scores, notes: parsed.notes ?? '' } : null
    } catch {
      return null
    }
  }, [])

  const isDraftAllRated = useCallback((scores: DraftScores): boolean =>
    (scores.structure ?? 0) > 0 &&
    (scores.understanding ?? 0) > 0 &&
    (scores.delivery ?? 0) > 0 &&
    (scores.creativity ?? 0) > 0
  , [])

  const checkRatingStatus = useCallback(async (lid: string): Promise<boolean> => {
    // Source A: Firestore eval already submitted by the interviewer.
    // Firestore rules only allow the candidate to read evaluations scoped to
    // their own candidateId — querying by lobbyId alone is rejected. So query
    // by candidateId (allowed) and filter for this lobby client-side. Also
    // treat any non-unrated eval as "rated".
    try {
      if (currentUser) {
        const snap = await getDocs(
          query(evaluationsCol, where('candidateId', '==', currentUser.uid))
        )
        const match = snap.docs.find((d) => d.data().lobbyId === lid)
        if (match && match.data().isUnrated !== true) return true
      }
    } catch {
      // Network/permission error — fall back to draft
    }
    // Source B: localStorage draft with all 4 scores > 0
    const draft = readDraftScores(lid)
    return draft !== null && isDraftAllRated(draft.scores)
  }, [currentUser, readDraftScores, isDraftAllRated])

  const handleCandidateEndSession = useCallback(async () => {
    if (endingSession) return
    if (!lobbyId) return

    // Set immediately so the window-closed reshow timer is suppressed
    // even before the user picks an action from the overlay
    endSessionInitiatedRef.current = true
    setWindowClosedOverlayVisible(false)
    if (windowClosedReshowTimerRef.current) {
      clearTimeout(windowClosedReshowTimerRef.current)
      windowClosedReshowTimerRef.current = null
    }

    setEndingSession(true)
    const isRated = await checkRatingStatus(lobbyId)
    setEndingSession(false)
    setEndSessionOverlayKind(isRated ? 'rated' : 'unrated')
  }, [endingSession, lobbyId, checkRatingStatus])

  const handleEndSessionSaveAndEnd = useCallback(async () => {
    if (endSessionActionInProgress || !lobbyId) return
    setEndSessionActionInProgress(true)
    endSessionInitiatedRef.current = true
    completionHandledRef.current = true
    // Dismiss overlays that no longer apply
    setWindowClosedOverlayVisible(false)
    setCaptureErrorOverlayVisible(false)
    setEndSessionOverlayKind(null)

    // Submit draft via candidate-safe route (uses session's interviewerId server-side).
    // submit-draft is idempotent server-side (skips creation if an eval already
    // exists) and also marks the session completed — no need to call /complete
    // separately. We must NOT do a client-side `where('lobbyId', ...)` query here:
    // Firestore rules only allow reading evaluations scoped to the caller's own
    // candidateId/interviewerId, so a lobbyId-only query throws and would skip
    // eval creation entirely (the original "entries not showing" bug).
    try {
      const draft = readDraftScores(lobbyId)
      if (draft && isDraftAllRated(draft.scores)) {
        // Interviewer rated all 4 in the draft (may or may not have formally
        // submitted) — submit-draft creates the eval if missing, idempotent.
        await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/submit-draft`, {
          scores: {
            structure: draft.scores.structure as number,
            understanding: draft.scores.understanding as number,
            delivery: draft.scores.delivery as number,
            creativity: draft.scores.creativity as number,
          },
          notes: draft.notes,
        })
      } else {
        // No complete local draft — the interviewer already submitted formally,
        // so the eval exists server-side. Just mark the session complete.
        await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/complete`, { completedBy: 'candidate' })
      }
    } catch {
      // Non-fatal
    }

    try { localStorage.removeItem(`compendium-interviewer-draft-${lobbyId}`) } catch { }

    type PopupHost = Window & { __compendiumInterviewerWindow?: Window | null }
    ;(window as PopupHost).__compendiumInterviewerWindow?.close()

    await stopRecordingAndFinalize('candidate_ended', false)
    setEndSessionActionInProgress(false)
    setEndSessionSavedKind('rated')
    setEndSessionSavedVisible(true)
  }, [endSessionActionInProgress, lobbyId, readDraftScores, isDraftAllRated, stopRecordingAndFinalize])

  const handleEndSessionSaveAudio = useCallback(async () => {
    if (endSessionActionInProgress || !lobbyId) return
    setEndSessionActionInProgress(true)
    endSessionInitiatedRef.current = true
    completionHandledRef.current = true
    // Dismiss overlays that no longer apply
    setWindowClosedOverlayVisible(false)
    setCaptureErrorOverlayVisible(false)
    setEndSessionOverlayKind(null)

    // Save audio as a completed-but-unrated case: creates an unrated evaluation
    // doc + marks the session completed, so it appears in the dashboard now.
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/save-unrated`, {})
    } catch {
      // Non-fatal
    }

    try { localStorage.removeItem(`compendium-interviewer-draft-${lobbyId}`) } catch { }

    type PopupHost = Window & { __compendiumInterviewerWindow?: Window | null }
    ;(window as PopupHost).__compendiumInterviewerWindow?.close()

    await stopRecordingAndFinalize('candidate_ended', false)
    setEndSessionActionInProgress(false)
    setEndSessionSavedKind('unrated')
    setEndSessionSavedVisible(true)
  }, [endSessionActionInProgress, lobbyId, stopRecordingAndFinalize])

  const handleEndSessionDrop = useCallback(async () => {
    if (endSessionActionInProgress || !lobbyId) return
    setEndSessionActionInProgress(true)
    endSessionInitiatedRef.current = true
    completionHandledRef.current = true
    setWindowClosedOverlayVisible(false)
    setCaptureErrorOverlayVisible(false)
    setEndSessionOverlayKind(null)

    teardownMedia()

    try {
      await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/abandon`, {})
    } catch {
      // Non-fatal
    }

    type PopupHost = Window & { __compendiumInterviewerWindow?: Window | null }
    ;(window as PopupHost).__compendiumInterviewerWindow?.close()

    setEndSessionActionInProgress(false)
    setEndSessionOverlayKind(null)
    router.replace('/')
  }, [endSessionActionInProgress, lobbyId, teardownMedia, router])

  useEffect(() => {
    let unsubscribeSession = () => {}
    let pollTimer: ReturnType<typeof setInterval> | null = null
    const sessionRef = lobbyId ? sessionDoc(lobbyId) : null

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
          setFeedbackSubmitted(true)
          void handleSessionCompleted('feedback_submitted')
          return
        }
        if (!lobbyId && String(data.caseId) === caseIdRef.current) {
          setFeedbackSubmitted(true)
          void handleSessionCompleted('feedback_submitted')
        }
      } catch {
        // Ignore malformed localStorage payloads.
      }
    }

    const routeIfCompleted = (raw: SessionState | null) => {
      if (!raw) return
      if (raw.caseName) setCaseName(raw.caseName)
      setPreferredRecordingMode(resolveSessionMode(raw.sessionMode))
      if (raw.status === 'in_progress' && autoStartAttemptedRef.current) {
        // Only mark as "was in progress" once we've already started recording.
        // On a fresh case load the first snapshot delivers in_progress before
        // auto-start fires, so we'd incorrectly show the refresh overlay.
        sessionWasInProgressRef.current = true
      }
      if (raw.status === 'completed') {
        const stopReason = raw.completedBy === 'candidate' ? 'candidate_ended' : 'feedback_submitted'
        if (stopReason === 'feedback_submitted') setFeedbackSubmitted(true)
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
                setSessionIssue("We can't find this session right now. Ask the interviewer to pick a case, or try refreshing.")
                return
              }
              setSessionIssue('')
              routeIfCompleted(snapshot.data() as SessionState)
            } catch {
              setSessionIssue('Connection unstable. Hang tight, reconnecting...')
            }
          }, 4000)
        }

        unsubscribeSession = onSnapshot(
          sessionRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              setSessionIssue("We can't find this session right now. Ask the interviewer to pick a case, or try refreshing.")
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
      if (event.key === 'compendium-session-ended') {
        parseAndHandleEnded(event.newValue)
      }
      if (event.key === 'compendium-interviewer-window' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue)
          if (data?.lobbyId === lobbyId) {
            // If active:false fired because the interviewer navigated within
            // the popup (e.g. pressed back), the popup window itself is still
            // open. Trust the 2s poll over this storage signal in that case.
            type PopupHost = Window & { __compendiumInterviewerWindow?: Window | null }
            const popup = (window as PopupHost).__compendiumInterviewerWindow
            const popupStillOpen = popup && !popup.closed
            if (!data.active && popupStillOpen) return
            if (!data.active && endSessionInitiatedRef.current) return
            setInterviewerWindowClosed(!data.active)
          }
        } catch {
          // Ignore malformed payloads.
        }
      }
    }

    window.addEventListener('storage', onStorage)
    return () => {
      clearPoll()
      unsubscribeSession()
      window.removeEventListener('storage', onStorage)
    }
  }, [handleSessionCompleted, lobbyId, params, requestedMode, resolveSessionMode, router])

  useEffect(() => {
    // useMicPermission already subscribes to PermissionStatus.onchange, so
    // most state syncing is automatic. We still re-query on focus and
    // visibility because some browsers don't fire the change event when
    // the user grants permission via the address-bar lock icon (the
    // canonical way to recover from a previous denial).
    if (preferredRecordingMode !== 'local' || typeof window === 'undefined') return

    const handleWindowFocus = () => void retryMicrophonePermission()
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      void retryMicrophonePermission()
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [preferredRecordingMode, retryMicrophonePermission])

  useEffect(() => {
    if (autoStartAttemptedRef.current) return
    if (!lobbyId || !resolvedCaseId || !currentUser) return
    if (!canStartRecording) return
    // Skip auto-start when mic is denied — calling getUserMedia would fail
    // silently, leaving the user staring at a frozen UI. The soft-warning
    // banner surfaces the situation and lets them recover; once permission
    // flips to granted we reset autoStartAttemptedRef and try again.
    if (microphonePermissionState === 'denied') return

    autoStartAttemptedRef.current = true
    // Show the "recording restarted" overlay if either:
    // - onSnapshot already told us the session was in_progress before we started
    //   (sessionWasInProgressRef, set only after auto-start ran once), or
    // - the dedicated reload flag was set in beforeunload before the page reloaded.
    const RELOAD_FLAG = `compendium-was-reloaded-${lobbyId ?? ''}`
    const wasReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'
    if (sessionWasInProgressRef.current || wasReloaded) {
      sessionStorage.removeItem(RELOAD_FLAG)
      setRefreshInterruptedVisible(true)
    }
    setRecordingNote(
      preferredRecordingMode === 'remote'
        ? 'Preparing remote capture setup...'
        : 'Auto-starting microphone capture...'
    )
    void startCaptureFlow(preferredRecordingMode)
  }, [canStartRecording, currentUser, lobbyId, microphonePermissionState, preferredRecordingMode, resolvedCaseId, startCaptureFlow])

  // Reload guard — intercepts reload triggers while recording is active.
  // Two separate sessionStorage keys:
  //   RELOAD_WARN_KEY  — counts warnings shown this recording session (0/1/2, cycles back)
  //   RELOAD_FLAG_KEY  — set just before an actual reload so post-reload overlay fires
  const RELOAD_WARN_KEY = `compendium-reload-warnings-${lobbyId ?? ''}`
  const RELOAD_FLAG_KEY = `compendium-was-reloaded-${lobbyId ?? ''}`

  // keydown fires BEFORE beforeunload — keyboard shortcuts (F5, Ctrl+R, Cmd+R) are
  // intercepted here so our overlay appears with no browser dialog at all.
  // Sets isReloadIntentRef so the beforeunload handler below knows it's a reload
  // (not a tab close) and can apply reload-specific logic.
  const RELOAD_PLATFORM_KEY = `compendium-platform-reload-${lobbyId ?? ''}`
  useEffect(() => {
    if (recordingState !== 'recording' && recordingState !== 'uploading') return
    const onKeyDown = (event: KeyboardEvent) => {
      const isReloadKey =
        event.key === 'F5' ||
        ((event.ctrlKey || event.metaKey) && event.key === 'r')
      if (!isReloadKey) return
      event.preventDefault()
      isReloadIntentRef.current = true
      if (recordingState === 'uploading') {
        // During upload, always show the upload-specific warning (no count logic)
        setWarnBeforeReloadVisible(true)
        setTimeout(() => { isReloadIntentRef.current = false }, 500)
        return
      }
      const count = parseInt(sessionStorage.getItem(RELOAD_WARN_KEY) ?? '0', 10)
      if (count >= 2) {
        sessionStorage.setItem(RELOAD_FLAG_KEY, '1')
        sessionStorage.setItem(RELOAD_WARN_KEY, '0')
        sessionStorage.setItem(RELOAD_PLATFORM_KEY, '1')
        window.location.reload()
        return
      }
      setWarnBeforeReloadVisible(true)
      sessionStorage.setItem(RELOAD_WARN_KEY, String(count + 1))
      // Reset after a tick — if beforeunload fires, it reads the flag synchronously
      setTimeout(() => { isReloadIntentRef.current = false }, 500)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState, RELOAD_WARN_KEY, RELOAD_FLAG_KEY, RELOAD_PLATFORM_KEY])

  // beforeunload fires for reload button AND tab-close AND address-bar navigation.
  // We distinguish reload from close via isReloadIntentRef (set by keydown above).
  // Both paths call event.preventDefault() so the browser shows "Leave site?" —
  // if the user clicks Stay, our overlay renders on the next tick.
  // pagehide is registered separately as a reliable final signal for the interviewer.
  useEffect(() => {
    if (recordingState !== 'recording' && recordingState !== 'uploading') return

    const writeAbandonedSignal = () => {
      if (!lobbyId) return
      try {
        localStorage.setItem('compendium-candidate-abandoned', JSON.stringify({ lobbyId, ts: Date.now() }))
      } catch { }
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (sessionStorage.getItem(RELOAD_PLATFORM_KEY) === '1') return
      // Write the abandoned signal immediately so the interviewer popup is
      // notified. If user clicks Stay, the signal is stale (30s window) but
      // the interviewer overlay auto-dismisses, so that's fine.
      writeAbandonedSignal()
      // Keyboard reloads (F5/Ctrl+R/Cmd+R) are already fully intercepted by
      // the keydown handler above before beforeunload ever fires — they never
      // reach here. Everything that reaches this handler is a browser-button
      // action (reload button or close button/Cmd+W), which are
      // indistinguishable. Show the generic leave warning for both.
      setWarnBeforeCloseVisible(true)
      event.preventDefault()
    }

    // pagehide fires more reliably than beforeunload when the tab is actually
    // closing (Chrome may defer/drop beforeunload writes on real close).
    // We use it as a belt-and-suspenders signal for the interviewer popup.
    const onPageHide = () => { writeAbandonedSignal() }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState, lobbyId, RELOAD_WARN_KEY, RELOAD_FLAG_KEY, RELOAD_PLATFORM_KEY])

  // Back-button / forward-button guard.
  // Pushes a dummy history entry when recording is active so that pressing
  // the browser back button fires `popstate` instead of navigating away.
  // On popstate we re-push the dummy entry (keeping the user on this page)
  // and show the leave-confirm overlay. When the user chooses "Leave anyway"
  // we pop the dummy entry ourselves, then navigate to the dashboard.
  const leaveConfirmFromPopstateRef = useRef(false)
  useEffect(() => {
    const isActive = recordingState === 'recording' || recordingState === 'uploading'
    if (!isActive) return
    history.pushState(null, '', window.location.href)
    const onPopState = () => {
      history.pushState(null, '', window.location.href)
      leaveConfirmFromPopstateRef.current = true
      if (recordingState === 'recording' && lobbyId) {
        // During active recording: show rated/unrated end-session flow (same as End Session button)
        void handleCandidateEndSession()
      } else {
        // During upload: show the simple upload-in-progress warning
        setLeaveConfirmVisible(true)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [recordingState])


  // Poll every 2s to detect if the interviewer popup was closed.
  // The lobby stores the popup reference on window.__compendiumInterviewerWindow
  // before router.replace fires. Since Next.js client-side navigation does NOT
  // replace the window object, that reference survives the route change and is
  // readable here. This is the only reliable method — beforeunload/pagehide
  // writes from a popup are dropped by Chrome before flushing to localStorage.
  useEffect(() => {
    if (preferredRecordingMode !== 'local') return
    type PopupHost = Window & { __compendiumInterviewerWindow?: Window | null }
    const interval = setInterval(() => {
      const host = window as PopupHost
      const win = host.__compendiumInterviewerWindow
      if (!win) {
        // Reference missing — could be a hard refresh. Try to reclaim via named window.
        const named = window.open('', 'InterviewerControl')
        if (named && !named.closed) {
          host.__compendiumInterviewerWindow = named
          named.blur()
          window.focus()
          setInterviewerWindowClosed(false)
        }
        return
      }
      if (win.closed) {
        if (!endSessionInitiatedRef.current) setInterviewerWindowClosed(true)
      } else {
        setInterviewerWindowClosed(false)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [preferredRecordingMode])

  // Drive the overlay and title pulse from interviewerWindowClosed.
  // When the window reopens, clear immediately. When it closes, show the
  // overlay — but only if it isn't already visible (so a dismissed+reshow
  // cycle isn't interrupted by the 2s poll re-setting state unnecessarily).
  useEffect(() => {
    if (preferredRecordingMode !== 'local') return
    // Suppress when candidate has already initiated end session (they closed the window deliberately)
    if (endSessionInitiatedRef.current) {
      stopTitlePulse()
      setWindowClosedOverlayVisible(false)
      return
    }
    // Interviewer closing after submitting feedback is expected — don't show the overlay.
    if (feedbackSubmitted) {
      stopTitlePulse()
      setWindowClosedOverlayVisible(false)
      return
    }
    if (interviewerWindowClosed) {
      startTitlePulse()
      setWindowClosedOverlayVisible((prev) => prev ? prev : true)
    } else {
      if (windowClosedReshowTimerRef.current) {
        clearTimeout(windowClosedReshowTimerRef.current)
        windowClosedReshowTimerRef.current = null
      }
      // Don't kill a pulse that mic-blocked started — only stop if mic is fine.
      if (microphonePermissionState !== 'denied') stopTitlePulse()
      setWindowClosedOverlayVisible(false)
    }
  }, [feedbackSubmitted, interviewerWindowClosed, microphonePermissionState, preferredRecordingMode, startTitlePulse, stopTitlePulse])

  // Drive the upload-fail overlay from completionPending + failed state.
  useEffect(() => {
    if (completionPending && recordingState === 'failed') {
      setUploadFailOverlayVisible((prev) => (prev ? prev : true))
    } else {
      if (uploadFailReshowTimerRef.current) {
        clearTimeout(uploadFailReshowTimerRef.current)
        uploadFailReshowTimerRef.current = null
      }
      setUploadFailOverlayVisible(false)
    }
  }, [completionPending, recordingState])

  // Drive the mic-blocked overlay from microphonePermissionState (local mode only).
  // Title pulse starts immediately; overlay reshows after 1.5s if still blocked.
  useEffect(() => {
    if (!isLocalSession) return
    if (microphonePermissionState === 'denied') {
      startTitlePulse()
      setMicBlockedOverlayVisible((prev) => (prev ? prev : true))
    } else {
      if (micBlockedReshowTimerRef.current) {
        clearTimeout(micBlockedReshowTimerRef.current)
        micBlockedReshowTimerRef.current = null
      }
      stopTitlePulse()
      setMicBlockedOverlayVisible(false)
    }
  // isLocalSession is derived from preferredRecordingMode which is stable after mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphonePermissionState])

  // Drive the session-issue overlay from sessionIssue. Shows immediately on
  // error, auto-clears when the session doc reappears. Uses the same
  // dismiss+reshow pattern as the interviewer-window-closed overlay.
  useEffect(() => {
    if (sessionIssue) {
      setSessionIssueOverlayVisible((prev) => (prev ? prev : true))
    } else {
      if (sessionIssueReshowTimerRef.current) {
        clearTimeout(sessionIssueReshowTimerRef.current)
        sessionIssueReshowTimerRef.current = null
      }
      setSessionIssueOverlayVisible(false)
    }
  }, [sessionIssue])

  useEffect(() => {
    return () => {
      clearLocalPrep()
      clearRemotePrep()
      teardownMedia()
    }
  }, [clearLocalPrep, clearRemotePrep, teardownMedia])

  const isLocalSession = preferredRecordingMode === 'local'

  // ── Dynamic header text ───────────────────────────────────────────────────
  const wsH1Primary = feedbackSubmitted ? 'Wrapping up' : 'Interview Session'
  const wsH1Secondary = feedbackSubmitted ? 'your session' : 'in Progress'
  const wsSubtitle = feedbackSubmitted
    ? 'Feedback is in. Finishing your session and saving everything now.'
    : caseName
      ? `Running: ${caseName}`
      : 'Stay here while this session moves through recording and review.'

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
      normalizedRecordingError.includes('gesture') ||
      // Auto-start without a fresh user activation throws this — never the
      // user's fault, never a state worth showing as a hard error.
      normalizedRecordingError.includes('invalid state'))
  // For the pill we treat "recoverable failure" the same as idle from the
  // user's perspective: they haven't done anything wrong, they just need to
  // press the button. Only show "Needs attention" for genuine non-recoverable
  // errors (Firebase / network / unknown DOMException paths the catch
  // doesn't recognise).
  const isWaitingForUserStart =
    recordingState === 'idle' || (recordingState === 'failed' && isRecoverableCaptureError)
  const endingSessionNowForPill = endSessionActionInProgress || endSessionInitiatedRef.current
  const statusPillLabel =
    endingSessionNowForPill
      ? 'Wrapping up'
      : recordingState === 'recording'
      ? 'Live'
      : recordingState === 'starting'
        ? 'Preparing'
        : recordingState === 'stopping'
          ? 'Wrapping up'
          : recordingState === 'uploading'
            ? 'Syncing'
            : recordingState === 'uploaded'
              ? 'Ready'
              : isWaitingForUserStart
                ? 'Ready when you are'
                : 'Needs attention'
  const statusPillTone =
    endingSessionNowForPill
      ? 'working'
      : recordingState === 'recording'
      ? 'live'
      : recordingState === 'starting' || recordingState === 'stopping' || recordingState === 'uploading'
        ? 'working'
        : recordingState === 'uploaded'
          ? 'success'
          : isWaitingForUserStart
            ? 'idle'
            : 'warn'
  const recoverableCaptureMessage = isRecoverableCaptureError
    ? getFriendlyRecoverableCaptureMessage(
        preferredRecordingMode,
        `${captureWarning} ${recordingError}`.trim()
      )
    : ''
  const persistentRecordingError = isRecoverableCaptureError ? '' : recordingError

  // Drive recoverable capture-error overlay — must be after isRecoverableCaptureError is declared.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (isRecoverableCaptureError && !endSessionInitiatedRef.current) {
      setCaptureErrorOverlayVisible((prev) => (prev ? prev : true))
    } else {
      if (captureErrorReshowTimerRef.current) {
        clearTimeout(captureErrorReshowTimerRef.current)
        captureErrorReshowTimerRef.current = null
      }
      setCaptureErrorOverlayVisible(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecoverableCaptureError])

  // Drive persistent recording-error overlay — must be after persistentRecordingError is declared.
  // This overlay is ONLY for a failed capture START (recording never began, e.g.
  // mic/permission failure on launch). It must NOT fire for:
  //  - upload failures (completionPending): those are owned by the upload-fail
  //    overlay, which has correct retry-upload wording and logic. Showing the
  //    "Recording couldn't start / check your microphone" copy there is wrong
  //    and confusing (recording already happened; it's the upload that failed).
  //  - a session that is wrapping up (feedbackSubmitted) or an end-session the
  //    candidate initiated: recording stops on purpose, not as an error.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const isCaptureStartFailure =
      !!persistentRecordingError &&
      !completionPending &&
      !feedbackSubmitted &&
      !endSessionInitiatedRef.current
    setPersistentErrorOverlayVisible(isCaptureStartFailure)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistentRecordingError, completionPending, feedbackSubmitted])

  const workflowCurrentStep = feedbackSubmitted
    ? 4
    : (recordingState === 'uploading' || (recordingState === 'uploaded' && !completionPending)) ? 4 : 3
  const workflowSteps = isLocalSession
    ? [
        { num: '01', text: 'Controls ready' },
        { num: '02', text: 'Case in session' },
        { num: '03', text: feedbackSubmitted ? 'Feedback submitted' : 'Allow recording' },
        { num: '04', text: 'Review dashboard' },
      ]
    : [
        { num: '01', text: 'Send invite' },
        { num: '02', text: 'Case in session' },
        { num: '03', text: feedbackSubmitted ? 'Feedback submitted' : 'Allow recording' },
        { num: '04', text: 'Review dashboard' },
      ]
  // Idle and failed-but-recoverable both mean the same thing from the user's
  // POV — they need to click Allow Recording to start. Phrase the copy that
  // way (an instruction, not a status diagnosis) so a candidate on their
  // first view isn't told "needs attention" or "try again" for a thing they
  // never actually tried. Reuses isWaitingForUserStart defined above.
  // Once the candidate has triggered an end-session action, the workspace is
  // wrapping up — never surface a recording-error state, since recording is
  // stopping on purpose (and may never have started, in the unrated case).
  const isEndingSessionNow = endSessionActionInProgress || endSessionInitiatedRef.current
  const workspaceStatusTitle =
    isEndingSessionNow
      ? 'Wrapping up this session'
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
              : isWaitingForUserStart
                ? 'Click Allow Recording to start'
                : 'Recording couldn’t start'
  const workspaceStatusDescription =
    isEndingSessionNow
      ? 'Saving your session and heading to the dashboard.'
      : recordingState === 'starting'
      ? (isLocalSession ? 'Allow microphone access when Chrome asks.' : 'Choose the meeting tab and turn on Share audio when Chrome asks.')
      : recordingState === 'recording'
        ? 'Closing or reloading this tab will lose your recording. Keep it open until the session ends.'
        : recordingState === 'stopping'
          ? 'Saving your recording before you leave this page.'
          : recordingState === 'uploading'
            ? 'Finishing the recording and transcript in the background.'
            : recordingState === 'uploaded'
              ? 'You can move to the dashboard now.'
              : isWaitingForUserStart
                ? (isLocalSession
                    ? 'When you press the button below, Chrome will ask for microphone access.'
                    : 'When you press the button below, Chrome will ask you to choose a meeting tab — turn on Share audio.')
                : recoverableCaptureMessage || 'Use the Allow Recording button below to try again.'

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
        <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4 sm:px-6 md:px-10 lg:px-12">
          <div className="flex items-center gap-1 text-left">
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
          </div>
        </div>
      </header>

      {uploadFailOverlayVisible ? (
        <LobbyOverlay
          key="upload-fail"
          type="error"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          }
          title="Upload didn't go through"
          body="Your recording is still here. Tap Retry to try again, or leave now and lose the audio permanently."
          actionLabel="Retry upload"
          onAction={() => void handleRetryUpload()}
          onDismiss={() => {
            setUploadFailOverlayVisible(false)
            if (uploadFailReshowTimerRef.current) clearTimeout(uploadFailReshowTimerRef.current)
            uploadFailReshowTimerRef.current = setTimeout(() => {
              uploadFailReshowTimerRef.current = null
              if (completionPending && recordingState === 'failed') setUploadFailOverlayVisible(true)
            }, 1500)
          }}
        />
      ) : null}

      {warnBeforeReloadVisible ? (() => {
        const isUploading = recordingState === 'uploading'
        const warnCount = parseInt(sessionStorage.getItem(RELOAD_WARN_KEY) ?? '0', 10)
        const isFinalWarning = !isUploading && warnCount >= 2
        return (
          <LobbyOverlay
            key="warn-before-reload"
            type="warning"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            }
            title={
              isUploading
                ? "Your audio is uploading right now"
                : isFinalWarning
                  ? "One more reload and we let you go"
                  : "Heads up: reloading will lose your recording"
            }
            body={
              isUploading
                ? "Reloading now would cut the upload and your audio would be lost. It wraps up on its own, just wait a moment."
                : isFinalWarning
                  ? "You have tried to reload twice now. The next reload will go through and your recording will be gone. Stay on the page to keep it."
                  : "Reloading stops the mic and wipes everything captured so far. A new recording will start fresh. Stay on the page to keep what you have."
            }
            autoDismissMs={isUploading ? 8000 : isFinalWarning ? 8000 : 6000}
            actionLabel="Stay on page"
            onAction={() => setWarnBeforeReloadVisible(false)}
            onDismiss={() => setWarnBeforeReloadVisible(false)}
          />
        )
      })() : null}

      {warnBeforeCloseVisible ? (() => {
        const isUploadingNow = (recordingState as string) === 'uploading'
        return (
          <LobbyOverlay
            key="warn-before-close"
            type="warning"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            }
            title={isUploadingNow ? "Your audio is uploading right now" : "Leaving will lose your recording"}
            body={
              isUploadingNow
                ? "Closing or reloading now would cut the upload and your audio would be lost. It finishes on its own, just give it a few seconds."
                : "You tried to close or reload this tab. If you go through with it, the mic stops and everything recorded so far is gone."
            }
            autoDismissMs={8000}
            actionLabel="Stay on page"
            onAction={() => setWarnBeforeCloseVisible(false)}
            onDismiss={() => setWarnBeforeCloseVisible(false)}
          />
        )
      })() : null}

      {leaveConfirmVisible ? (
        <LobbyOverlay
          key="leave-confirm"
          type="warning"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
          title={recordingState === 'uploading' ? "Your audio is uploading right now" : "Leave and save audio?"}
          body={
            recordingState === 'uploading'
              ? "Going back now would cut the upload and your audio would be lost. Just hang tight, it finishes on its own in a few seconds."
              : "Leaving will stop the mic and save what's recorded so far. If the interviewer rates it, you'll see their feedback in the dashboard. Either way, the case will show up there."
          }
          autoDismissMs={12000}
          actionLabel={recordingState === 'uploading' ? undefined : (leavingInProgress ? "Saving..." : "Leave and save")}
          onAction={recordingState === 'uploading' ? undefined : async () => {
            if (leavingInProgress) return
            setLeavingInProgress(true)
            const wasRecording = recordingState === 'recording' || recordingState === 'stopping'
            try {
              if (recordingState === 'recording') {
                await stopRecordingAndFinalize('user_navigated_away', false)
              }
              if (lobbyId && wasRecording) {
                try {
                  localStorage.setItem('compendium-candidate-abandoned', JSON.stringify({ lobbyId, ts: Date.now() }))
                } catch { }
                try { await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/abandon`, {}) } catch { }
              }
              setLeaveConfirmVisible(false)
              setLeaveSavedOverlayVisible(true)
            } catch {
              leaveConfirmFromPopstateRef.current = false
              router.replace('/dashboard')
            }
          }}
          onDismiss={() => {
            setLeaveConfirmVisible(false)
            setLeavingInProgress(false)
            leaveConfirmFromPopstateRef.current = false
          }}
        />
      ) : null}

      {leaveSavedOverlayVisible ? (
        <LobbyOverlay
          key="leave-saved"
          type="info"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
          title="Audio saved. Heading to dashboard."
          body="Your audio is saved. If the interviewer rates it, you'll see their feedback in the dashboard. Either way, the case will show up there."
          autoDismissMs={4000}
          onDismiss={() => {
            setLeaveSavedOverlayVisible(false)
            leaveConfirmFromPopstateRef.current = false
            router.replace('/dashboard')
          }}
        />
      ) : null}

      {endSessionOverlayKind === 'rated' ? (
        <LobbyOverlay
          key="end-session-rated"
          type="warning"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          title="Ready to wrap up?"
          body="The interviewer has rated the session. You can save your audio and end the case, or drop the whole thing if something went wrong."
          actionLabel={endSessionActionInProgress ? "Saving..." : "Save and end"}
          onAction={() => void handleEndSessionSaveAndEnd()}
          secondaryActionLabel="Drop session"
          onSecondaryAction={() => void handleEndSessionDrop()}
          onDismiss={() => {
            if (!endSessionActionInProgress) setEndSessionOverlayKind(null)
          }}
        />
      ) : null}

      {endSessionOverlayKind === 'unrated' ? (
        <LobbyOverlay
          key="end-session-unrated"
          type="warning"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          title="End session early?"
          body="The interviewer hasn't finished rating yet. You can save your audio and end now, the case will appear in your dashboard as unrated. Or drop it entirely."
          actionLabel={endSessionActionInProgress ? "Saving..." : "Save audio"}
          onAction={() => void handleEndSessionSaveAudio()}
          secondaryActionLabel="Drop session"
          onSecondaryAction={() => void handleEndSessionDrop()}
          onDismiss={() => {
            if (!endSessionActionInProgress) setEndSessionOverlayKind(null)
          }}
        />
      ) : null}

      {endSessionSavedVisible ? (
        <LobbyOverlay
          key="end-session-saved"
          type="info"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
          title="Session saved. Heading to dashboard."
          body={endSessionSavedKind === 'rated'
            ? "Ratings and audio saved. The case is in your dashboard."
            : "Audio saved. The case is in your dashboard as unrated."}
          autoDismissMs={4000}
          onDismiss={() => {
            setEndSessionSavedVisible(false)
            router.replace('/dashboard')
          }}
        />
      ) : null}

      {refreshInterruptedVisible ? (
        <LobbyOverlay
          key="refresh-interrupted"
          type="info"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.87" />
            </svg>
          }
          title="Fresh recording started"
          body="The page reloaded mid-session, so the previous audio is gone. A new recording has started from right now."
          autoDismissMs={6000}
          onDismiss={() => setRefreshInterruptedVisible(false)}
        />
      ) : null}

      {sessionCompleteOverlayVisible ? (
        <LobbyOverlay
          key="session-complete"
          type="info"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
          title="All done!"
          body="Your interviewer has submitted feedback. Taking you to your results now..."
          autoDismissMs={3000}
          onDismiss={() => {
            if (sessionCompleteRouteRef.current) return
            sessionCompleteRouteRef.current = true
            router.replace('/dashboard')
          }}
        />
      ) : null}

      {micBlockedOverlayVisible && isLocalSession ? (
        <LobbyOverlay
          key="mic-blocked"
          type="warning"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          }
          title="Mic is blocked"
          body="Without mic access we can't record your audio or generate AI feedback. Click the lock icon in your address bar, set Microphone to Allow, then tap the button below."
          actionLabel="Allow mic"
          onAction={() => void handleBannerAllow()}
          onDismiss={() => {
            setMicBlockedOverlayVisible(false)
            if (micBlockedReshowTimerRef.current) clearTimeout(micBlockedReshowTimerRef.current)
            micBlockedReshowTimerRef.current = setTimeout(() => {
              micBlockedReshowTimerRef.current = null
              if (microphonePermissionState === 'denied') setMicBlockedOverlayVisible(true)
            }, 1500)
          }}
        />
      ) : null}

      {windowClosedOverlayVisible && lobbyId && resolvedCaseId ? (
        <LobbyOverlay
          key="interviewer-window-closed"
          type="warning"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          }
          title="Interviewer window closed"
          body={(() => {
            const draft = readDraftScores(lobbyId)
            const allRated = draft !== null && isDraftAllRated(draft.scores)
            if (recordingState === 'recording') {
              return allRated
                ? "The interviewer has rated all four parameters but closed their window before submitting. You can reopen it so they can submit, or just end the session and the ratings will be saved."
                : "The interviewer closed their window and hasn't finished rating yet. You can reopen it for them to continue, or end the session now and the case will be marked unrated."
            }
            return allRated
              ? "The interviewer has rated all four parameters. Reopen their window to let them submit, or end the session to save what's there."
              : "The interviewer closed their window without finishing the rating. Reopen it to continue, or end the session."
          })()}
          actionLabel="Reopen window"
          onAction={() => {
            const url = `/case/${resolvedCaseId}/interviewer?lobby=${encodeURIComponent(lobbyId)}&role=interviewer&sessionMode=local`
            type PopupHost = Window & { __compendiumInterviewerWindow?: Window | null }
            const win = window.open(url, 'InterviewerControl', 'popup=yes,resizable=yes,width=800,height=800')
            if (win) {
              ;(window as PopupHost).__compendiumInterviewerWindow = win
              win.focus()
            }
          }}
          secondaryActionLabel={recordingState === 'recording' ? "End session" : undefined}
          onSecondaryAction={recordingState === 'recording' ? () => {
            setWindowClosedOverlayVisible(false)
            if (windowClosedReshowTimerRef.current) clearTimeout(windowClosedReshowTimerRef.current)
            void handleCandidateEndSession()
          } : undefined}
          onDismiss={() => {
            setWindowClosedOverlayVisible(false)
            // If the window is still closed, re-show after 1.5s so the
            // candidate can't permanently dismiss a blocking issue.
            if (windowClosedReshowTimerRef.current) clearTimeout(windowClosedReshowTimerRef.current)
            windowClosedReshowTimerRef.current = setTimeout(() => {
              windowClosedReshowTimerRef.current = null
              // Only reshow if the window is still actually closed
              setInterviewerWindowClosed((closed) => {
                if (closed && !endSessionInitiatedRef.current) setWindowClosedOverlayVisible(true)
                return closed
              })
            }, 1500)
          }}
        />
      ) : null}

      {sessionIssueOverlayVisible ? (
        <LobbyOverlay
          key="session-issue"
          type="warning"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 6s4-2 11-2 11 2 11 2" />
              <path d="M1 10s4-2 11-2 11 2 11 2" />
              <line x1="1" y1="14" x2="23" y2="14" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          }
          title="Session not found"
          body={sessionIssue}
          onDismiss={() => {
            setSessionIssueOverlayVisible(false)
            if (sessionIssueReshowTimerRef.current) clearTimeout(sessionIssueReshowTimerRef.current)
            sessionIssueReshowTimerRef.current = setTimeout(() => {
              sessionIssueReshowTimerRef.current = null
              setSessionIssue((issue) => {
                if (issue) setSessionIssueOverlayVisible(true)
                return issue
              })
            }, 1500)
          }}
        />
      ) : null}

      {captureErrorOverlayVisible ? (
        <LobbyOverlay
          key="capture-error"
          type="warning"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
          title="Recording hiccup"
          body={recoverableCaptureMessage || "Something interrupted the recording. Tap Allow Recording below to start again."}
          actionLabel="Allow recording"
          onAction={handleEnableCapture}
          onDismiss={() => {
            setCaptureErrorOverlayVisible(false)
            if (captureErrorReshowTimerRef.current) clearTimeout(captureErrorReshowTimerRef.current)
            captureErrorReshowTimerRef.current = setTimeout(() => {
              captureErrorReshowTimerRef.current = null
              if (isRecoverableCaptureError) setCaptureErrorOverlayVisible(true)
            }, 1500)
          }}
        />
      ) : null}

      {persistentErrorOverlayVisible ? (
        <LobbyOverlay
          key="persistent-error"
          type="error"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          }
          title="Recording couldn't start"
          body="We weren't able to access your microphone. Check that your browser has mic permission, then try again."
          actionLabel="Try again"
          onAction={handleEnableCapture}
          onDismiss={() => setPersistentErrorOverlayVisible(false)}
        />
      ) : null}

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
              {wsH1Primary} <span className="text-[#3D5A35]">{wsH1Secondary}</span>
            </h1>
            <p className="mt-4 max-w-[620px] pl-[2px] text-[13px] leading-relaxed text-[#5c4033]/62">
              {wsSubtitle}
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
                <div className="relative grid gap-5 grid-cols-2 md:grid-cols-4">
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
                  <div className="relative grid gap-2 grid-cols-1 sm:grid-cols-3">
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




              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {(recordingState === 'idle' || recordingState === 'failed' || prepVisible) ? (
                  <button
                    type="button"
                    onClick={handleEnableCapture}
                    disabled={!canStartRecording || !resolvedCaseId || prepVisible}
                    className="workspace-btn workspace-btn-primary rounded-full px-5 py-3 text-[10px] uppercase tracking-[0.22em] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prepVisible
                      ? 'Opening Prompt...'
                      : localPermissionBlocked
                        ? 'Allow Microphone'
                        : 'Allow Recording'}
                  </button>
                ) : null}
                {!completionPending ? (
                  <button
                    type="button"
                    onClick={() => void handleCandidateEndSession()}
                    disabled={endingSession || recordingState === 'stopping' || recordingState === 'uploading' || recordingState === 'uploaded'}
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

    </div>
  )
}

function activeBeforeUnloadState(value: RecordingState): boolean {
  return value === 'recording' || value === 'stopping' || value === 'uploading' || value === 'failed'
}

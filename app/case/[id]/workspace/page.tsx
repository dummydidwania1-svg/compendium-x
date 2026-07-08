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
import { releaseDisplayMedia } from '@/lib/permissions/displayMedia'
import { writeCandidateBeat } from '@/lib/session/candidateTab'
import { consumePrimedRecording, clearPrimedMic, micDebug } from '@/lib/session/primedMic'

type SessionState = {
  status?: 'waiting' | 'in_progress' | 'completed' | 'abandoned' | 'replacing'
  caseId?: string
  caseName?: string
  completedBy?: string
  sessionMode?: RecordingMode
  /** Server timestamp written by select-case; used as timing anchor for dual-mic merge. */
  selectedAt?: { toMillis: () => number }
  /** Set to false by the interviewer when they decline mic twice in remote mode. */
  interviewerAudioCaptured?: boolean
  /** Mirrors the interviewer's live draft: true once all 4 rating sliders are filled in (remote mode only). */
  interviewerDraftAllRated?: boolean
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

const MIME_TYPE_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

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

// C8 — detect the user's browser so we can show the right share-audio / mic
// prompt copy. Evaluated once per page load (userAgent never changes mid-session).
type BrowserName = 'chrome' | 'edge' | 'safari' | 'firefox' | 'other'
function detectBrowser(): BrowserName {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (ua.includes('Edg/') || ua.includes('EdgA/')) return 'edge'
  if (ua.includes('Chrome/')) return 'chrome'
  if (ua.includes('Safari/') && ua.includes('Version/')) return 'safari'
  if (ua.includes('Firefox/')) return 'firefox'
  return 'other'
}
const BROWSER = detectBrowser()

// Returns the browser-appropriate verb phrase for the share-audio prompt, e.g.
// "when Chrome asks" vs "when the dialog appears".
function shareAudioPrompt(): string {
  if (BROWSER === 'chrome') return 'when Chrome asks'
  if (BROWSER === 'edge') return 'when Edge asks'
  if (BROWSER === 'safari') return 'when Safari asks'
  return 'when the dialog appears'
}
function micPrompt(): string {
  if (BROWSER === 'chrome') return 'when Chrome asks'
  if (BROWSER === 'edge') return 'when Edge asks'
  if (BROWSER === 'safari') return 'when Safari asks'
  return 'when the dialog appears'
}

function getFriendlyRecoverableCaptureMessage(_mode: RecordingMode, message: string): string {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('permission') ||
    normalized.includes('notallowed') ||
    normalized.includes('denied')
  ) {
    return 'Microphone is blocked. Click the lock icon in your address bar and set Microphone to Allow.'
  }
  return 'Allow microphone access to continue.'
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
              The case book a million readers grew up on. Now built to coach you.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-3 md:gap-x-12">
            <Link href="/" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
              Home
            </Link>
            <Link href="/about-ccx" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
              The Platform
            </Link>
            <Link href="/our-story" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
              The Team
            </Link>
            <Link href="/collaborators" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
              Acknowledgements
            </Link>
            <a href="mailto:contact@casecompendiumx.in?subject=Case%20CompendiumX%20Query" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
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
  const recordingStateRef = useRef<RecordingState>('idle')
  useEffect(() => { recordingStateRef.current = recordingState }, [recordingState])
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
  const [interviewerAudioDeclined, setInterviewerAudioDeclined] = useState(false)
  const interviewerDeclineShownRef = useRef(false)
  // Mirrors the interviewer's live draft-rating completeness (remote mode only —
  // see checkRatingStatus). Stays false forever in local mode.
  const interviewerDraftAllRatedRef = useRef(false)
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
  // The candidate can opt to run the case without recording (no audio/transcript).
  // Once set, the mic-blocked overlay never re-appears and auto-start is skipped.
  // Backed by sessionStorage (keyed by lobby) so a decline made on the practice
  // page survives the lobby → workspace hop, and survives reloads within the tab.
  const [recordingConsentDeclined, setRecordingConsentDeclined] = useState(false)
  const recordingConsentDeclinedRef = useRef(false)

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
    if (candidateFlushTimerRef.current) clearInterval(candidateFlushTimerRef.current)
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
  const selectedAtMsRef = useRef<number | null>(null)
  const completionHandledRef = useRef(false)
  const stopInProgressRef = useRef(false)
  const caseIdRef = useRef('')
  // Periodic flush (remote mode only) — mirrors the interviewer's flush architecture
  const CANDIDATE_FLUSH_MS = 20_000
  const candidateFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const candidateFlushInFlightRef = useRef(false)
  const lastCandidateFlushUrlRef = useRef<string | null>(null)
  const lastCandidateFlushPathRef = useRef<string | null>(null)
  const lastCandidateFlushMimeTypeRef = useRef<string>('audio/webm')
const candidateUploadedRef = useRef(false)
const lastCandidateFlushByteSizeRef = useRef<number>(0)
  const cachedCandidateTokenRef = useRef<string | null>(null)
  const autoStartAttemptedRef = useRef(false)
  // Set when the mic track/recorder dies mid-recording (browser permission
  // toggle, device unplug) rather than at start time (no device present,
  // etc.) -- distinguishes "was recording, mic dropped, waiting to resume"
  // from an ordinary start-time failure, so only the former auto-resumes
  // once the mic comes back. Same-device mode equivalent of the interviewer's
  // remote-mode discardStaleInterviewerRecorder/startInterviewerRecording
  // pair in InterviewerExperience.tsx.
  const micDiedMidRecordingRef = useRef(false)
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

  // Tears down a dead recorder/stream after a mid-recording mic drop so a
  // fresh startRecording() call can acquire a new getUserMedia stream and
  // MediaRecorder. Deliberately does NOT touch chunksRef or
  // recordingStartMsRef -- unlike the interviewer's remote-mode equivalent
  // (discardStaleInterviewerRecorder), same-device mode's flushCandidateAudio
  // already uploads the cumulative chunksRef.current blob, so keeping the
  // array intact means audio captured before the drop is preserved and the
  // new recorder just keeps appending to the same array. Mirrors
  // InterviewerExperience.tsx's discardStaleInterviewerRecorder.
  const discardStaleCandidateRecorder = useCallback(() => {
    if (candidateFlushTimerRef.current) {
      clearInterval(candidateFlushTimerRef.current)
      candidateFlushTimerRef.current = null
    }
    recorderRef.current = null
    teardownMedia()
  }, [teardownMedia])

  const flushCandidateAudio = useCallback(async ({ final: isFinal }: { final: boolean }) => {
    if (!lobbyId || !currentUser) return
    if (candidateFlushInFlightRef.current) return

    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.requestData()
        await new Promise<void>((r) => setTimeout(r, 80))
      } catch { /* ignore */ }
    }

    const chunks = chunksRef.current
    if (chunks.length === 0) return

    const mimeType = recorder?.mimeType || pickSupportedMimeType() || 'audio/mp4'
    const blob = new Blob(chunks, { type: mimeType })

    candidateFlushInFlightRef.current = true
    try {
      const ext = fileExtensionFromType(mimeType)
      const storagePath = `session-recordings/${currentUser.uid}/${lobbyId}/candidate-live.${ext}`
      const sRef = storageRef(storage, storagePath)
      await uploadBytes(sRef, blob, { contentType: mimeType })
      const audioUrl = await getDownloadURL(sRef)

      lastCandidateFlushUrlRef.current = audioUrl
lastCandidateFlushPathRef.current = storagePath
lastCandidateFlushMimeTypeRef.current = mimeType
lastCandidateFlushByteSizeRef.current = blob.size
      const nowMs = Date.now()
      await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/recording`, {
        status: 'uploaded',
        mode: preferredRecordingModeRef.current,
        ...(preferredRecordingModeRef.current !== 'local' ? { role: 'candidate' as const } : {}),
startedAtMs: recordingStartMsRef.current ?? nowMs,
        stoppedAtMs: nowMs,
        durationMs: recordingStartMsRef.current ? nowMs - recordingStartMsRef.current : null,
        stopReason: isFinal ? 'session_completed' : 'periodic_flush',
        storagePath,
        audioUrl,
        mimeType,
        byteSize: blob.size,
        startOffsetMs: recordingStartMsRef.current !== null && selectedAtMsRef.current !== null
          ? Math.max(0, recordingStartMsRef.current - selectedAtMsRef.current)
          : undefined,
        anchorSelectedAtMs: selectedAtMsRef.current ?? undefined,
        // Safari primed-recording: recording started at the launch click, BEFORE
        // the interviewer picked a case. Trim that dead head server-side. Positive
        // only when recording began before case-start (the Safari primed path).
        trimStartMs: recordingStartMsRef.current !== null && selectedAtMsRef.current !== null
          ? Math.max(0, selectedAtMsRef.current - recordingStartMsRef.current)
          : undefined,
        live: !isFinal,
      })

      auth.currentUser?.getIdToken(false).then((t) => { cachedCandidateTokenRef.current = t }).catch(() => {})
    } catch {
      // Non-final flush failure is non-fatal — next tick will retry
    } finally {
      candidateFlushInFlightRef.current = false
    }
  }, [lobbyId, currentUser])

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

      const mimeType = blob.type || pickSupportedMimeType() || 'audio/mp4'
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
            // Dual-mic remote fields — tell the server this is the candidate's
            // track and provide timing offsets for the merge function.
            ...(preferredRecordingModeRef.current !== 'local' ? {
              role: 'candidate' as const,
              startOffsetMs: recordingStartMsRef.current !== null && selectedAtMsRef.current !== null
                ? Math.max(0, recordingStartMsRef.current - selectedAtMsRef.current)
                : undefined,
              anchorSelectedAtMs: selectedAtMsRef.current ?? undefined,
            } : {}),
          })

          // Writing recording metadata sets transcriptStatus='pending'. The
          // Cloud Function picks it up and writes back when done — no client
          // wait, no HTTP timeout, candidate is free to navigate away.
          setRecordingNote('Audio uploaded. Transcript will finish in the background — feel free to leave this page.')

          pendingBlobRef.current = null
          setCompletionPending(false)
          candidateUploadedRef.current = true
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

      // Stop periodic flush timer so no flush races with the final upload
      if (candidateFlushTimerRef.current) {
        clearInterval(candidateFlushTimerRef.current)
        candidateFlushTimerRef.current = null
      }

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
              type: recorder.mimeType || pickSupportedMimeType() || 'audio/mp4',
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

  // Called from track.onmute/onended/recorder.onerror when the mic dies
  // mid-recording (browser permission toggle, device unplug) -- flips
  // recordingState to 'failed' (unlocking canStartRecording) only if we were
  // actually recording, and marks WHY so the reconciliation effect below
  // knows to auto-resume once the mic is confirmed back, instead of treating
  // this like an ordinary start-time failure.
  const handleMicDiedMidRecording = useCallback(() => {
    if (recordingStateRef.current !== 'recording') return
    micDiedMidRecordingRef.current = true
    setRecordingState('failed')
  }, [])

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
      setRecordingNote('Starting microphone recording...')

      try {
        // SAFARI FIX: Safari refuses to CAPTURE audio from a background/unfocused
        // tab, which the candidate workspace always is in split-screen. The
        // practice page already STARTED a MediaRecorder under the launch-click
        // gesture (while focused) and stashed the running recorder. Adopt it here
        // — it's been recording since the launch click and keeps running. The dead
        // air before the interviewer picked a case is trimmed off server-side.
        if (BROWSER === 'safari' && mode === 'local') {
          const primed = consumePrimedRecording()
          if (primed) {
            micDebug('adopting primed recorder', { startMs: primed.startMs })
            micStreamRef.current = primed.stream
            recorderRef.current = primed.recorder
            chunksRef.current = primed.chunks
            recordingStartMsRef.current = primed.startMs
            lastCandidateFlushMimeTypeRef.current = primed.mimeType
            completionHandledRef.current = false

            // Keep the mic-revoke handlers wired on the adopted stream's tracks.
            for (const track of primed.stream.getAudioTracks()) {
              track.onmute = () => { void retryMicrophonePermission(); handleMicDiedMidRecording() }
              track.onended = () => { void retryMicrophonePermission(); handleMicDiedMidRecording() }
            }
            primed.recorder.onerror = () => { handleMicDiedMidRecording() }

            setRecordingState('recording')
            if (lobbyId) {
              candidateFlushTimerRef.current = setInterval(() => {
                void flushCandidateAudio({ final: false })
              }, CANDIDATE_FLUSH_MS)
              auth.currentUser?.getIdToken(false).then((t) => { cachedCandidateTokenRef.current = t }).catch(() => {})
            }
            setRecordingNote('Recording microphone audio. Keep this tab open until feedback submission.')
            return
          }
          // No usable primed recorder — fall through to the normal path (may fail
          // on a backgrounded Safari tab, but that's the pre-existing behaviour).
          micDebug('no primed recorder, falling back to getUserMedia')
        }

        const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        micStreamRef.current = microphoneStream
        micDebug('got mic stream, starting recorder')

        const micTracks = microphoneStream.getAudioTracks()
        if (micTracks.length === 0) {
          throw new Error('No audio source available for recording.')
        }

        // SAFARI FIX (part 2): a background-tab AudioContext starts suspended and
        // resume() hangs until the tab is focused. Single-mic local recording
        // doesn't need the AudioContext graph, so on Safari+local we feed the raw
        // mic stream straight to MediaRecorder. Remote/other browsers unchanged.
        let recorderStream: MediaStream
        if (BROWSER === 'safari' && mode === 'local') {
          recorderStream = microphoneStream
          micDebug('safari local: recording raw mic (no AudioContext)')
        } else {
          // Mic-only recording (dual-mic architecture for remote). No getDisplayMedia
          // — each participant records their own mic; the Cloud Function merges tracks.
          const audioContext = new AudioContext()
          audioContextRef.current = audioContext
          await audioContext.resume()
          const destination = audioContext.createMediaStreamDestination()
          const micSource = audioContext.createMediaStreamSource(new MediaStream(micTracks))
          micSource.connect(destination)
          mixedStreamRef.current = destination.stream
          recorderStream = destination.stream
        }

        // If the mic gets blocked mid-recording (address-bar lock, OS-level
        // revoke, device unplug), the track fires 'mute'/'ended' but the
        // Permissions API onchange can lag. Re-query immediately so the
        // mic-blocked overlay surfaces without waiting for a focus/visibility
        // bounce.
        for (const track of micTracks) {
          track.onmute = () => { void retryMicrophonePermission(); handleMicDiedMidRecording() }
          track.onended = () => { void retryMicrophonePermission(); handleMicDiedMidRecording() }
        }

        const selectedMimeType = pickSupportedMimeType()
        const recorder = selectedMimeType
          ? new MediaRecorder(recorderStream, { mimeType: selectedMimeType })
          : new MediaRecorder(recorderStream)

        recorderRef.current = recorder
        // Only reset the cumulative chunk buffer / start-time anchor on a
        // genuinely fresh recording. A resume-after-mic-drop (recognized by
        // recordingStartMsRef already being set) keeps both so already-
        // captured audio is preserved and durationMs/startOffsetMs math sent
        // to the backend stays anchored to the original session start.
        const isFreshStart = recordingStartMsRef.current === null
        if (isFreshStart) {
          chunksRef.current = []
          recordingStartMsRef.current = Date.now()
        }
        completionHandledRef.current = false

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }
        recorder.onerror = () => { handleMicDiedMidRecording() }

        recorder.start(1000)
        setRecordingState('recording')
        micDiedMidRecordingRef.current = false

        // Periodic cumulative flush — mirrors the interviewer's flush architecture.
        // Every 20s we upload the cumulative blob to a stable storage path so that
        // if the tab is closed before the final upload, the pagehide beacon can
        // register the last-flushed URL and transcription still fires.
        if (lobbyId) {
          candidateFlushTimerRef.current = setInterval(() => {
            void flushCandidateAudio({ final: false })
          }, CANDIDATE_FLUSH_MS)
          auth.currentUser?.getIdToken(false).then((t) => { cachedCandidateTokenRef.current = t }).catch(() => {})
        }

        // microphonePermissionState is now reactive (via useMicPermission);
        // no manual sync needed — the browser fires onchange when getUserMedia
        // succeeds.
        setRecordingNote('Recording microphone audio. Keep this tab open until feedback submission.')
        // Recording-in-progress is local UI state only; nothing else reads it
        // so we don't write it to Firestore. The server learns about the
        // recording when it's uploaded (or failed) via /api/sessions/[id]/recording.
      } catch (startError) {
        teardownMedia()
        recorderRef.current = null
        // Only wipe already-captured audio / the start-time anchor on a
        // genuinely fresh start failing. A failed RESUME attempt (mic still
        // blocked when we tried) must preserve whatever was already captured
        // before the drop — chunksRef.current keeps growing once a later
        // resume attempt actually succeeds.
        if (recordingStartMsRef.current === null) {
          chunksRef.current = []
        }
        setRecordingState('failed')
        const message = startError instanceof Error ? startError.message : 'Unable to start recording.'
        if (mode === 'local') {
          const normalized = message.toLowerCase()
          const isNotAllowed = normalized.includes('notallowed') || normalized.includes('permission') || normalized.includes('denied')
          if (isNotAllowed) {
            setCaptureWarning(getFriendlyRecoverableCaptureMessage(mode, message))
          }
          // Safari blocks getUserMedia on background tabs — if the tab is hidden
          // when the NotAllowedError fires, reset the auto-start guard so it
          // retries automatically when the user brings the tab to the foreground.
          if (BROWSER === 'safari' && isNotAllowed && document.visibilityState === 'hidden') {
            autoStartAttemptedRef.current = false
            setRecordingState('idle')
          }
          // Re-query permission state from the browser truthfully — the
          // hook is reactive, but a manual nudge after a failure helps if
          // the onchange event didn't fire (some Safari/Firefox edge cases).
          void retryMicrophonePermission()
        }
        if (mode === 'remote') {
          const normalized = message.toLowerCase()
          if (
            normalized.includes('notallowed') ||
            normalized.includes('permission') ||
            normalized.includes('denied')
          ) {
            setCaptureWarning(getFriendlyRecoverableCaptureMessage(mode, message))
          }
          void retryMicrophonePermission()
        }
        setRecordingError(message)
      }
    },
    [canStartRecording, currentUser, lobbyId, retryMicrophonePermission, stopRecordingAndFinalize, teardownMedia, flushCandidateAudio, handleMicDiedMidRecording]
  )

  const startCaptureFlow = useCallback(
    async (mode: RecordingMode) => {
      // Both local and remote now use the same silent-start path. Mic is granted
      // on the practice page / at the gate, so no prep animation or re-prompt is
      // needed -- recording just starts immediately and auto-advances to step 2.
      if (recordingState === 'starting') return
      clearRemotePrep()
      clearLocalPrep()
      setRecordingError('')
      setCaptureWarning('')
      setWorkspaceToast(null)

      const permissionState = await retryMicrophonePermission()
      if (permissionState === 'denied') {
        setRecordingState('failed')
        setCaptureWarning('Microphone is blocked. Click the lock icon in your address bar to enable, then try again.')
        return
      }

      void startRecording(mode)
    },
    [clearLocalPrep, clearRemotePrep, recordingState, retryMicrophonePermission, startRecording]
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
    // Source B: localStorage draft with all 4 scores > 0 (local-mode / same-browser
    // only — always null cross-device in remote mode, so this is a no-op there).
    const draft = readDraftScores(lid)
    if (draft !== null && isDraftAllRated(draft.scores)) return true
    // Source C: interviewer's live draft mirrored via Firestore (remote mode only —
    // stays false forever in local mode, so this is additive/safe there).
    return interviewerDraftAllRatedRef.current === true
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
    // submit-draft is idempotent server-side and also marks the session completed —
    // no need to call /complete separately. We submit even partial drafts (1-3 scores)
    // so that whatever the interviewer filled in is never silently discarded.
    try {
      const draft = readDraftScores(lobbyId)
      const hasAnyScore = draft && Object.values(draft.scores).some(s => (s ?? 0) > 0)
      const hasNotes = draft && draft.notes.trim().length > 0
      if (draft && (hasAnyScore || hasNotes)) {
        await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/submit-draft`, {
          scores: {
            ...(draft.scores.structure ? { structure: draft.scores.structure } : {}),
            ...(draft.scores.understanding ? { understanding: draft.scores.understanding } : {}),
            ...(draft.scores.delivery ? { delivery: draft.scores.delivery } : {}),
            ...(draft.scores.creativity ? { creativity: draft.scores.creativity } : {}),
          },
          notes: draft.notes,
        })
      } else {
        // No local draft at all — the interviewer already submitted formally,
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
  }, [endSessionActionInProgress, lobbyId, readDraftScores, stopRecordingAndFinalize])

  const handleEndSessionSaveAudio = useCallback(async () => {
    if (endSessionActionInProgress || !lobbyId) return
    setEndSessionActionInProgress(true)
    endSessionInitiatedRef.current = true
    completionHandledRef.current = true
    // Dismiss overlays that no longer apply
    setWindowClosedOverlayVisible(false)
    setCaptureErrorOverlayVisible(false)
    setEndSessionOverlayKind(null)

    // Save audio and any partial draft scores the interviewer may have filled in.
    // If a draft exists (even partial), submit it so ratings aren't discarded.
    // Fall back to save-unrated if there's nothing to submit.
    try {
      const draft = readDraftScores(lobbyId)
      const hasAnyScore = draft && Object.values(draft.scores).some(s => (s ?? 0) > 0)
      const hasNotes = draft && draft.notes.trim().length > 0
      if (draft && (hasAnyScore || hasNotes)) {
        await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/submit-draft`, {
          scores: {
            ...(draft.scores.structure ? { structure: draft.scores.structure } : {}),
            ...(draft.scores.understanding ? { understanding: draft.scores.understanding } : {}),
            ...(draft.scores.delivery ? { delivery: draft.scores.delivery } : {}),
            ...(draft.scores.creativity ? { creativity: draft.scores.creativity } : {}),
          },
          notes: draft.notes,
        })
      } else {
        await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/save-unrated`, {})
      }
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
  }, [endSessionActionInProgress, lobbyId, readDraftScores, stopRecordingAndFinalize])

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

  // Stable ref so the routeIfCompleted closure (created once on mount) can
  // read the current recording mode set by the first session snapshot without
  // being in the useEffect dependency list.
  const preferredRecordingModeRef = useRef(preferredRecordingMode)
  useEffect(() => { preferredRecordingModeRef.current = preferredRecordingMode }, [preferredRecordingMode])

  // B4 (remote): staleness threshold for interviewerPresence.
  // If lastSeenAt is older than 3s (3× the 1s heartbeat), the interviewer
  // is treated as disconnected. Only used in remote mode.
  const PRESENCE_STALE_MS = 3_000
  // Latest interviewerPresence payload, cached so a periodic timer (not just
  // each incoming Firestore snapshot) can re-check staleness.
  const interviewerPresenceRef = useRef<{ active?: boolean; lastSeenAt?: { toDate: () => Date } } | undefined>(undefined)

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
      // Store selectedAt once (on first snapshot) — used as timing anchor for
      // dual-mic merge startOffsetMs calculation.
      if (raw.selectedAt && selectedAtMsRef.current === null) {
        selectedAtMsRef.current = raw.selectedAt.toMillis()
      }
      // Interviewer declined mic -- show a one-time timed overlay (fires once per session).
      // Suppressed when the candidate themselves opted out (they're running without
      // recording too, so "your side only" is irrelevant and confusing). Also
      // suppressed when the interviewer's window is currently disconnected —
      // interviewerAudioCaptured:false gets written as a best-effort pagehide
      // signal when their tab closes mid-recording (so the backend transcript
      // pipeline doesn't wait forever for audio that's never coming), but that's
      // not a real "skipped sharing mic" decision — the window-closed overlay
      // already owns that moment, so this one shouldn't also fire for it.
      const presenceAtSnapshot = (raw as { interviewerPresence?: { active?: boolean; lastSeenAt?: { toDate: () => Date } } }).interviewerPresence
      const interviewerCurrentlyDisconnected =
        presenceAtSnapshot?.active === false ||
        (presenceAtSnapshot?.lastSeenAt ? Date.now() - presenceAtSnapshot.lastSeenAt.toDate().getTime() > PRESENCE_STALE_MS : false)
      if (
        raw.interviewerAudioCaptured === false &&
        preferredRecordingModeRef.current !== 'local' &&
        !recordingConsentDeclinedRef.current &&
        !interviewerDeclineShownRef.current &&
        !interviewerCurrentlyDisconnected
      ) {
        interviewerDeclineShownRef.current = true
        setInterviewerAudioDeclined(true)
      }
      // Mirror the interviewer's live (unsubmitted) draft-rating completeness —
      // the only cross-device signal for it in remote mode. Always reflects the
      // latest value (can flip back to false if a slider gets cleared).
      if (typeof raw.interviewerDraftAllRated === 'boolean') {
        interviewerDraftAllRatedRef.current = raw.interviewerDraftAllRated
      }
      if (raw.status === 'replacing') {
        // Interviewer is swapping the case — abort recording (no upload), go back to lobby.
        endSessionInitiatedRef.current = true
        setWindowClosedOverlayVisible(false)
        teardownMedia()
        router.replace(`/lobby/${lobbyId}?mode=${requestedMode}&replacing=1`)
        return
      }
      if (raw.status === 'in_progress' && raw.caseId && raw.caseId !== caseIdRef.current) {
        // Interviewer replaced the case — navigate candidate to the new workspace.
        router.replace(`/case/${raw.caseId}/workspace?lobby=${lobbyId}&mode=${requestedMode}`)
        return
      }
      if (raw.status === 'in_progress' && autoStartAttemptedRef.current) {
        // Only mark as "was in progress" once we've already started recording.
        // On a fresh case load the first snapshot delivers in_progress before
        // auto-start fires, so we'd incorrectly show the refresh overlay.
        sessionWasInProgressRef.current = true
      }
      if (raw.status === 'waiting') {
        // Interviewer cancelled the session — abort recording (no upload), go back to lobby.
        endSessionInitiatedRef.current = true
        setWindowClosedOverlayVisible(false)
        teardownMedia()
        router.replace(`/lobby/${lobbyId}?mode=${requestedMode}`)
        return
      }
      if (raw.status === 'completed') {
        const stopReason = raw.completedBy === 'candidate' ? 'candidate_ended' : 'feedback_submitted'
        if (stopReason === 'feedback_submitted') setFeedbackSubmitted(true)
        void handleSessionCompleted(stopReason)
      }

      // B4 — Remote mode: detect interviewer disconnection via presence staleness.
      // In local mode the popup-window poll drives interviewerWindowClosed; in
      // remote mode we derive it from interviewerPresence on the session doc.
      // Cache the raw presence payload so the periodic re-check below (not just
      // this snapshot handler) can re-evaluate staleness independently — see
      // checkInterviewerPresenceStale for why a snapshot alone isn't enough.
      if (preferredRecordingModeRef.current !== 'local' && !endSessionInitiatedRef.current && !feedbackSubmitted) {
        interviewerPresenceRef.current = (raw as { interviewerPresence?: { active?: boolean; lastSeenAt?: { toDate: () => Date } } }).interviewerPresence
        checkInterviewerPresenceStale()
      }
    }

    // Re-checks staleness against the cached interviewerPresence value. Called
    // both right after every snapshot AND on a periodic timer below — a
    // snapshot alone isn't enough, since lastSeenAt stops advancing the moment
    // the interviewer's tab closes, so nothing about the document changes
    // again until some unrelated field happens to be written. Without the
    // timer, the overlay could lag far past the 25s threshold.
    function checkInterviewerPresenceStale() {
      const presence = interviewerPresenceRef.current
      // No presence data yet -> assume connected, same convention used for
      // candidatePresence on the interviewer's own side.
      if (!presence?.lastSeenAt) return
      const age = Date.now() - presence.lastSeenAt.toDate().getTime()
      const isDisconnected = presence.active === false || age > PRESENCE_STALE_MS
      setInterviewerWindowClosed(isDisconnected)
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
            // Suppress if interviewer deliberately replaced or cancelled
            const replacing = localStorage.getItem('compendium-session-replacing')
            const cancelled = localStorage.getItem('compendium-session-cancelled')
            if (!data.active && (replacing || cancelled)) return
            setInterviewerWindowClosed(!data.active)
          }
        } catch {
          // Ignore malformed payloads.
        }
      }
      // Interviewer replacing — abort recording, go back to lobby (step 2)
      if (event.key === 'compendium-session-replacing' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue)
          if (data?.lobbyId === lobbyId) {
            endSessionInitiatedRef.current = true
            setWindowClosedOverlayVisible(false)
            teardownMedia()
            router.replace(`/lobby/${lobbyId}?mode=${requestedMode}&replacing=1`)
          }
        } catch { /* ignore */ }
      }
      // Interviewer cancelled — abort recording, go back to lobby (step 1)
      if (event.key === 'compendium-session-cancelled' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue)
          if (data?.lobbyId === lobbyId) {
            endSessionInitiatedRef.current = true
            setWindowClosedOverlayVisible(false)
            teardownMedia()
            router.replace(`/lobby/${lobbyId}?mode=${requestedMode}`)
          }
        } catch { /* ignore */ }
      }
    }

    window.addEventListener('storage', onStorage)

    // Periodic re-check so the overlay fires within ~500ms of crossing the 3s
    // staleness mark, even when no new Firestore snapshot happens to arrive
    // right after the interviewer actually goes stale.
    const staleCheckTimer = setInterval(checkInterviewerPresenceStale, 500)

    return () => {
      clearPoll()
      unsubscribeSession()
      clearInterval(staleCheckTimer)
      window.removeEventListener('storage', onStorage)
    }
  }, [handleSessionCompleted, lobbyId, params, requestedMode, resolveSessionMode, router])

  useEffect(() => {
    // useMicPermission already subscribes to PermissionStatus.onchange, so
    // most state syncing is automatic. We still re-query on focus and
    // visibility because some browsers don't fire the change event when
    // the user grants permission via the address-bar lock icon (the
    // canonical way to recover from a previous denial).
    // C7: this applies to both local and remote — in remote the candidate
    // also needs mic permission for their own audio track. Gate only on
    // window existence, not on recording mode.
    if (typeof window === 'undefined') return

    const handleWindowFocus = () => void retryMicrophonePermission()
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      void retryMicrophonePermission()
      // Safari resets autoStartAttemptedRef when getUserMedia fails on a hidden
      // tab. Re-trigger auto-start now that the tab is visible and foreground.
      if (BROWSER === 'safari' && !autoStartAttemptedRef.current) {
        autoStartAttemptedRef.current = true
        void startCaptureFlow(preferredRecordingModeRef.current)
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [retryMicrophonePermission])

  // Mic-drop recovery: once the mic was confirmed dead mid-recording
  // (micDiedMidRecordingRef, set by handleMicDiedMidRecording), resume
  // capture as soon as the permission is confirmed back -- same idea as
  // InterviewerExperience.tsx's discardStaleInterviewerRecorder +
  // startInterviewerRecording pair for remote mode, adapted so no
  // already-captured audio is discarded (see discardStaleCandidateRecorder).
  // Chrome/Firefox: microphonePermissionState flips reactively via
  // PermissionStatus.onchange. Safari has no Permissions API, so this only
  // engages there once state is confirmed via the explicit "Allow mic" click
  // (handleBannerAllow / handleEnableCapture) or the BroadcastChannel
  // "mic-reconfirmed" signal below re-triggering retryMicrophonePermission.
  useEffect(() => {
    if (!micDiedMidRecordingRef.current) return
    if (microphonePermissionState !== 'granted') return
    if (recordingStateRef.current !== 'failed') return
    micDiedMidRecordingRef.current = false
    discardStaleCandidateRecorder()
    void startRecording(preferredRecordingModeRef.current)
  }, [microphonePermissionState, discardStaleCandidateRecorder, startRecording])

  useEffect(() => {
    micDebug('auto-start effect', {
      attempted: autoStartAttemptedRef.current,
      lobbyId: !!lobbyId, caseId: !!resolvedCaseId, user: !!currentUser,
      canStart: canStartRecording, declined: recordingConsentDeclined, mic: microphonePermissionState,
    })
    if (autoStartAttemptedRef.current) return
    if (!lobbyId || !resolvedCaseId || !currentUser) return
    if (!canStartRecording) return
    // Candidate chose to run the case without recording — never auto-start.
    if (recordingConsentDeclined) return
    // Skip auto-start when mic is denied — calling getUserMedia would fail
    // silently, leaving the user staring at a frozen UI. The soft-warning
    // banner surfaces the situation and lets them recover; once permission
    // flips to granted we reset autoStartAttemptedRef and try again.
    if (microphonePermissionState === 'denied') return

    micDebug('auto-start FIRING')
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
        ? 'Preparing to start recording...'
        : 'Auto-starting microphone recording...'
    )
    void startCaptureFlow(preferredRecordingMode)
  }, [canStartRecording, currentUser, lobbyId, microphonePermissionState, preferredRecordingMode, recordingConsentDeclined, resolvedCaseId, startCaptureFlow])

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
    if (recordingState !== 'recording' && recordingState !== 'uploading' && recordingState !== 'stopping') return

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
    // closing (Chrome may defer/drop beforeunload writes on real close). Used
    // here only to preserve whatever audio was already recorded — see below.
    const onPageHide = () => {
      writeAbandonedSignal()
      // Tab-close/crash/navigate-away must NOT be treated as "Drop session" —
      // that's a distinct, explicit user action (the Drop session button on
      // the End Session prompt), which already calls /abandon itself via
      // handleEndSessionDrop. Just closing or killing the tab should leave the
      // session status alone; the interviewer instead learns about it (softly,
      // non-destructively) through the candidatePresence-staleness notice on
      // their own screen. Previously this beacon also fired /abandon here,
      // which incorrectly triggered the full "candidate dropped the session"
      // flow (redirect home) just from a tab close.
      // Candidate audio beacon: if at least one periodic flush succeeded but the
      // final upload was cancelled by the tab close, register the last flush URL
      // as the final recording so transcription still fires.
      if (
        lobbyId &&
        !candidateUploadedRef.current &&
        lastCandidateFlushUrlRef.current &&
        lastCandidateFlushPathRef.current &&
        cachedCandidateTokenRef.current
      ) {
        const nowMs = Date.now()
        fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/recording`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cachedCandidateTokenRef.current}`,
          },
          body: JSON.stringify({
            status: 'uploaded',
            mode: preferredRecordingModeRef.current,
            ...(preferredRecordingModeRef.current !== 'local' ? { role: 'candidate' as const } : {}),
live: false,
interrupted: true,
            storagePath: lastCandidateFlushPathRef.current,
            audioUrl: lastCandidateFlushUrlRef.current,
            mimeType: lastCandidateFlushMimeTypeRef.current,
            byteSize: lastCandidateFlushByteSizeRef.current,
            startedAtMs: recordingStartMsRef.current ?? nowMs,
            stoppedAtMs: nowMs,
            durationMs: recordingStartMsRef.current ? nowMs - recordingStartMsRef.current : null,
            stopReason: 'page_hide',
            startOffsetMs: recordingStartMsRef.current !== null && selectedAtMsRef.current !== null
              ? Math.max(0, recordingStartMsRef.current - selectedAtMsRef.current)
              : undefined,
            anchorSelectedAtMs: selectedAtMsRef.current ?? undefined,
          }),
          keepalive: true,
        }).catch(() => {})
      }
    }

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
    // Arm the back-button guard while a recording is active OR while the case is
    // running without recording (no active recording, but the session is still
    // live and leaving must route through the end-session flow, not navigate away).
    const runningNoRecord = recordingConsentDeclined && !completionPending && !feedbackSubmitted
    const isActive = recordingState === 'recording' || recordingState === 'uploading' || runningNoRecord
    if (!isActive) return
    history.pushState(null, '', window.location.href)
    const onPopState = () => {
      history.pushState(null, '', window.location.href)
      leaveConfirmFromPopstateRef.current = true
      if ((recordingState === 'recording' || runningNoRecord) && lobbyId) {
        // Active recording OR running without recording: show the rated/unrated
        // end-session flow (same as the End Session button).
        void handleCandidateEndSession()
      } else {
        // During upload: show the simple upload-in-progress warning
        setLeaveConfirmVisible(true)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [recordingState, recordingConsentDeclined, completionPending, feedbackSubmitted])


  // Heartbeat so the interviewer pages know this candidate tab is alive.
  // pagehide/beforeunload writes from a closing tab are unreliable (Chrome
  // tears the tab down before flushing), so instead we write a fresh timestamp
  // every 1s. The interviewer side treats a stale heartbeat (>30s) as "tab gone".
  // Suppressed once session-ended is written (upload phase started).
  // Also write on visibilitychange — Safari throttles setInterval in background
  // tabs so the periodic beat may be delayed; visibilitychange fires instantly
  // and is never throttled, keeping the timestamp fresh when the tab goes hidden.
  useEffect(() => {
    if (!lobbyId || requestedMode !== 'local') return
    writeCandidateBeat(lobbyId)
    const interval = setInterval(() => writeCandidateBeat(lobbyId), 1000)
    const onVisibility = () => writeCandidateBeat(lobbyId)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  // lobbyId and requestedMode are stable for the page lifetime
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, requestedMode])

  // Safari BroadcastChannel — two purposes, Safari only:
  // 1. Ping/pong liveness: respond to interviewer pings instantly so the
  //    interviewer doesn't rely on throttled localStorage timestamps.
  // 2. Start-recording signal: redundant trigger for the auto-start effect.
  //    getUserMedia no longer needs focus here — the primed stream from the
  //    practice page (consumePrimedMicStream) makes startCaptureFlow succeed
  //    on a background tab, so we just invoke it directly.
  useEffect(() => {
    if (BROWSER !== 'safari' || !lobbyId || requestedMode !== 'local') return
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(`compendium-session-${lobbyId}`)
    ch.onmessage = (e: MessageEvent<{ type: string }>) => {
      if (e.data?.type === 'ping') {
        ch.postMessage({ type: 'pong' })
        // Also refresh localStorage beat so the fallback path stays warm
        writeCandidateBeat(lobbyId)
      }
      if (e.data?.type === 'start-recording') {
        const state = recordingStateRef.current
        if (state === 'recording' || state === 'uploading' || state === 'stopping') return
        autoStartAttemptedRef.current = true
        void startCaptureFlow(preferredRecordingModeRef.current)
      }
      // Sent by the interviewer tab's MicGuardOverlay after a successful
      // "Allow mic" click. Safari has no Permissions API onchange, so the
      // reactive mic-drop-recovery effect never fires there on its own --
      // this is what makes resume immediate on Safari even when the user
      // clicked "Allow mic" in the OTHER tab rather than this one.
      if (e.data?.type === 'mic-reconfirmed') {
        if (!micDiedMidRecordingRef.current || recordingStateRef.current !== 'failed') return
        micDiedMidRecordingRef.current = false
        discardStaleCandidateRecorder()
        void startRecording(preferredRecordingModeRef.current)
      }
    }
    return () => {
      ch.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, requestedMode])

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
      let win = host.__compendiumInterviewerWindow
      if (!win) {
        // Reference missing — this happens when the interviewer reopened THIS
        // candidate tab from their own window. In that case window.opener is the
        // interviewer window, so adopt it instead of spawning a blank popup.
        const opener = window.opener as Window | null
        if (opener && !opener.closed) {
          host.__compendiumInterviewerWindow = opener
          win = opener
          setInterviewerWindowClosed(false)
        } else {
          return
        }
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
  // B4: In remote mode, interviewerWindowClosed is set by routeIfCompleted based
  // on interviewerPresence staleness (not the popup-poll), but the same overlay
  // state drives both — so we remove the local-only gate here.
  useEffect(() => {
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
  }, [feedbackSubmitted, interviewerWindowClosed, microphonePermissionState, startTitlePulse, stopTitlePulse])

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

  // Hydrate the "run without recording" choice from sessionStorage on mount.
  // The practice page may have set it before this tab even reached the workspace.
  useEffect(() => {
    if (!lobbyId || typeof sessionStorage === 'undefined') return
    if (sessionStorage.getItem(`compendium-norecord-${lobbyId}`) === '1') {
      recordingConsentDeclinedRef.current = true
      setRecordingConsentDeclined(true)
      // Safari: no recording will happen — release any primed mic stream.
      clearPrimedMic()
    }
    // Show the interviewer-declined overlay if the interviewer declined while
    // the candidate was still in the lobby (before reaching the workspace).
    if (sessionStorage.getItem(`compendium-interviewer-declined-${lobbyId}`) === '1' && !interviewerDeclineShownRef.current) {
      interviewerDeclineShownRef.current = true
      setInterviewerAudioDeclined(true)
    }
  }, [lobbyId])

  // Discard any in-progress recording WITHOUT uploading — used when the
  // candidate opts out of recording mid-session. The captured audio is dropped
  // (no upload, no transcript) and state resets to idle so the workspace shows
  // the "Running without recording" view.
  const discardActiveRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.ondataavailable = null } catch { /* noop */ }
      try { recorder.stop() } catch { /* noop */ }
    }
    recorderRef.current = null
    chunksRef.current = []
    pendingBlobRef.current = null
    teardownMedia()
    // Safari: also drop any primed-but-unused mic stream so opting out never
    // leaves a hot mic held from the practice page.
    clearPrimedMic()
    setCompletionPending(false)
    setRecordingState('idle')
  }, [teardownMedia])

  // Shared core for opting out — applies the decline locally (state + persistence
  // + discard any active capture). `broadcast` controls whether we also signal
  // the other window (true for a user action here, false when mirroring theirs).
  // In remote mode, also sends a server signal so the interviewer gate can
  // suppress the mic prompt (no recording needed on either side).
  const applyRecordingDecline = useCallback((broadcast: boolean) => {
    recordingConsentDeclinedRef.current = true
    setRecordingConsentDeclined(true)
    if (lobbyId && typeof window !== 'undefined') {
      try { sessionStorage.setItem(`compendium-norecord-${lobbyId}`, '1') } catch { /* quota */ }
      if (broadcast) {
        try { localStorage.setItem('compendium-norecord-signal', JSON.stringify({ lobbyId, ts: Date.now() })) } catch { /* quota */ }
        // Remote mode: signal the server so the interviewer device learns the candidate opted out.
        if (preferredRecordingModeRef.current !== 'local') {
          void auth.currentUser?.getIdToken().then((token) => {
            if (!token) return
            void fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ role: 'candidate', active: true, candidateOptedOutRecording: true }),
              keepalive: true,
            }).catch(() => { /* best-effort */ })
          })
        }
      }
    }
    if (micBlockedReshowTimerRef.current) {
      clearTimeout(micBlockedReshowTimerRef.current)
      micBlockedReshowTimerRef.current = null
    }
    setMicBlockedOverlayVisible(false)
    stopTitlePulse()
    discardActiveRecording()
  }, [lobbyId, stopTitlePulse, discardActiveRecording])

  // Single entry point for the user opting out of recording in THIS window.
  const declineRecording = useCallback(() => applyRecordingDecline(true), [applyRecordingDecline])

  // Listen for the interviewer window declining recording — mirror it here so
  // the candidate workspace skips capture, discards any active recording, and
  // stops showing the mic overlay.
  useEffect(() => {
    if (!lobbyId || typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'compendium-norecord-signal' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue) as { lobbyId?: string }
          if (data.lobbyId === lobbyId) applyRecordingDecline(false)
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [lobbyId, applyRecordingDecline])

  // Once the recording has been captured and is uploading / done, or the
  // session is wrapping up / submitted, a blocked mic no longer matters — the
  // audio is already secured (or the run is ending). Turn the guard off then.
  const micGuardDisengaged =
    recordingState === 'stopping' ||
    recordingState === 'uploading' ||
    recordingState === 'uploaded' ||
    completionPending ||
    feedbackSubmitted ||
    endingSession ||
    endSessionInitiatedRef.current

  // Drive the mic-blocked overlay from microphonePermissionState (both modes).
  // Title pulse starts immediately; overlay reshows after 1.5s if still blocked.
  // Suppressed entirely once the candidate has chosen to run without recording,
  // or once the recording is captured / the session is ending.
  useEffect(() => {
    if (recordingConsentDeclined || micGuardDisengaged) {
      if (micBlockedReshowTimerRef.current) {
        clearTimeout(micBlockedReshowTimerRef.current)
        micBlockedReshowTimerRef.current = null
      }
      stopTitlePulse()
      setMicBlockedOverlayVisible(false)
      return
    }
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
  }, [microphonePermissionState, recordingConsentDeclined, micGuardDisengaged])

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

  // Candidate presence heartbeat (remote mode only).
  // Writes `candidatePresence` to the session doc every 10s so the interviewer's
  // onSnapshot can detect staleness (tab closed/crashed/lost connectivity) via
  // `lastSeenAt` age, mirroring the candidate's own interviewerPresence check.
  useEffect(() => {
    if (preferredRecordingMode === 'local' || !lobbyId) return

    const sendHeartbeat = async (active: boolean) => {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) return
        await fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ role: 'candidate', active, recording: recordingStateRef.current === 'recording' }),
          keepalive: true,
        })
      } catch {
        // Best-effort — a missed heartbeat is tolerable; the stale threshold is 25s.
      }
    }

    void sendHeartbeat(true)
    const timer = setInterval(() => { void sendHeartbeat(true) }, 10_000)

    const onPageHide = () => { void sendHeartbeat(false) }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', onPageHide)
    }
  // recordingStateRef keeps the recording value fresh without re-running the effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredRecordingMode, lobbyId])

  const isLocalSession = preferredRecordingMode === 'local'
  // Top-priority overlay gate — see the mic-blocked render block for rationale.
  const micBlockedActive = micBlockedOverlayVisible

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
  // Same prep strip for both modes -- mic is granted on the practice page and
  // recording auto-starts, so remote mirrors local exactly.
  const prepSteps = ['Keep this tab open', 'Allow microphone access', 'Continue here']
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
  const endingSessionNowForPill =
    (recordingState !== 'starting' && recordingState !== 'recording') &&
    (endSessionActionInProgress || endSessionInitiatedRef.current)
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
              : recordingConsentDeclined && isWaitingForUserStart
                ? 'No recording'
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

  // Both modes now use a 3-step flow. Local: mic granted on the practice page,
  // recording auto-starts. Remote: mic granted at launch, same auto-start -- no
  // separate "Allow recording" step needed on either mode.
  const remoteWorkflowCurrentStep = feedbackSubmitted
    ? 3
    : (recordingState === 'uploading' || (recordingState === 'uploaded' && !completionPending)) ? 3 : 2
  const localWorkflowCurrentStep = feedbackSubmitted
    ? 3
    : (recordingState === 'uploading' || (recordingState === 'uploaded' && !completionPending)) ? 3 : 2
  const workflowCurrentStep = isLocalSession ? localWorkflowCurrentStep : remoteWorkflowCurrentStep
  const workflowSteps = isLocalSession
    ? [
        { num: '01', text: 'Controls ready' },
        { num: '02', text: 'Case in session' },
        { num: '03', text: feedbackSubmitted ? 'Feedback submitted' : 'Review dashboard' },
      ]
    : [
        { num: '01', text: 'Send invite' },
        { num: '02', text: 'Case in session' },
        { num: '03', text: feedbackSubmitted ? 'Feedback submitted' : 'Review dashboard' },
      ]
  // Idle and failed-but-recoverable both mean the same thing from the user's
  // POV — they need to click Allow Recording to start. Phrase the copy that
  // way (an instruction, not a status diagnosis) so a candidate on their
  // first view isn't told "needs attention" or "try again" for a thing they
  // never actually tried. Reuses isWaitingForUserStart defined above.
  // Once the candidate has triggered an end-session action, the workspace is
  // wrapping up — never surface a recording-error state, since recording is
  // stopping on purpose (and may never have started, in the unrated case).
  // "Ending now" should never show while capture is still actively starting or
  // running — in a real end the recorder is stopped first (state moves to
  // stopping/uploading), so a 'starting'/'recording' state here means the
  // end-session ref is stale (e.g. left over from a prior session signal) and
  // must not hijack the live-session status text.
  const captureActiveNow = recordingState === 'starting' || recordingState === 'recording'
  const isEndingSessionNow =
    !captureActiveNow && (endSessionActionInProgress || endSessionInitiatedRef.current)
  // When the candidate opted out of recording, the case runs in a plain
  // "no capture" state — only override the idle/waiting copy, never the
  // active wrap-up / upload states (which can't occur without a recording).
  const runningWithoutRecording = recordingConsentDeclined && isWaitingForUserStart && !isEndingSessionNow
  const workspaceStatusTitle =
    isEndingSessionNow
      ? 'Wrapping up this session'
      : runningWithoutRecording
      ? 'Running without recording'
      : recordingState === 'starting'
      ? 'Requesting permission'
      : recordingState === 'recording'
        ? 'Recording is live'
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
      : runningWithoutRecording
      ? 'No audio or transcript is being captured for this run. The case still completes and shows in your dashboard.'
      : recordingState === 'starting'
      ? `Allow microphone access ${micPrompt()}.`
      : recordingState === 'recording'
        ? 'Closing or reloading this tab will lose your recording. Keep it open until the session ends.'
        : recordingState === 'stopping'
          ? 'Saving your recording before you leave this page.'
          : recordingState === 'uploading'
            ? 'Finishing the recording and transcript in the background.'
            : recordingState === 'uploaded'
              ? 'You can move to the dashboard now.'
              : isWaitingForUserStart
                ? `When you press the button below, ${BROWSER === 'safari' ? 'Safari' : BROWSER === 'edge' ? 'Edge' : BROWSER === 'firefox' ? 'Firefox' : 'Chrome'} will ask for microphone access.`
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
          title={recordingConsentDeclined ? "Leave this case?" : (recordingState === 'uploading' ? "Your audio is uploading right now" : "Leave and save audio?")}
          body={
            recordingConsentDeclined
              ? "This case is running without recording, so there's no audio or transcript to save. If the interviewer rates it, you'll see their feedback in the dashboard. Either way, the case will show up there."
              : recordingState === 'uploading'
              ? "Going back now would cut the upload and your audio would be lost. Just hang tight, it finishes on its own in a few seconds."
              : "Leaving will stop the mic and save what's recorded so far. If the interviewer rates it, you'll see their feedback in the dashboard. Either way, the case will show up there."
          }
          autoDismissMs={12000}
          actionLabel={recordingState === 'uploading' && !recordingConsentDeclined ? undefined : (leavingInProgress ? "Saving..." : (recordingConsentDeclined ? "Leave case" : "Leave and save"))}
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
          title={recordingConsentDeclined ? "Heading to dashboard." : "Audio saved. Heading to dashboard."}
          body={recordingConsentDeclined
            ? "This case ran without recording, so there's no audio or transcript. If the interviewer rates it, you'll see their feedback in the dashboard. Either way, the case will show up there."
            : "Your audio is saved. If the interviewer rates it, you'll see their feedback in the dashboard. Either way, the case will show up there."}
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
          body={recordingConsentDeclined
            ? "The interviewer has rated the session. This case ran without recording, so there's no audio or transcript, just the ratings. End the case, or drop the whole thing if something went wrong."
            : "The interviewer has rated the session. You can save your audio and end the case, or drop the whole thing if something went wrong."}
          actionLabel={endSessionActionInProgress ? "Saving..." : (recordingConsentDeclined ? "End case" : "Save and end")}
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
          body={recordingConsentDeclined
            ? "The interviewer hasn't finished rating yet. This case ran without recording, so there's no audio or transcript. End now and it appears in your dashboard as unrated, or drop it entirely."
            : "The interviewer hasn't finished rating yet. You can save your audio and end now, the case will appear in your dashboard as unrated. Or drop it entirely."}
          actionLabel={endSessionActionInProgress ? "Saving..." : (recordingConsentDeclined ? "End case" : "Save audio")}
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
          body={recordingConsentDeclined
            ? (endSessionSavedKind === 'rated'
                ? "Ratings saved. This case ran without recording, so there's no audio or transcript. It's in your dashboard."
                : "This case ran without recording, so there's no audio or transcript. It's in your dashboard as unrated.")
            : endSessionSavedKind === 'rated'
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

      {/* Mic-blocked is the top-priority status toast: from case start until the
          recording is captured, a blocked mic must be resolved (or explicitly
          skipped) before any other status toast can surface. The other toasts'
          underlying state stays set — they're only visually suppressed here — so
          the moment mic is resolved (granted or skipped), they appear. */}
      {micBlockedActive ? (
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
          body="Looks like your mic is off for this page. Turn it back on in your browser's site permissions and tap Allow mic, or just skip recording and keep going."
          actionLabel="Allow mic"
          onAction={() => void handleBannerAllow()}
          secondaryActionLabel="Skip recording"
          onSecondaryAction={declineRecording}
          onDismiss={() => {
            setMicBlockedOverlayVisible(false)
            if (micBlockedReshowTimerRef.current) clearTimeout(micBlockedReshowTimerRef.current)
            micBlockedReshowTimerRef.current = setTimeout(() => {
              micBlockedReshowTimerRef.current = null
              if (microphonePermissionState === 'denied' && !recordingConsentDeclinedRef.current) setMicBlockedOverlayVisible(true)
            }, 1500)
          }}
        />
      ) : null}

      {interviewerAudioDeclined && !isLocalSession && !recordingConsentDeclined ? (
        <LobbyOverlay
          key="interviewer-audio-declined"
          type="info"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
          title="Recording your side only"
          body="Your interviewer skipped sharing their mic, so only your audio gets recorded. Your transcript will still capture everything you say."
          autoDismissMs={6000}
          onDismiss={() => setInterviewerAudioDeclined(false)}
        />
      ) : null}

      {windowClosedOverlayVisible && lobbyId && resolvedCaseId && !micBlockedActive ? (
        isLocalSession ? (
          // Local mode: interviewer popup closed on THIS machine — show reopen action.
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
              const win = window.open(url, '_blank')
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
              if (windowClosedReshowTimerRef.current) clearTimeout(windowClosedReshowTimerRef.current)
              windowClosedReshowTimerRef.current = setTimeout(() => {
                windowClosedReshowTimerRef.current = null
                setInterviewerWindowClosed((closed) => {
                  if (closed && !endSessionInitiatedRef.current) setWindowClosedOverlayVisible(true)
                  return closed
                })
              }, 1500)
            }}
          />
        ) : (
          // B4 — Remote mode: interviewer disconnected on their own device.
          // No "Reopen window" — we can't open their browser. Instead: let the
          // candidate copy the original invite link to re-share, and reflect
          // the rated/unrated draft state (via the Firestore-mirrored signal,
          // since readDraftScores is local-only and never true here) so the
          // copy matches what actually happens if they end the session now.
          // The overlay auto-clears via routeIfCompleted when the heartbeat resumes.
          <LobbyOverlay
            key="interviewer-disconnected"
            type="warning"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            }
            title="Looks like your interviewer's window closed"
            body={(() => {
              const allRated = interviewerDraftAllRatedRef.current === true
              if (recordingState === 'recording') {
                return allRated
                  ? "They'd rated all four parameters but hadn't submitted yet. Send them the link to hop back in, or end the session now and the ratings will be saved."
                  : "They hadn't finished rating yet. Send them the link to hop back in, or end the session now and the case will be marked unrated."
              }
              return allRated
                ? "They'd rated all four parameters already. Send them the link to hop back in and submit, or end the session to save what's there."
                : "They hadn't finished rating yet. Send them the link to hop back in, or end the session."
            })()}
            actionLabel="Copy link"
            onAction={() => {
              if (typeof window === 'undefined') return
              const link = `${window.location.origin}/lobby/${lobbyId}?role=interviewer&mode=${requestedMode}`
              void navigator.clipboard.writeText(link).catch(() => {})
            }}
            secondaryActionLabel={recordingState === 'recording' ? "End session" : undefined}
            onSecondaryAction={recordingState === 'recording' ? () => {
              setWindowClosedOverlayVisible(false)
              if (windowClosedReshowTimerRef.current) clearTimeout(windowClosedReshowTimerRef.current)
              void handleCandidateEndSession()
            } : undefined}
            onDismiss={() => {
              setWindowClosedOverlayVisible(false)
              if (windowClosedReshowTimerRef.current) clearTimeout(windowClosedReshowTimerRef.current)
              windowClosedReshowTimerRef.current = setTimeout(() => {
                windowClosedReshowTimerRef.current = null
                setInterviewerWindowClosed((closed) => {
                  if (closed && !endSessionInitiatedRef.current) setWindowClosedOverlayVisible(true)
                  return closed
                })
              }, 1500)
            }}
          />
        )
      ) : null}

      {sessionIssueOverlayVisible && !micBlockedActive ? (
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

      {captureErrorOverlayVisible && !micBlockedActive ? (
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
                <div className="relative grid gap-5 grid-cols-3">
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
                {/* Both modes: recording auto-starts (mic already granted on the
                    practice page), so the idle state is just a momentary gap before
                    capture begins — never surface the "Allow Recording" button there.
                    Only show it on a genuine failure the candidate must recover from. */}
                {!recordingConsentDeclined && (recordingState === 'failed' || prepVisible) ? (
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

      {/* F17 — footer: shown after the session is submitted so it doesn't
          distract from the active session. CompactPlatformFooter is defined
          at the top of this file. */}
      {feedbackSubmitted ? <CompactPlatformFooter /> : null}

    </div>
  )
}

function activeBeforeUnloadState(value: RecordingState): boolean {
  return value === 'recording' || value === 'stopping' || value === 'uploading' || value === 'failed'
}

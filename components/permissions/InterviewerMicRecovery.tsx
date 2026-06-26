'use client'

/**
 * InterviewerMicRecovery -- mid-flow mic-LOSS recovery overlay for the INTERVIEWER
 * in remote mode. Distinct from InterviewerMicGate (which makes the INITIAL
 * decision once, full-screen, before the lobby).
 *
 * This is the recovery prompt for a mic that was already granted at the gate and
 * then broke (turned off in the browser / OS). It runs during the upstream stages
 * -- the interviewer welcome lobby and the case repository -- where there is no
 * MediaRecorder yet to throw `onerror`, so the only signal is the permission state
 * flipping to 'denied'.
 *
 * Two actions, mirroring the candidate's mic-blocked guard:
 *   - Allow mic     -> re-request; recording resumes once back in session.
 *   - Skip recording -> the gate's no-consent path: write NOCONSENT_KEY + signal
 *                       interviewerAudioCaptured:false. Identical end state to
 *                       "I don't provide consent" at the gate.
 *
 * Hard suppressors (never show):
 *   - Candidate opted out of recording (candidateOptedOutRecording on the doc):
 *     the whole session is no-recording, so neither side has audio to recover.
 *   - Interviewer already declined consent (NOCONSENT_KEY in sessionStorage, or
 *     interviewerAudioCaptured:false echoed back on the doc).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { useMicPermission } from '@/lib/permissions/microphone'
import { LobbyOverlay } from '@/components/lobby/LobbyOverlay'
import { auth } from '@/lib/firebase/config'
import { sessionDoc } from '@/lib/firebase/collections'

const NOCONSENT_KEY = (id: string) => `compendium-interviewer-noconsent-${id}`

async function signalNoInterviewerAudio(lobbyId: string) {
  try {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    await fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role: 'interviewer', active: true, interviewerAudioCaptured: false }),
      keepalive: true,
    })
  } catch { /* best-effort */ }
}

interface InterviewerMicRecoveryProps {
  lobbyId: string
  /** Parent gates when this should watch (e.g. remote && gate already resolved). */
  active: boolean
  /** Fires with true while the overlay is showing so the parent can suppress its own overlays. */
  onShowingChange?: (showing: boolean) => void
}

const MicOffIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

export function InterviewerMicRecovery({ lobbyId, active, onShowingChange }: InterviewerMicRecoveryProps) {
  const { state, request, retry } = useMicPermission()
  const [visible, setVisible] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [candidateOptedOut, setCandidateOptedOut] = useState(false)
  const reshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate the declined flag from the gate's sessionStorage signal.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { if (sessionStorage.getItem(NOCONSENT_KEY(lobbyId)) === '1') setDeclined(true) } catch { /* quota */ }
  }, [lobbyId])

  // Watch the session doc for the hard suppressors.
  useEffect(() => {
    if (!active) return
    const unsub = onSnapshot(
      sessionDoc(lobbyId),
      (snap) => {
        const data = snap.data()
        if (data?.candidateOptedOutRecording === true) setCandidateOptedOut(true)
        if (data?.interviewerAudioCaptured === false) setDeclined(true)
      },
      () => { /* ignore snapshot errors */ }
    )
    return () => unsub()
  }, [active, lobbyId])

  useEffect(() => { onShowingChange?.(visible) }, [visible, onShowingChange])

  // Re-query mic on focus/visibility -- Permissions API onchange lags when the
  // user toggles the mic via the address-bar lock icon.
  useEffect(() => {
    if (!active || declined || candidateOptedOut || typeof window === 'undefined') return
    const recheck = () => { void retry() }
    const onVis = () => { if (document.visibilityState === 'visible') void retry() }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [active, declined, candidateOptedOut, retry])

  // Drive visibility from mic state. Off when inactive, declined, or opted out.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!active || declined || candidateOptedOut) {
      if (reshowTimerRef.current) { clearTimeout(reshowTimerRef.current); reshowTimerRef.current = null }
      setVisible(false)
      return
    }
    if (state === 'denied') {
      setVisible((prev) => (prev ? prev : true))
    } else {
      if (reshowTimerRef.current) { clearTimeout(reshowTimerRef.current); reshowTimerRef.current = null }
      setVisible(false)
    }
  }, [active, declined, candidateOptedOut, state])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => () => {
    if (reshowTimerRef.current) clearTimeout(reshowTimerRef.current)
  }, [])

  const allowMic = useCallback(async () => {
    const stream = await request()
    if (stream) stream.getTracks().forEach((t) => t.stop())
    else await retry()
  }, [request, retry])

  const skipRecording = useCallback(() => {
    if (reshowTimerRef.current) { clearTimeout(reshowTimerRef.current); reshowTimerRef.current = null }
    setVisible(false)
    setDeclined(true)
    try { sessionStorage.setItem(NOCONSENT_KEY(lobbyId), '1') } catch { /* quota */ }
    void signalNoInterviewerAudio(lobbyId)
  }, [lobbyId])

  if (!visible) return null

  return (
    <LobbyOverlay
      type="warning"
      icon={MicOffIcon}
      title="Looks like your mic dropped"
      body="Your mic just cut out, so your side stopped recording. Turn it back on and tap Allow mic to keep going, or skip and we'll just record your candidate. Either way the case keeps running."
      actionLabel="Allow mic"
      onAction={() => void allowMic()}
      secondaryActionLabel="Skip recording"
      onSecondaryAction={skipRecording}
      onDismiss={() => {
        setVisible(false)
        if (reshowTimerRef.current) clearTimeout(reshowTimerRef.current)
        reshowTimerRef.current = setTimeout(() => {
          reshowTimerRef.current = null
          if (state === 'denied' && active && !declined && !candidateOptedOut) setVisible(true)
        }, 1500)
      }}
    />
  )
}

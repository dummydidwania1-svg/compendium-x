'use client'

/**
 * InterviewerMicGate -- full-screen mic-permission window for the interviewer
 * in remote mode. Shown on first arrival before the welcome lobby.
 *
 * Visual clone of the handoff overlay (same blur, glow blobs, card animation,
 * fonts). Three states: asking (native prompt fires on mount), granted (brief
 * confirm then auto-dismiss), denied (two action buttons: Try again / I don't
 * provide consent).
 *
 * On "I don't provide consent", signals the server via presence API with
 * interviewerAudioCaptured:false so the candidate device shows the
 * "Recording your side only" info overlay.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDoc } from 'firebase/firestore'
import { useMicPermission } from '@/lib/permissions/microphone'
import { auth } from '@/lib/firebase/config'
import { sessionDoc } from '@/lib/firebase/collections'

interface InterviewerMicGateProps {
  lobbyId: string
  /** Called when the gate resolves (granted or declined), so the parent renders the lobby. */
  onResolved: () => void
}

const NOCONSENT_KEY = (id: string) => `compendium-interviewer-noconsent-${id}`
const SHOWN_KEY = (id: string) => `compendium-interviewer-micgate-shown-${id}`

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

export function InterviewerMicGate({ lobbyId, onResolved }: InterviewerMicGateProps) {
  const { state, request, retry } = useMicPermission()
  // 'asking' | 'granted' | 'denied'
  const [gateState, setGateState] = useState<'asking' | 'granted' | 'denied'>('asking')
  const requestedRef = useRef(false)
  const resolvedRef = useRef(false)

  // On mount, check if the candidate already opted out of recording. If so,
  // skip the gate entirely -- no recording is needed for either side.
  useEffect(() => {
    if (requestedRef.current) return
    requestedRef.current = true
    void (async () => {
      try {
        const snap = await getDoc(sessionDoc(lobbyId))
        if (snap.exists() && snap.data()?.candidateOptedOutRecording === true) {
          // Candidate chose no recording -- skip mic gate silently.
          onResolved()
          return
        }
      } catch { /* best-effort; proceed to prompt on error */ }

      // Fire native mic prompt.
      const stream = await request()
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        setGateState('granted')
      }
      // On failure, state will update to 'denied' via hook.
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync gateState from the hook's state after the initial request.
  useEffect(() => {
    if (gateState === 'granted') return
    if (state === 'granted') setGateState('granted')
    else if (state === 'denied') setGateState('denied')
  }, [state, gateState])

  // Auto-dismiss after grant (900ms confirmation window).
  useEffect(() => {
    if (gateState !== 'granted') return
    if (resolvedRef.current) return
    resolvedRef.current = true
    try { sessionStorage.setItem(SHOWN_KEY(lobbyId), '1') } catch { /* quota */ }
    const t = setTimeout(() => onResolved(), 1000)
    return () => clearTimeout(t)
  }, [gateState, lobbyId, onResolved])

  // Re-query on focus/visibility so fixing mic in address bar updates state.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const recheck = () => { void retry() }
    const onVis = () => { if (document.visibilityState === 'visible') void retry() }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [retry])

  const handleTryAgain = useCallback(async () => {
    const stream = await request()
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setGateState('granted')
    } else {
      await retry()
    }
  }, [request, retry])

  const handleDecline = useCallback(async () => {
    try { sessionStorage.setItem(NOCONSENT_KEY(lobbyId), '1') } catch { /* quota */ }
    try { sessionStorage.setItem(SHOWN_KEY(lobbyId), '1') } catch { /* quota */ }
    await signalNoInterviewerAudio(lobbyId)
    onResolved()
  }, [lobbyId, onResolved])

  const isDenied = gateState === 'denied'
  const isGranted = gateState === 'granted'

  return (
    <>
      <style>{`
        @keyframes imgk-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes imgk-card-in { from { opacity: 0; transform: translateY(22px) scale(0.97); filter: blur(3px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
        @keyframes imgk-glow { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.55; transform: scale(1.08); } }
        @keyframes imgk-mic-breathe { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.75; transform: scale(1.07); } }
      `}</style>
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backdropFilter: 'blur(28px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
        background: 'rgba(255,248,240,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'imgk-overlay-in 0.5s cubic-bezier(0.22,1,0.36,1) both',
      }}
    >
      {/* Glow blobs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            top: '30%',
            left: '35%',
            width: '360px',
            height: '360px',
            borderRadius: '999px',
            background: isDenied
              ? 'radial-gradient(circle, rgba(127,29,29,0.10) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(61,90,53,0.07) 0%, transparent 70%)',
            animation: 'imgk-glow 5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '40%',
            right: '30%',
            width: '260px',
            height: '260px',
            borderRadius: '999px',
            background: 'radial-gradient(circle, rgba(196,168,130,0.07) 0%, transparent 70%)',
            animation: 'imgk-glow 6s ease-in-out infinite reverse',
          }}
        />
      </div>

      {/* Card */}
      <div
        className="flex flex-col items-center gap-7 px-8 text-center"
        style={{ animation: 'imgk-card-in 0.55s cubic-bezier(0.22,1,0.36,1) 0.1s both', maxWidth: '360px' }}
      >
        {/* Icon */}
        <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isGranted ? (
            /* Check + mic on grant */
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(61,90,53,0.75)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'imgk-overlay-in 0.35s ease both' }}>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
              <polyline points="20 6 9 17 4 12" stroke="rgba(61,90,53,0.9)" strokeWidth="2" />
            </svg>
          ) : isDenied ? (
            /* Crossed mic on denial */
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(127,29,29,0.75)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'lo-icon-shake 0.5s ease both' }}>
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            /* Plain mic while asking */
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(61,90,53,0.65)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'imgk-mic-breathe 3s ease-in-out infinite' }}>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-2.5">
          <h2
            style={{
              fontFamily: "'Newsreader', serif",
              fontWeight: 300,
              color: isDenied ? '#7f1d1d' : '#3B2F2F',
              fontSize: '30px',
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
            }}
          >
            {isGranted ? "You're all set" : isDenied ? 'Mic access got blocked' : 'Quick mic check'}
          </h2>
          <p
            style={{
              fontFamily: "'Work Sans', sans-serif",
              fontSize: '13px',
              color: isDenied ? 'rgba(127,29,29,0.65)' : 'rgba(92,64,51,0.65)',
              maxWidth: '280px',
              lineHeight: 1.65,
            }}
          >
            {isGranted
              ? 'Mic is on. Taking you in now.'
              : isDenied
              ? "No worries, it happens. If you want your voice in the transcript, tap the lock icon up in the address bar, switch Microphone to Allow, then hit Try again. Or you can skip it and we'll just record your candidate."
              : 'We use your mic so your side of the chat gets recorded too. That gives your candidate a full transcript with both voices. Allow it in the browser popup and you are all set.'}
          </p>
        </div>

        {/* Buttons (denied state only) */}
        {isDenied ? (
          <div className="flex flex-col items-center gap-3 w-full" style={{ maxWidth: '260px' }}>
            <button
              onClick={() => void handleTryAgain()}
              style={{
                width: '100%',
                padding: '10px 20px',
                borderRadius: '999px',
                background: 'rgba(61,90,53,0.10)',
                border: '1px solid rgba(61,90,53,0.22)',
                color: '#3D5A35',
                fontFamily: "'Work Sans', sans-serif",
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => void handleDecline()}
              style={{
                width: '100%',
                padding: '10px 20px',
                borderRadius: '999px',
                background: 'transparent',
                border: '1px solid rgba(92,64,51,0.18)',
                color: 'rgba(92,64,51,0.55)',
                fontFamily: "'Work Sans', sans-serif",
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              I don't provide consent
            </button>
          </div>
        ) : !isGranted ? (
          /* Asking state -- subtle "Waiting..." hint where the progress bar lives in handoff */
          <p
            style={{
              fontSize: '10px',
              color: 'rgba(92,64,51,0.35)',
              fontFamily: "'Work Sans', sans-serif",
              letterSpacing: '0.04em',
            }}
          >
            Waiting for your answer...
          </p>
        ) : null}
      </div>
    </div>
    </>
  )
}

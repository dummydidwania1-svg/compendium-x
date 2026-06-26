'use client'

/**
 * InterviewerMicGate -- full-screen mic-permission window for the interviewer
 * in remote mode. Shown on first arrival before the welcome lobby.
 *
 * Visual clone of the handoff overlay (same blur, glow blobs, card animation,
 * fonts). Four states: asking, granted, denied, declined.
 *
 * Granted + declined both show a draining progress bar (2.2s) before resolving,
 * matching the split-screen handoff feel. Denied shows restyled action buttons
 * identical to LobbyOverlay CTAs.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { useMicPermission } from '@/lib/permissions/microphone'
import { auth } from '@/lib/firebase/config'
import { sessionDoc } from '@/lib/firebase/collections'

interface InterviewerMicGateProps {
  lobbyId: string
  onResolved: () => void
}

const NOCONSENT_KEY = (id: string) => `compendium-interviewer-noconsent-${id}`
const SHOWN_KEY = (id: string) => `compendium-interviewer-micgate-shown-${id}`
const GATE_DURATION_MS = 2200

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

type GateState = 'asking' | 'granted' | 'denied' | 'declined'

export function InterviewerMicGate({ lobbyId, onResolved }: InterviewerMicGateProps) {
  const { state, request, retry } = useMicPermission()
  const [gateState, setGateState] = useState<GateState>('asking')
  const [checking, setChecking] = useState(false)
  const [countdown, setCountdown] = useState(2)
  const requestedRef = useRef(false)
  const resolvedRef = useRef(false)
  // Stable ref to onResolved: prevents the timer effect from re-running mid-countdown.
  const onResolvedRef = useRef(onResolved)
  useEffect(() => { onResolvedRef.current = onResolved }, [onResolved])
  // gateStateRef mirrors gateState for use inside snapshot callbacks (avoids adding
  // gateState to subscription deps, which would restart the subscription on every state change).
  const gateStateRef = useRef<GateState>('asking')
  useEffect(() => { gateStateRef.current = gateState }, [gateState])
  // Coordinates the first-snapshot grace period: the mount effect waits for
  // firstSnapshotReceivedRef to be true before calling request(), giving the opt-out
  // subscription a chance to resolve the gate before the browser mic prompt fires.
  const firstSnapshotReceivedRef = useRef(false)
  const firstSnapshotResolveRef = useRef<(() => void) | null>(null)

  // Live opt-out subscription for the whole gate lifecycle.
  // Also signals the mount effect once the first snapshot returns.
  useEffect(() => {
    const unsub = onSnapshot(
      sessionDoc(lobbyId),
      (snap) => {
        // Unblock the mount gate (first snapshot received).
        firstSnapshotReceivedRef.current = true
        firstSnapshotResolveRef.current?.()
        firstSnapshotResolveRef.current = null
        if (!snap.exists()) return
        if (snap.data()?.candidateOptedOutRecording === true && gateStateRef.current === 'asking') {
          try { sessionStorage.setItem(SHOWN_KEY(lobbyId), '1') } catch { /* quota */ }
          resolvedRef.current = true  // prevent mount effect from firing mic prompt after unmount
          onResolvedRef.current()
        }
      },
      () => {
        // On Firestore error, unblock the mount gate so the mic prompt still fires.
        firstSnapshotReceivedRef.current = true
        firstSnapshotResolveRef.current?.()
        firstSnapshotResolveRef.current = null
      }
    )
    return () => unsub()
  }, [lobbyId])

  // Mount: wait for the first snapshot, then fire the native mic prompt.
  // The grace period lets the opt-out subscription win if the candidate's write
  // arrives before or right as the interviewer opens the link.
  useEffect(() => {
    if (requestedRef.current) return
    requestedRef.current = true
    void (async () => {
      await new Promise<void>((resolve) => {
        if (firstSnapshotReceivedRef.current) resolve()
        else firstSnapshotResolveRef.current = resolve
      })
      if (resolvedRef.current) return
      const stream = await request()
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        setGateState('granted')
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync denied from hook state (fires when user blocks via address bar).
  useEffect(() => {
    if (gateState === 'granted' || gateState === 'declined') return
    if (state === 'granted') setGateState('granted')
    else if (state === 'denied') setGateState('denied')
  }, [state, gateState])

  // 2.2s draining timer for granted and declined states.
  // Deps: only gateState and lobbyId (both stable while the countdown runs).
  // onResolved is NOT in deps -- it is read via onResolvedRef so adding it would
  // cause the effect to re-run (and kill the timers) on every parent render.
  useEffect(() => {
    if (gateState !== 'granted' && gateState !== 'declined') return
    if (resolvedRef.current) return
    resolvedRef.current = true
    try { sessionStorage.setItem(SHOWN_KEY(lobbyId), '1') } catch { /* quota */ }

    let count = 2
    setCountdown(count)
    const interval = setInterval(() => {
      count -= 1
      setCountdown(count)
      if (count <= 0) clearInterval(interval)
    }, 1000)
    const timer = setTimeout(() => onResolvedRef.current(), GATE_DURATION_MS)
    return () => { clearInterval(interval); clearTimeout(timer) }
  }, [gateState, lobbyId])

  // Re-query on focus/visibility so fixing mic in browser settings auto-advances.
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
    setChecking(true)
    const stream = await request()
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setChecking(false)
      setGateState('granted')
    } else {
      await retry()
      setChecking(false)
    }
  }, [request, retry])

  const handleDecline = useCallback(async () => {
    // Signal server immediately so the candidate overlay fires right away.
    try { sessionStorage.setItem(NOCONSENT_KEY(lobbyId), '1') } catch { /* quota */ }
    void signalNoInterviewerAudio(lobbyId)
    // Then show the confirmed decline beat before resolving.
    setGateState('declined')
  }, [lobbyId])

  const isDenied = gateState === 'denied'
  const isGranted = gateState === 'granted'
  const isDeclined = gateState === 'declined'
  const isResolved = isGranted || isDeclined

  const glowBg = isDenied
    ? 'radial-gradient(circle, rgba(127,29,29,0.10) 0%, transparent 70%)'
    : 'radial-gradient(circle, rgba(61,90,53,0.07) 0%, transparent 70%)'

  return (
    <>
      <style>{`
        @keyframes imgk-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes imgk-card-in { from { opacity: 0; transform: translateY(22px) scale(0.97); filter: blur(3px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
        @keyframes imgk-glow { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.55; transform: scale(1.08); } }
        @keyframes imgk-mic-breathe { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.75; transform: scale(1.07); } }
        @keyframes imgk-progress { from { width: 100%; } to { width: 0%; } }
        .imgk-btn { display: inline-flex; align-items: center; justify-content: center; width: auto; border-radius: 999px; padding: 6px 16px; font-family: 'Work Sans', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,0.6); transition: opacity 0.15s ease; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .imgk-btn:hover { opacity: 0.82; }
        .imgk-btn:active { transform: scale(0.97); opacity: 0.8; }
        .imgk-btn-primary { color: #7f1d1d; border: 1px solid rgba(127,29,29,0.22); background: rgba(127,29,29,0.06); }
        .imgk-btn-secondary { color: rgba(92,64,51,0.55); border: 1px solid rgba(92,64,51,0.16); background: rgba(92,64,51,0.04); }
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
          <div style={{ position: 'absolute', top: '30%', left: '35%', width: '360px', height: '360px', borderRadius: '999px', background: glowBg, animation: 'imgk-glow 5s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', top: '40%', right: '30%', width: '260px', height: '260px', borderRadius: '999px', background: 'radial-gradient(circle, rgba(196,168,130,0.07) 0%, transparent 70%)', animation: 'imgk-glow 6s ease-in-out infinite reverse' }} />
        </div>

        {/* Card */}
        <div
          className="flex flex-col items-center gap-7 px-8 text-center"
          style={{ animation: 'imgk-card-in 0.55s cubic-bezier(0.22,1,0.36,1) 0.1s both', maxWidth: '360px' }}
        >
          {/* Icon */}
          <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isGranted ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(61,90,53,0.75)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'imgk-overlay-in 0.35s ease both' }}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
                <polyline points="20 6 9 17 4 12" stroke="rgba(61,90,53,0.9)" strokeWidth="2" />
              </svg>
            ) : isDeclined ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(92,64,51,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'imgk-overlay-in 0.35s ease both' }}>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : isDenied ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(127,29,29,0.75)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'lo-icon-shake 0.5s ease both' }}>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
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
              {isGranted
                ? "You're all set"
                : isDeclined
                ? 'All good, no mic needed'
                : isDenied
                ? 'Mic access got blocked'
                : 'Quick mic check'}
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
                : isDeclined
                ? "We'll skip your audio and just record your candidate. Taking you in now."
                : isDenied
                ? checking
                  ? 'Checking your mic settings...'
                  : "No worries, this happens. To turn your mic back on, open your browser's site permissions for this page, set the microphone to Allow, then come back and hit Try again. Or you can skip it and we'll just record your candidate."
                : 'We use your mic so your side of the chat gets recorded too. That gives your candidate a full transcript with both voices. Allow it in the browser popup and you are all set.'}
            </p>
          </div>

          {/* Bottom area: buttons (denied), progress bar (granted/declined), or waiting hint (asking) */}
          {isDenied && !checking ? (
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button className="imgk-btn imgk-btn-primary" onClick={() => void handleTryAgain()}>
                Try again
              </button>
              <button className="imgk-btn imgk-btn-secondary" onClick={() => void handleDecline()}>
                {"I don't provide consent"}
              </button>
            </div>
          ) : isResolved ? (
            /* Draining progress bar + countdown (granted or declined) */
            <div className="flex flex-col items-center gap-2" style={{ width: '200px' }}>
              <div style={{ width: '100%', height: '1.5px', background: 'rgba(92,64,51,0.10)', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: isGranted
                      ? 'linear-gradient(90deg, #3D5A35, rgba(61,90,53,0.6))'
                      : 'linear-gradient(90deg, rgba(92,64,51,0.45), rgba(92,64,51,0.2))',
                    borderRadius: '999px',
                    animation: `imgk-progress ${GATE_DURATION_MS}ms linear forwards`,
                  }}
                />
              </div>
              <p style={{ fontSize: '10px', color: 'rgba(92,64,51,0.35)', fontFamily: "'Work Sans', sans-serif", letterSpacing: '0.04em' }}>
                Opening in {countdown > 0 ? countdown : 1}s
              </p>
            </div>
          ) : (
            /* Asking state or checking state */
            <p style={{ fontSize: '10px', color: 'rgba(92,64,51,0.35)', fontFamily: "'Work Sans', sans-serif", letterSpacing: '0.04em' }}>
              {checking ? 'One moment...' : 'Waiting for your answer...'}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

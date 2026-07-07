'use client'

/**
 * MicGuardOverlay — shared mic-blocked guard for split-screen sessions.
 *
 * The candidate and interviewer windows share one browser mic permission. If
 * either blocks the mic, the candidate's recording breaks, so BOTH windows must
 * surface a warning with the same two choices: fix it (Allow mic) or run the
 * case without recording (Skip recording).
 *
 * This component owns:
 *   - detection (Permissions API + focus/visibility re-query; no track events
 *     here since it must work BEFORE recording even starts — lobby, repository),
 *   - the LobbyOverlay render (Allow mic / Skip recording),
 *   - reshow-after-dismiss so the user can't permanently swipe away a blocking
 *     issue,
 *   - the cross-window decline broadcast + per-lobby persistence.
 *
 * The parent decides WHEN the guard is live via `active`. The guard must be on
 * from the moment the session is set up (candidate lobby step 1) until the
 * recording starts uploading / the session ends — the parent passes
 * `active={false}` past that point and the overlay disappears for good.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMicPermission } from '@/lib/permissions/microphone'
import { LobbyOverlay } from '@/components/lobby/LobbyOverlay'

const NORECORD_SIGNAL_KEY = 'compendium-norecord-signal'
const norecordKey = (lobbyId: string) => `compendium-norecord-${lobbyId}`

export function hasDeclinedRecording(lobbyId: string | null | undefined): boolean {
  if (!lobbyId || typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(norecordKey(lobbyId)) === '1'
}

interface MicGuardOverlayProps {
  /** Whether the guard should be live. Pass false once recording uploads / session ends. */
  active: boolean
  lobbyId: string | null | undefined
  /** Body copy varies slightly by surface; sensible default provided. */
  body?: string
  /** Called whenever recording is declined (this window or cross-window). */
  onDeclined?: () => void
  /** Called after a successful "Allow mic" click (permission actually confirmed
   *  granted). Used by the interviewer's split-screen view to notify the
   *  candidate tab, which owns the actual recorder in same-device mode. */
  onAllowed?: () => void
  /** Fires with true while the mic-blocked overlay is showing, so the parent
   *  can suppress its own overlays (mic-blocked is top priority). */
  onShowingChange?: (showing: boolean) => void
}

const MicIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

export function MicGuardOverlay({ active, lobbyId, body, onDeclined, onAllowed, onShowingChange }: MicGuardOverlayProps) {
  const { state, request, retry } = useMicPermission()
  const [visible, setVisible] = useState(false)
  const [declined, setDeclined] = useState(() => hasDeclinedRecording(lobbyId))
  // Ref mirrors declined so closures (reshow timer, onDismiss) always read the
  // current value -- avoids the stale-closure double-trigger bug where clicking
  // "Skip recording" runs both onSecondaryAction and onDismiss.
  const declinedRef = useRef(false)
  const reshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Notify the parent whenever the overlay shows/hides so it can suppress its
  // own overlays while mic-blocked is on screen (mic-blocked is top priority).
  useEffect(() => { onShowingChange?.(visible) }, [visible, onShowingChange])

  // Hydrate the decline flag if lobbyId resolves after first render.
  useEffect(() => {
    if (hasDeclinedRecording(lobbyId)) {
      declinedRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeclined(true)
    }
  }, [lobbyId])

  // Cross-window decline: if the OTHER window opts out, mirror it here.
  useEffect(() => {
    if (!lobbyId || typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== NORECORD_SIGNAL_KEY || !e.newValue) return
      try {
        const data = JSON.parse(e.newValue) as { lobbyId?: string }
        if (data.lobbyId === lobbyId) {
          try { sessionStorage.setItem(norecordKey(lobbyId), '1') } catch { /* quota */ }
          declinedRef.current = true
          setDeclined(true)
          onDeclined?.()
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [lobbyId, onDeclined])

  // Re-query mic on focus/visibility — Permissions API onchange lags when the
  // user toggles mic via the address-bar lock icon, possibly in another window.
  useEffect(() => {
    if (!active || declined || typeof window === 'undefined') return
    const recheck = () => { void retry() }
    const onVis = () => { if (document.visibilityState === 'visible') void retry() }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [active, declined, retry])

  // Drive overlay visibility from mic state. Off when inactive or declined.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!active || declined) {
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
  }, [active, declined, state])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => () => {
    if (reshowTimerRef.current) clearTimeout(reshowTimerRef.current)
  }, [])

  const allowMic = useCallback(async () => {
    const stream = await request()
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      onAllowed?.()
    } else {
      const state = await retry()
      if (state === 'granted') onAllowed?.()
    }
  }, [request, retry, onAllowed])

  const declineRecording = useCallback(() => {
    if (reshowTimerRef.current) { clearTimeout(reshowTimerRef.current); reshowTimerRef.current = null }
    setVisible(false)
    // Set ref synchronously BEFORE dismiss() fires onDismiss (280ms later) so
    // the onDismiss early-return catches the double-fire.
    declinedRef.current = true
    setDeclined(true)
    if (lobbyId) {
      try { sessionStorage.setItem(norecordKey(lobbyId), '1') } catch { /* quota */ }
      try { localStorage.setItem(NORECORD_SIGNAL_KEY, JSON.stringify({ lobbyId, ts: Date.now() })) } catch { /* quota */ }
    }
    onDeclined?.()
  }, [lobbyId, onDeclined])

  if (!visible) return null

  return (
    <LobbyOverlay
      type="warning"
      icon={MicIcon}
      title="Mic is blocked"
      body={body ?? "This session needs mic access to record audio and generate AI feedback. Open your browser's site permissions for this page, set the microphone to Allow, then tap Allow mic. Or carry on without recording."}
      actionLabel="Allow mic"
      onAction={() => void allowMic()}
      secondaryActionLabel="Skip recording"
      onSecondaryAction={declineRecording}
      onDismiss={() => {
        setVisible(false)
        // Early-return when already declined (e.g. onSecondaryAction just ran) so
        // LobbyOverlay's post-action dismiss() call doesn't schedule a reshow.
        if (declinedRef.current) return
        if (reshowTimerRef.current) clearTimeout(reshowTimerRef.current)
        reshowTimerRef.current = setTimeout(() => {
          reshowTimerRef.current = null
          if (state === 'denied' && active && !declinedRef.current) setVisible(true)
        }, 1500)
      }}
    />
  )
}

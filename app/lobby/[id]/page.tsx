'use client'

import Image from 'next/image'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDoc, onSnapshot } from 'firebase/firestore'
import { MeetingTabShareCard } from '@/components/permissions/MeetingTabShareCard'
import { LobbyOverlay } from '@/components/lobby/LobbyOverlay'
import type { LobbyOverlayProps } from '@/components/lobby/LobbyOverlay'
import { MicGuardOverlay } from '@/components/permissions/MicGuardOverlay'
import { InterviewerMicRecovery } from '@/components/permissions/InterviewerMicRecovery'
import { InterviewerMicGate } from '@/components/permissions/InterviewerMicGate'
import SafariRemoteBlockModal from '@/components/permissions/SafariRemoteBlockModal'
import PlatformLoader from '@/components/PlatformLoader'
import SessionEndedScreen from '@/components/session/SessionEndedScreen'
import { isSafariBrowser } from '@/lib/browser'
import { auth, signInAnonymouslyIfNeeded, waitForAuthUser } from '@/lib/firebase/config'
import { sessionDoc } from '@/lib/firebase/collections'
import { apiPost } from '@/lib/api/client'
import { writeCandidateBeat, readCandidateBeat, sessionEndedForLobby, CANDIDATE_TAB_STALE_MS, CANDIDATE_HEARTBEAT_MS, isCandidateBeatStale, openCandidateTab, isCandidateClosedDismissed, dismissCandidateClosedForSession, interviewerWindowName, writeInterviewerReady, readInterviewerReady, clearInterviewerReady } from '@/lib/session/candidateTab'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

type SessionState = {
  caseId?: string
  caseName?: string
  status?: 'waiting' | 'in_progress' | 'completed' | 'abandoned' | 'replacing' | 'fallback_unrated'
  sessionMode?: 'remote' | 'local'
  expiresAt?: { toDate: () => Date } | Date
  interviewerBrowsing?: boolean
  interviewerAudioCaptured?: boolean
  prevCaseId?: string
  prevCaseName?: string
  interviewerPresence?: { active?: boolean; lastSeenAt?: { toDate: () => Date } }
}

type PopupWindowHost = Window & {
  __compendiumInterviewerWindow?: Window | null
}


function SelectionShellHeader() {
  return (
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
        <div className="flex items-center gap-1">
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
  )
}

function CandidateLobby({
  lobbyId,
  requestedSessionMode,
  interviewerLink,
  sessionIssue,
  candidateActionStatus,
  waitingNudgeVisible,
  interviewerBrowsing,
  interviewerReplacing,
  interviewerRemoteWindowClosed,
  isLaunching,
  launchCaseName,
  onCancelSession,
  onCancelSessionRemote,
  onPrimaryAction,
  onReopenRepo,
}: {
  lobbyId: string
  requestedSessionMode: 'remote' | 'local'
  interviewerLink: string
  sessionIssue: string
  candidateActionStatus: string
  waitingNudgeVisible: boolean
  interviewerBrowsing: boolean
  interviewerReplacing: boolean
  interviewerRemoteWindowClosed: boolean
  isLaunching: boolean
  launchCaseName: string
  onCancelSession: () => void
  onCancelSessionRemote: () => void
  onPrimaryAction: () => void
  onReopenRepo: () => void
}) {
  const isLocalSession = requestedSessionMode === 'local'
  // Mic-blocked guard is live from lobby load until the workspace takes over.
  // On the lobby we're always pre-recording, so it's simply on for local mode.
  const [micGuardShowing, setMicGuardShowing] = useState(false)

  // Heartbeat so the interviewer pages know this candidate tab is alive while
  // it's on the lobby (waiting / browsing / replacing). Mirrors the workspace
  // heartbeat. Interviewer side treats a stale heartbeat (>4s) as "tab gone".
  useEffect(() => {
  if (!isLocalSession) return
  writeCandidateBeat(lobbyId)
  const interval = setInterval(() => writeCandidateBeat(lobbyId), CANDIDATE_HEARTBEAT_MS)
  // Wake ping: refocusing un-throttles timers; write immediately so the
  // interviewer's overlay clears on its very next poll instead of waiting.
  const onVisible = () => { if (document.visibilityState === 'visible') writeCandidateBeat(lobbyId) }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
  }
}, [isLocalSession, lobbyId])


  // ── Session phase ──────────────────────────────────────────────────────────
  // Derives a single phase string from the combination of prop flags so the
  // rest of the render only needs one switch/conditional.
  const sessionPhase: 'waiting' | 'browsing' | 'launching' = isLaunching
    ? 'launching'
    : interviewerBrowsing
      ? 'browsing'
      : 'waiting'

  // ── Popup closed detection ────────────────────────────────────────────────
  // Poll every 2s to detect if the interviewer window was closed by the user.
  // Drives dynamic H1, subtitle, status row, and title pulse so the candidate
  // knows they need to reopen it.
  // cancelInitiatedRef: set true just before we intentionally close the popup
  // via "Cancel session" so the poller doesn't fire the "window closed" overlay.
  const cancelInitiatedRef = useRef(false)
  const [popupWindowClosed, setPopupWindowClosed] = useState(false)
  useEffect(() => {
    if (!isLocalSession) return
    const interval = setInterval(() => {
      if (cancelInitiatedRef.current) return
      const host = window as PopupWindowHost
      let win = host.__compendiumInterviewerWindow
      // If we have no reference but the interviewer reopened this candidate tab,
      // window.opener is the interviewer window — adopt it so the two connect.
      if (!win) {
        const opener = window.opener as Window | null
        if (opener && !opener.closed) {
          host.__compendiumInterviewerWindow = opener
          win = opener
        }
      }
      if (win && win.closed) {
        setPopupWindowClosed(true)
      } else if (!win || !win.closed) {
        setPopupWindowClosed(false)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [isLocalSession])

  // Overlay + title pulse when interviewer popup closes — re-shows until reopened.
  // If the interviewer was in the repository when they closed the popup, send
  // them back to the repo rather than the lobby controls page.
  useEffect(() => {
    if (!isLocalSession) return
    if (popupWindowClosed) {
      startTitlePulse('🖥 Reopen Controls')
      dismissedRef.current.delete('popup-closed')
      const wasOnRepo = interviewerBrowsing || prevBrowsingRef.current
      showOverlay({
        id: 'popup-closed',
        type: 'warning',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ),
        title: 'Interviewer window closed',
        body: wasOnRepo
          ? 'The case repository was open. Reopen it to continue picking a case.'
          : 'Reopen it so the interviewer can pick a case.',
        actionLabel: wasOnRepo ? 'Reopen repository' : 'Reopen window',
        onAction: wasOnRepo ? onReopenRepo : onPrimaryAction,
        secondaryActionLabel: 'Cancel session',
        onSecondaryAction: () => { cancelInitiatedRef.current = true; onCancelSession() },
      })
    } else {
      if (activePulseMessageRef.current === '🖥 Reopen Controls') stopTitlePulse()
      setActiveOverlay(prev => prev?.id === 'popup-closed' ? null : prev)
      if (reshowTimerRef.current) { clearTimeout(reshowTimerRef.current); reshowTimerRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupWindowClosed, isLocalSession])

  // Overlay + title pulse when interviewer closes the repository tab mid-browse
  const prevBrowsingRef = useRef(false)
  useEffect(() => {
    if (!isLocalSession) return
    const wasTrue = prevBrowsingRef.current
    prevBrowsingRef.current = interviewerBrowsing
    // Only trigger when browsing transitions true → false (tab was closed)
    // and we haven't launched yet (launching means they selected a case fine)
    if (!wasTrue || interviewerBrowsing || sessionPhase === 'launching') return
    // Interviewer navigated back within the popup (e.g. repo → interviewer panel)
    // — popup is still open, repo just unmounted. Don't show the overlay.
    const popupHost = window as PopupWindowHost
    if (popupHost.__compendiumInterviewerWindow && !popupHost.__compendiumInterviewerWindow.closed) return
    startTitlePulse('📋 Reopen Repository')
    dismissedRef.current.delete('repo-closed')
    showOverlay({
      id: 'repo-closed',
      type: 'warning',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      ),
      title: 'Case repository was closed',
      body: 'The interviewer closed the case repository. Reopen it to pick a case.',
      actionLabel: 'Reopen repository',
      onAction: onReopenRepo,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewerBrowsing, isLocalSession, sessionPhase])

  // Remote mode only: interviewer's window/tab went stale (waiting or
  // replacing). No "reopen" action possible on someone else's device — offer
  // "Copy link" to re-share the original invite, or "Cancel session" to back
  // out to practice mode selection.
  useEffect(() => {
    if (isLocalSession) return
    if (interviewerRemoteWindowClosed) {
      dismissedRef.current.delete('interviewer-remote-window-closed')
      showOverlay({
        id: 'interviewer-remote-window-closed',
        type: 'warning',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ),
        title: "Looks like your interviewer's window closed",
        body: 'Send them the link again so they can hop back in, or cancel and pick a mode later.',
        actionLabel: 'Copy link',
        onAction: () => { void navigator.clipboard.writeText(interviewerLink).catch(() => {}) },
        secondaryActionLabel: 'Cancel session',
        onSecondaryAction: onCancelSessionRemote,
      })
    } else {
      setActiveOverlay(prev => prev?.id === 'interviewer-remote-window-closed' ? null : prev)
      if (reshowTimerRef.current) { clearTimeout(reshowTimerRef.current); reshowTimerRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewerRemoteWindowClosed, isLocalSession, interviewerLink])

  const interviewerLinkDisplay = isLocalSession ? '' : interviewerLink.replace(/^https?:\/\//, '')
  const interviewerLinkPreview = isLocalSession
    ? ''
    : interviewerLinkDisplay.length > 46
      ? `${interviewerLinkDisplay.slice(0, 22)}...${interviewerLinkDisplay.slice(-16)}`
      : interviewerLinkDisplay
  const remoteCopySucceeded = candidateActionStatus === 'Link copied'
  const remoteCopyFailed = candidateActionStatus === 'Unable to copy'
  const localWindowReady = candidateActionStatus === 'Interviewer window ready'
  const localPopupBlocked = candidateActionStatus === 'Allow popups to continue'
  const remoteActionButtonLabel =
    remoteCopySucceeded ? 'Copied' : remoteCopyFailed ? 'Retry' : 'Copy link'
  const localActionButtonLabel =
    localWindowReady ? 'Ready' : localPopupBlocked ? 'Allow popups' : 'Show controls'
  // ── Dynamic text — all driven by sessionPhase + popupWindowClosed ─────────
  const step01Text = isLocalSession ? 'Controls ready' : 'Send invite'
  const step02Text =
    sessionPhase === 'launching' ? 'Case selected' :
    interviewerReplacing ? 'Replacing case' :
    sessionPhase === 'browsing' ? 'Picking a case now' :
    'Interviewer picks case'
  const step02Active = sessionPhase === 'browsing' || sessionPhase === 'launching' || interviewerReplacing

  const waitingSteps = [
    { num: '01', text: step01Text, active: sessionPhase === 'waiting' && !popupWindowClosed },
    { num: '02', text: step02Text, active: step02Active },
    { num: '03', text: 'Review dashboard' },
  ]

  const pageH1Secondary =
    sessionPhase === 'launching'
      ? (launchCaseName || 'your workspace')
      : sessionPhase === 'browsing'
        ? 'Picking a Case'
        : interviewerReplacing
          ? 'Replacing Case'
          : popupWindowClosed
            ? 'Window Closed'
            : 'for Interviewer'

  const pageH1Primary =
    sessionPhase === 'launching'
      ? 'Opening'
      : sessionPhase === 'browsing'
        ? 'Interviewer is'
        : interviewerReplacing
          ? 'Interviewer is'
          : popupWindowClosed
            ? 'Interviewer'
            : 'Waiting'

  const pageSubtitle =
    sessionPhase === 'launching'
      ? 'Session capture is live. Your workspace is opening now.'
      : sessionPhase === 'browsing'
        ? 'Sit tight, a case is on its way.'
        : interviewerReplacing
          ? 'The interviewer swapped the case. Sit tight while they pick a new one.'
          : popupWindowClosed
            ? 'The interviewer window closed. Reopen it to continue.'
            : 'Your workspace opens on its own once the interviewer picks a case.'

  const statusTitle =
    sessionPhase === 'launching'
      ? 'Session capture is live'
      : sessionPhase === 'browsing'
        ? 'Interviewer is choosing a case'
        : interviewerReplacing
          ? 'Interviewer is picking a new case'
          : popupWindowClosed
            ? 'Interviewer window was closed'
            : isLocalSession ? 'Interviewer controls are ready' : 'Invite ready to share'

  const statusHelper =
    sessionPhase === 'launching'
      ? 'Opening your workspace in a moment.'
      : sessionPhase === 'browsing'
        ? 'Your workspace will open the second they confirm.'
        : interviewerReplacing
          ? 'Your workspace will open again once the new case is confirmed.'
          : popupWindowClosed
            ? 'Reopen it below so the interviewer can pick a case.'
            : isLocalSession
              ? 'Lost it? Bring the window back anytime.'
              : 'Copy the link below and send it to your interviewer.'

  const localActionDescription = localPopupBlocked
    ? 'Allow popups first, then try again.'
    : 'Need it back? Open the interviewer window here.'

  // ── Overlay state ──────────────────────────────────────────────────────────
  type ActiveOverlay = Omit<LobbyOverlayProps, 'onDismiss'> & { id: string }
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay | null>(null)
  const dismissedRef = useRef<Set<string>>(new Set())
  const titlePulseRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const originalTitleRef = useRef(
    typeof document !== 'undefined' ? document.title : 'Compendium X'
  )

  const showOverlay = useCallback((o: ActiveOverlay) => {
    if (dismissedRef.current.has(o.id)) return
    // Don't re-set if the same overlay id is already showing
    setActiveOverlay(prev => (prev?.id === o.id ? prev : o))
  }, [])

  const reshowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismissOverlay = useCallback(() => {
    setActiveOverlay(prev => {
      if (!prev) return null
      // Permanently dismiss info toasts only — they're confirmations, not problems.
      if (prev.type === 'info') {
        dismissedRef.current.add(prev.id)
        return null
      }
      // For mandatory overlays: clear any existing reshow timer, then schedule
      // a reshow in 1.5s. The reshow calls showOverlay which checks the live
      // activeOverlay state — if the issue is already resolved by then it won't fire.
      if (reshowTimerRef.current) clearTimeout(reshowTimerRef.current)
      const snapshot = prev
      reshowTimerRef.current = setTimeout(() => {
        setActiveOverlay(current => {
          // Only re-show if no overlay is already visible and the id isn't permanently dismissed
          if (current !== null) return current
          if (dismissedRef.current.has(snapshot.id)) return current
          return snapshot
        })
      }, 1500)
      return null
    })
  }, [])

  // Clean up reshow timer on unmount
  useEffect(() => () => {
    if (reshowTimerRef.current) clearTimeout(reshowTimerRef.current)
  }, [])

  // Title pulse for cross-tab awareness on mandatory overlays.
  // Pulses faster (900ms) so it's noticeable in the tab bar while the user
  // is on another tab. Resets title immediately when the user returns to this tab.
  const activePulseMessageRef = useRef<string | null>(null)

  const startTitlePulse = useCallback((message: string) => {
    activePulseMessageRef.current = message
    if (titlePulseRef.current) return
    let flip = false
    titlePulseRef.current = setInterval(() => {
      const msg = activePulseMessageRef.current
      document.title = flip ? originalTitleRef.current : (msg ? `${msg} · Case CompendiumX` : originalTitleRef.current)
      flip = !flip
    }, 900)
  }, [])

  const stopTitlePulse = useCallback(() => {
    activePulseMessageRef.current = null
    if (!titlePulseRef.current) return
    clearInterval(titlePulseRef.current)
    titlePulseRef.current = null
    document.title = originalTitleRef.current
  }, [])

  useEffect(() => () => stopTitlePulse(), [stopTitlePulse])

  // When user switches back to this tab while a mandatory state is active,
  // immediately show the alert title so they know something needs attention.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && activePulseMessageRef.current) {
        document.title = `${activePulseMessageRef.current} · Case CompendiumX`
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Clear repo-closed overlay when interviewer reopens the library or case launches
  useEffect(() => {
    if (interviewerBrowsing || sessionPhase === 'launching') {
      setActiveOverlay(prev => prev?.id === 'repo-closed' ? null : prev)
      if (activePulseMessageRef.current === '📋 Reopen Repository') stopTitlePulse()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewerBrowsing, sessionPhase])

  // ── Waiting nudge overlay ──────────────────────────────────────────────────
  useEffect(() => {
    if (!waitingNudgeVisible) return
    startTitlePulse('⏳ Still Waiting')
    showOverlay({
      id: 'waiting-nudge',
      type: 'warning',
      icon: <ClockIcon size={14} />,
      title: 'Still waiting',
      body: isLocalSession
        ? "The interviewer window hasn't picked a case. Stuck? Start fresh."
        : "Your interviewer hasn't joined yet. Resend the link or start fresh.",
      actionLabel: 'Cancel session',
      onAction: () => { cancelInitiatedRef.current = true; onCancelSession() },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingNudgeVisible])

  // ── Back-button / close guard ─────────────────────────────────────────────
  // While the candidate is waiting (session not yet launching to workspace),
  // intercept browser back button and close/reload so they get a soft heads-up.
  // Audio hasn't started yet — leaving won't lose a recording — but the
  // interviewer may still be picking a case on the other window.
  const leaveGuardActiveRef = useRef(false)
  useEffect(() => {
    if (sessionPhase === 'launching') return
    leaveGuardActiveRef.current = true
    // Push a dummy history entry so popstate fires when back is pressed.
    history.pushState(null, '', window.location.href)

    const onPopstate = () => {
      if (!leaveGuardActiveRef.current) return
      // Re-push so the user stays on this page until they confirm leave.
      history.pushState(null, '', window.location.href)
      // Mark as permanently dismissed so X-close doesn't trigger reshow.
      dismissedRef.current.delete('lobby-leave-warning')
      showOverlay({
        id: 'lobby-leave-warning',
        type: 'warning',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        ),
        title: 'Heading out?',
        body: "Your recording hasn't started yet, so nothing will be lost. But the interviewer may still be picking a case on their window.",
        autoDismissMs: 8000,
        actionLabel: 'Leave anyway',
        onAction: () => {
          leaveGuardActiveRef.current = false
          dismissedRef.current.add('lobby-leave-warning')
          window.location.href = '/practice'
        },
      })
      // Permanently dismiss on X-close (no reshow) by pre-adding to dismissedRef
      // after a short tick so showOverlay itself can run first.
      setTimeout(() => dismissedRef.current.add('lobby-leave-warning'), 0)
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaveGuardActiveRef.current) return
      event.preventDefault()
    }

    window.addEventListener('popstate', onPopstate)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      leaveGuardActiveRef.current = false
      window.removeEventListener('popstate', onPopstate)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPhase])

  // After the user dismisses or the overlay auto-dismisses, if they wanted to
  // go back the guard will have re-pushed history — they can just press back again
  // and the browser will navigate normally (guard is still active but re-push lets
  // them proceed after a second attempt).

  // ── Session issue overlay ──────────────────────────────────────────────────
  const prevSessionIssueRef = useRef('')
  useEffect(() => {
    // When issue clears (network restored / poll succeeded), dismiss any
    // active connection overlay and stop any title pulse for it.
    if (!sessionIssue) {
      prevSessionIssueRef.current = ''
      setActiveOverlay(prev =>
        prev?.id.startsWith('session-issue-') ? null : prev
      )
      stopTitlePulse()
      return
    }
    if (sessionIssue === prevSessionIssueRef.current) return
    prevSessionIssueRef.current = sessionIssue

    const isFatal =
      sessionIssue.includes('not found') || sessionIssue.includes('initialize') || sessionIssue.includes('expired')
    if (isFatal) startTitlePulse('⚠️ Action Needed')
    showOverlay({
      id: `session-issue-${sessionIssue}`,
      // Fatal errors are mandatory (re-show). Transient hiccups are info-like:
      // auto-dismiss and never re-show — network is self-healing.
      type: isFatal ? 'error' : 'info',
      icon: <WifiIcon size={14} />,
      title: isFatal ? 'Something went wrong' : 'Connection hiccup',
      body: isFatal
        ? 'Refresh the page or grab a new practice link.'
        : 'Reconnecting in the background.',
      autoDismissMs: isFatal ? undefined : 6000,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIssue])

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative min-h-screen flex flex-col bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        @keyframes candidate-fade-up {
          from { opacity: 0; transform: translateY(16px); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes candidate-card-in {
          from { opacity: 0; transform: translateY(20px) scale(0.985); filter: blur(3px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes candidate-bg-shift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.72; }
          50% { transform: translate3d(18px, -12px, 0) scale(1.04); opacity: 0.9; }
        }
        @keyframes candidate-glow {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.65; }
          33% { transform: translate(24px, -18px) scale(1.08); opacity: 0.8; }
          66% { transform: translate(-18px, 12px) scale(0.96); opacity: 0.58; }
        }
        @keyframes candidate-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes candidate-step-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(61,90,53,0.08), 0 0 0 0 rgba(61,90,53,0.04);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(61,90,53,0.06), 0 10px 18px rgba(61,90,53,0.08);
          }
        }
        @keyframes candidate-pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0.6; }
        }
        @keyframes candidate-invite-glow {
          0%, 100% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.62), 0 6px 14px rgba(59,47,47,0.035), 0 0 0 rgba(61,90,53,0);
            border-color: rgba(92,64,51,0.08);
          }
          50% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.68), 0 14px 28px rgba(61,90,53,0.05), 0 0 0 1px rgba(61,90,53,0.04);
            border-color: rgba(92,64,51,0.08);
          }
        }
        @keyframes candidate-invite-aura {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.38; }
          50% { transform: translate(14px, -8px) scale(1.06); opacity: 0.52; }
        }
        .candidate-glass {
          position: relative;
          background: rgba(255,248,240,0.6);
          backdrop-filter: blur(28px) saturate(1.5);
          -webkit-backdrop-filter: blur(28px) saturate(1.5);
          border: 1px solid rgba(92,64,51,0.08);
          box-shadow: 0 4px 14px rgba(59,47,47,0.035);
          transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s ease;
        }
        .candidate-glass:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.03);
          border-color: rgba(61,90,53,0.15);
        }
        .candidate-glass::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #3D5A35, #695c4d);
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .candidate-glass:hover::after {
          opacity: 1;
        }
        .candidate-btn {
          background: rgba(255,248,240,0.84);
          border: 1px solid rgba(61,90,53,0.16);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72), 0 1px 2px rgba(61,90,53,0.04);
          transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .candidate-btn:hover {
          background: rgba(61,90,53,0.08);
          border-color: rgba(61,90,53,0.28);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 6px 14px rgba(61,90,53,0.06);
          transform: translateY(-1px);
        }
        .candidate-link-shell {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border: 1px solid rgba(92,64,51,0.08);
          background: rgba(255,248,240,0.6);
          backdrop-filter: blur(28px) saturate(1.5);
          -webkit-backdrop-filter: blur(28px) saturate(1.5);
          box-shadow: 0 4px 14px rgba(59,47,47,0.035);
          transition: border-color 0.25s ease, transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease;
          animation: candidate-invite-glow 5.2s ease-in-out infinite;
        }
        .candidate-link-shell::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 18% 50%, rgba(61,90,53,0.06) 0%, rgba(61,90,53,0.025) 24%, transparent 62%);
          animation: candidate-invite-aura 8s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }
        .candidate-link-shell:hover {
          border-color: rgba(61,90,53,0.16);
          transform: translateY(-1px);
          box-shadow: 0 16px 30px rgba(61,90,53,0.05), 0 0 0 1px rgba(61,90,53,0.05);
        }
        .candidate-link-icon {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(61,90,53,0.08);
          background: rgba(255,248,240,0.5);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px rgba(61,90,53,0.04);
          flex-shrink: 0;
        }
        .candidate-chip-btn {
          position: relative;
          z-index: 1;
          display: inline-flex; 
          align-items: center;
          gap: 6px;
          padding: 10px 15px;
          border-radius: 999px;
          border: 1px solid rgba(61,90,53,0.16);
          background: rgba(255,248,240,0.82);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72), 0 1px 2px rgba(61,90,53,0.04);
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          flex-shrink: 0;
          transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .candidate-chip-btn.success {
          background: rgba(61,90,53,0.11);
          border-color: rgba(61,90,53,0.24);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.78), 0 8px 18px rgba(61,90,53,0.08);
        }
        .candidate-chip-btn.error {
          border-color: rgba(146,64,14,0.14);
          color: rgba(146,64,14,0.9);
        }
        .candidate-chip-icon {
          animation: candidate-check-in 0.28s cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes candidate-check-in {
          from { opacity: 0; transform: scale(0.7) translateY(1px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .candidate-link-shell:hover .candidate-chip-btn {
          background: rgba(61,90,53,0.08);
          border-color: rgba(61,90,53,0.24);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 6px 14px rgba(61,90,53,0.06);
          transform: translateY(-1px);
        }
        .candidate-step-active {
          animation: candidate-step-pulse 2.8s ease-in-out infinite;
        }
      `}</style>

      {/* Mic-blocked guard -- live in both modes. MicGuardOverlay self-suppresses
          when the candidate has already opted out (reads compendium-norecord-<id>).
          In remote mode, onDeclined also writes the opt-out to the session doc so
          the interviewer gate can suppress itself (mirrors the practice-launch POST). */}
      <MicGuardOverlay
        active={true}
        lobbyId={lobbyId}
        onShowingChange={setMicGuardShowing}
        onDeclined={isLocalSession ? undefined : () => {
          void (async () => {
            try {
              const token = await auth.currentUser?.getIdToken()
              if (token) {
                void fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ role: 'candidate', active: true, candidateOptedOutRecording: true }),
                  keepalive: true,
                })
              }
            } catch { /* best-effort */ }
          })()
        }}
      />

      {/* Overlay toast (suppressed while the mic-blocked guard is on screen) */}
      {activeOverlay && !micGuardShowing ? (
        <LobbyOverlay
          key={activeOverlay.id}
          {...activeOverlay}
          onDismiss={dismissOverlay}
        />
      ) : null}

      <SelectionShellHeader />

      <main className="relative flex min-h-[calc(100vh-70px)] flex-1 flex-col justify-center overflow-hidden px-4 pb-20 pt-[90px] md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl w-full">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-[320px]"
              style={{ background: 'linear-gradient(180deg, rgba(244,237,227,0.72) 0%, rgba(255,248,240,0) 100%)' }}
            />
            <div
              className="absolute -top-2 left-[8%] h-[420px] w-[420px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(61,90,53,0.095) 0%, rgba(61,90,53,0.055) 22%, transparent 68%)', animation: 'candidate-bg-shift 15s ease-in-out infinite' }}
            />
            <div
              className="absolute top-[18%] right-[6%] h-[340px] w-[340px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(92,64,51,0.065) 0%, rgba(92,64,51,0.035) 24%, transparent 70%)', animation: 'candidate-glow 17s ease-in-out infinite reverse' }}
            />
            <div
              className="absolute bottom-[12%] left-[22%] h-[260px] w-[260px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(196,168,130,0.075) 0%, transparent 66%)', animation: 'candidate-glow 18s ease-in-out infinite' }}
            />
          </div>

          <div
            className="mb-7 max-w-[760px]"
            style={{ animation: 'candidate-fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[2px]">
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#3D5A35]/20 text-[#3D5A35]/60 bg-[#3D5A35]/5 leading-tight uppercase">
                Candidate Mode
              </span>
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight uppercase">
                {requestedSessionMode === 'local' ? 'Same Device' : 'Remote Partner'}
              </span>
            </div>
            <h1
              className="text-4xl font-light leading-[0.94] tracking-tight text-[#453a2a] md:text-5xl"
              style={{ fontFamily: "'Newsreader', serif" }}
            >
              {pageH1Primary} <span className="text-[#3D5A35]">{pageH1Secondary}</span>
            </h1>
            <p className="mt-4 max-w-[620px] pl-[2px] text-[13px] leading-relaxed text-[#5c4033]/62">
              {pageSubtitle}
            </p>
          </div>

          <div
            className="candidate-glass overflow-hidden rounded-xl"
            style={{ animation: 'candidate-card-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s both' }}
          >
            <div className="relative flex items-center gap-3 overflow-hidden px-6 py-5">
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(61,90,53,0.05) 0%, transparent 70%)' }}
              />
              <div
                className="pointer-events-none absolute bottom-0 left-6 right-6 h-[1px]"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(61,90,53,0.1) 20%, rgba(196,168,130,0.08) 80%, transparent 100%)' }}
              />
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#3D5A35]/8">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="relative">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inset-0 rounded-full bg-[#3D5A35]" style={{ animation: 'candidate-pulse-ring 2s ease-in-out infinite' }} />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#3D5A35]" />
                  </span>
                  <span className="text-[12px] font-medium text-[#3B2F2F]">{statusTitle}</span>
                </div>
                <span className="mt-1 block text-[10px] text-[#5C4033]/35">
                  {statusHelper}
                </span>
              </div>
            </div>

            <div className="px-6 py-6">
              <div className="grid gap-5 grid-cols-3">
                {waitingSteps.map((step, index) => (
                  <div
                    key={step.num}
                    className="flex flex-col items-center gap-2.5 text-center"
                    style={{ animation: `candidate-step-in 0.4s cubic-bezier(0.22,1,0.36,1) ${0.24 + index * 0.08}s both` }}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[9px] font-semibold tracking-wider ${
                      step.active ? 'bg-[#3D5A35] text-white' : 'bg-[#D9D0C4]/25 text-[#5C4033]/40'
                    } ${step.active ? 'candidate-step-active' : ''}`}>
                      {step.num}
                    </span>
                    <span className={`text-[12px] leading-snug ${
                      step.active ? 'font-medium text-[#3B2F2F]' : 'text-[#5C4033]/50'
                    }`}>
                      {step.text}
                    </span>
                  </div>
                ))}
              </div>

              {isLocalSession ? (
                <div className="mt-6 mx-auto w-full max-w-[540px]">
                  <button
                    type="button"
                    onClick={onPrimaryAction}
                    className="candidate-link-shell flex w-full items-center gap-3 rounded-[28px] px-3.5 py-3 text-left"
                  >
                    <span className="candidate-link-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                        <rect x="4" y="3" width="16" height="12" rx="2" />
                        <path d="M8 21h8" />
                        <path d="M12 15v6" />
                      </svg>
                    </span>
                    <span className="relative z-[1] min-w-0 flex-1 pr-1">
                      <span className="block truncate text-[12px] text-[#453a2a]/72">
                        {localActionDescription}
                      </span>
                    </span>
                    <span className={`candidate-chip-btn ${localWindowReady ? 'success' : ''} ${localPopupBlocked ? 'error' : ''}`}>
                      {localWindowReady ? (
                        <svg className="candidate-chip-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                      {localActionButtonLabel}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="mt-6 mx-auto w-full max-w-[540px]">
                  <button
                    type="button"
                    onClick={onPrimaryAction}
                    className="candidate-link-shell flex w-full items-center gap-3 rounded-[28px] px-3.5 py-3 text-left"
                  >
                    <span className="candidate-link-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
                        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13 20" />
                      </svg>
                    </span>
                    <span className="relative z-[1] min-w-0 flex-1 pr-1">
                      <span
                        title={interviewerLink}
                        className="block truncate text-[12px] text-[#453a2a]/72"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {interviewerLinkPreview}
                      </span>
                    </span>
                    <span className={`candidate-chip-btn ${remoteCopySucceeded ? 'success' : ''} ${remoteCopyFailed ? 'error' : ''}`}>
                      {remoteCopySucceeded ? (
                        <svg className="candidate-chip-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                      {remoteActionButtonLabel}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function ClockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function WifiIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

function InterviewerLobby({
  lobbyId,
  requestedSessionMode,
  router,
  showHandoff,
}: {
  lobbyId: string
  requestedSessionMode: string
  router: AppRouterInstance
  showHandoff: boolean
}) {
  const [elapsed, setElapsed] = useState(0)
  // Only show handoff if ?handoff=1 AND it hasn't already played this session.
  // sessionStorage survives back-navigation within the same tab but resets on
  // a fresh open — so navigating back from the repo no longer replays it.
  const handoffKey = `compendium-handoff-shown-${lobbyId}`
  const alreadyShown = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(handoffKey) === '1'
  const [handoffVisible, setHandoffVisible] = useState(showHandoff && !alreadyShown)
  const [handoffCountdown, setHandoffCountdown] = useState(5)
  const startRef = useRef<number | null>(null)
  const [showCloseWarning, setShowCloseWarning] = useState(false)
  const closeAttemptRef = useRef(false)
  const isLocalMode = requestedSessionMode === 'local'
  // Welcome-link auto-resume: this is the ONE link the interviewer ever gets,
  // shared before the session even starts. If their tab closes/crashes at any
  // later point, reopening this same link should take them straight back to
  // wherever they left off, instead of always showing the generic welcome
  // screen. Checked once on mount, before the welcome UI renders.
  const [checkingResume, setCheckingResume] = useState(true)
  const [sessionAlreadyEnded, setSessionAlreadyEnded] = useState(false)
  // Remote mode: show the full-screen mic gate before the welcome lobby.
  // Gate is skipped if mic was already granted on this device or the session
  // key indicates it was already shown and resolved.
  const micGateShownKey = `compendium-interviewer-micgate-shown-${lobbyId}`
  const [micGateVisible, setMicGateVisible] = useState(
    !isLocalMode &&
    (typeof sessionStorage === 'undefined' || sessionStorage.getItem(micGateShownKey) !== '1')
  )
  const [micGuardShowing, setMicGuardShowing] = useState(false)
  // Stable callback so the gate's timer effect never re-runs mid-countdown.
  const handleMicGateResolved = useCallback(() => {
    setMicGateVisible(false)
    setHandoffVisible(false)
  }, [])
  const [candidateTabClosed, setCandidateTabClosed] = useState(false)
  const candidateTabUrlRef = useRef<string | null>(null)
  // True once we've seen at least one fresh heartbeat — so a candidate tab that
  // never opened doesn't immediately read as "closed".
  const candidateWasAliveRef = useRef(false)
const candidateStaleStreakRef = useRef(0)

  // Poll every 1s for the candidate heartbeat. A heartbeat older than the stale
  // threshold, after we've seen the tab alive, means it closed unexpectedly.
  useEffect(() => {
    if (!isLocalMode) return
    const interval = setInterval(() => {
      if (sessionEndedForLobby(lobbyId) || isCandidateClosedDismissed(lobbyId)) {
  setCandidateTabClosed(false)
  candidateStaleStreakRef.current = 0
  return
}
      const beat = readCandidateBeat(lobbyId)
if (!beat) return
if (beat.url) candidateTabUrlRef.current = beat.url
if (!isCandidateBeatStale(beat)) {
  candidateWasAliveRef.current = true
  candidateStaleStreakRef.current = 0
  setCandidateTabClosed(false)              // clear instantly on a fresh beat
} else if (candidateWasAliveRef.current) {
  candidateStaleStreakRef.current += 1      // debounce: require 2 in a row
  if (candidateStaleStreakRef.current >= 2) setCandidateTabClosed(true)
}
    }, 1000)
    return () => clearInterval(interval)
  }, [isLocalMode, lobbyId])

  useEffect(() => {
    let armed = false
    const armTimer = setTimeout(() => { armed = true }, 3000)
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!armed) return
      closeAttemptRef.current = true
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    const onReturn = () => {
      if (!closeAttemptRef.current) return
      closeAttemptRef.current = false
      if (armed) setShowCloseWarning(true)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onReturn() })
    window.addEventListener('focus', onReturn)
    return () => {
      clearTimeout(armTimer)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('focus', onReturn)
    }
  }, [])

  // Welcome-link auto-resume: one-shot read of the session doc, before the
  // welcome UI renders, so a returning interviewer lands exactly where they
  // left off instead of always seeing "Welcome, Interviewer" again.
  useEffect(() => {
    let cancelled = false
    const resume = async () => {
      try {
        const snap = await getDoc(sessionDoc(lobbyId))
        if (cancelled) return
        if (!snap.exists()) {
          setCheckingResume(false)
          return
        }
        const data = snap.data() as SessionState
        const mode = data.sessionMode === 'local' ? 'local' : 'remote'

        if (data.status === 'completed' || data.status === 'abandoned' || data.status === 'fallback_unrated') {
          setSessionAlreadyEnded(true)
          setCheckingResume(false)
          return
        }
        if (data.status === 'in_progress' && data.caseId) {
          router.replace(`/case/${data.caseId}/interviewer?lobby=${lobbyId}&role=interviewer&sessionMode=${mode}`)
          return
        }
        if (data.status === 'replacing') {
          const params = new URLSearchParams({ mode: 'select', lobby: lobbyId, sessionMode: mode })
          if (data.prevCaseId) params.set('prevCaseId', data.prevCaseId)
          if (data.prevCaseName) params.set('prevCaseName', data.prevCaseName)
          router.replace(`/repository?${params.toString()}`)
          return
        }
        if (data.status === 'waiting' && data.interviewerBrowsing === true) {
          // Last seen on the case picker (tab closed before that page's own
          // cleanup could clear this flag) — go straight back there.
          router.replace(`/repository?mode=select&lobby=${lobbyId}&sessionMode=${mode}`)
          return
        }
        // Fresh session, or plain 'waiting' with no browsing history — show
        // the normal welcome screen exactly as before.
        setCheckingResume(false)
      } catch {
        // Best-effort — if the check fails for any reason, fall back to the
        // normal welcome screen rather than leaving the interviewer stuck.
        if (!cancelled) setCheckingResume(false)
      }
    }
    void resume()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId])

  useEffect(() => {
    // Don't start the handoff timer while the mic gate is covering the screen.
    if (!handoffVisible || micGateVisible) return
    // Mark as shown so back-navigation never replays it.
    try { sessionStorage.setItem(handoffKey, '1') } catch { /* quota */ }
    let count = 5
    const interval = setInterval(() => {
      count -= 1
      setHandoffCountdown(count)
      if (count <= 0) clearInterval(interval)
    }, 1000)
    const timer = setTimeout(() => setHandoffVisible(false), 5000)
    return () => { clearInterval(interval); clearTimeout(timer) }
  }, [handoffVisible, handoffKey, micGateVisible])

  useEffect(() => {
    startRef.current = Date.now()
    const interval = setInterval(() => {
      if (startRef.current === null) return
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Remote mode: interviewer presence heartbeat while waiting on this screen
  // (before a case is picked). Without this, interviewerPresence.lastSeenAt is
  // never populated during 'waiting', so the candidate's disconnect detection
  // has nothing to go stale against. Mirrors the same heartbeat used in
  // InterviewerExperience (in_progress) and the repository page (replacing).
  useEffect(() => {
    if (isLocalMode || !lobbyId) return
    const sendHeartbeat = () => {
      apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
        role: 'interviewer',
        active: true,
      }).catch(() => { /* best-effort */ })
    }
      sendHeartbeat()
  const interval = setInterval(sendHeartbeat, 2_000)
  const onVisible = () => { if (document.visibilityState === 'visible') sendHeartbeat() }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
  }
}, [isLocalMode, lobbyId])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (checkingResume) {
    return <PlatformLoader message="Getting your space ready" />
  }

  if (sessionAlreadyEnded) {
    return <SessionEndedScreen />
  }

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative min-h-screen flex flex-col bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        @keyframes _hi{from{opacity:0;transform:translateY(10px)}to{opacity:0.5;transform:translateY(0)}}
        @keyframes _name{from{opacity:0;transform:translateY(16px);filter:blur(8px)}to{opacity:1;transform:translateY(0);filter:blur(0px)}}
        @keyframes handoff-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes handoff-card-in { from { opacity: 0; transform: translateY(22px) scale(0.97); filter: blur(3px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
        @keyframes handoff-progress { from { width: 100%; } to { width: 0%; } }
        @keyframes handoff-pass {
          0%   { transform: translateX(-46px) translateY(0) scale(0.96); opacity: 0; }
          14%  { transform: translateX(-46px) translateY(0) scale(0.96); opacity: 1; }
          50%  { transform: translateX(0) translateY(-10px) scale(1.04); opacity: 1; }
          86%  { transform: translateX(46px) translateY(0) scale(0.96); opacity: 1; }
          100% { transform: translateX(46px) translateY(0) scale(0.96); opacity: 0; }
        }
        @keyframes handoff-giver { 0%, 20% { opacity: 0.85; } 55%, 100% { opacity: 0.30; } }
        @keyframes handoff-receiver { 0%, 55% { opacity: 0.30; } 88%, 100% { opacity: 0.85; } }
        @keyframes handoff-pass-shadow {
          0%   { transform: translateX(-46px) scaleX(1); opacity: 0; }
          14%  { transform: translateX(-46px) scaleX(1); opacity: 0.14; }
          50%  { transform: translateX(0) scaleX(0.7); opacity: 0.06; }
          86%  { transform: translateX(46px) scaleX(1); opacity: 0.14; }
          100% { transform: translateX(46px) scaleX(1); opacity: 0; }
        }
        @keyframes handoff-glow { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.55; transform: scale(1.08); } }
        @keyframes lobby-fade-up {
          from { opacity: 0; transform: translateY(16px); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes lobby-card-in {
          from { opacity: 0; transform: translateY(20px) scale(0.985); filter: blur(3px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes lobby-glow {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
          33% { transform: translate(30px, -20px) scale(1.1); opacity: 0.85; }
          66% { transform: translate(-20px, 15px) scale(0.95); opacity: 0.65; }
        }
        @keyframes lobby-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lobby-step-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(61,90,53,0.08), 0 0 0 0 rgba(61,90,53,0.04);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(61,90,53,0.06), 0 10px 18px rgba(61,90,53,0.08);
          }
        }
        @keyframes lobby-btn-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes lobby-pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0.6; }
        }
        .lobby-glass {
          position: relative;
          background: rgba(255,248,240,0.6);
          backdrop-filter: blur(28px) saturate(1.5);
          -webkit-backdrop-filter: blur(28px) saturate(1.5);
          border: 1px solid rgba(92,64,51,0.08);
          box-shadow: 0 4px 14px rgba(59,47,47,0.035);
          transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s ease;
        }
        .lobby-glass:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.03);
          border-color: rgba(61,90,53,0.15);
        }
        .lobby-glass::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #3D5A35, #695c4d);
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .lobby-glass:hover::after {
          opacity: 1;
        }
        .lobby-btn {
          background: rgba(255,248,240,0.84);
          border: 1px solid rgba(61,90,53,0.16);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72), 0 1px 2px rgba(61,90,53,0.04);
          transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .lobby-btn:hover {
          background: rgba(61,90,53,0.08);
          border-color: rgba(61,90,53,0.28);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 6px 14px rgba(61,90,53,0.06);
          transform: translateY(-1px);
        }
        .lobby-step-active {
          animation: lobby-step-pulse 2.8s ease-in-out infinite;
        }
      `}</style>

      {/* Interviewer mic gate — full-screen prompt shown on first remote arrival */}
      {micGateVisible ? (
        <InterviewerMicGate
          lobbyId={lobbyId}
          onResolved={handleMicGateResolved}
        />
      ) : null}

      {/* Handoff overlay — covers the interviewer window for 5s on first load */}
      {!micGateVisible && handoffVisible ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)', background: 'rgba(255,248,240,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'handoff-overlay-in 0.5s cubic-bezier(0.22,1,0.36,1) both' }}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: '30%', left: '35%', width: '360px', height: '360px', borderRadius: '999px', background: 'radial-gradient(circle, rgba(61,90,53,0.07) 0%, transparent 70%)', animation: 'handoff-glow 5s ease-in-out infinite' }} />
            <div style={{ position: 'absolute', top: '40%', right: '30%', width: '260px', height: '260px', borderRadius: '999px', background: 'radial-gradient(circle, rgba(196,168,130,0.07) 0%, transparent 70%)', animation: 'handoff-glow 6s ease-in-out infinite reverse' }} />
          </div>
          <div className="flex flex-col items-center gap-7 px-8 text-center" style={{ animation: 'handoff-card-in 0.55s cubic-bezier(0.22,1,0.36,1) 0.1s both' }}>
            {/* Illustration */}
            <div style={{ position: 'relative', width: '210px', height: '88px', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(92,64,51,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'handoff-giver 2.8s ease-in-out infinite', flexShrink: 0 }}>
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(61,90,53,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'handoff-receiver 2.8s ease-in-out infinite', flexShrink: 0 }}>
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              <div style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: '-28px', marginTop: '-20px', animation: 'handoff-pass 2.8s cubic-bezier(0.45,0,0.55,1) infinite', willChange: 'transform, opacity' }}>
                <svg width="56" height="40" viewBox="0 0 56 40" fill="none">
                  <rect x="3" y="1.5" width="50" height="30" rx="3.5" stroke="rgba(92,64,51,0.28)" strokeWidth="1.5" fill="none" />
                  <line x1="10" y1="10" x2="34" y2="10" stroke="rgba(92,64,51,0.2)" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="10" y1="16" x2="26" y2="16" stroke="rgba(92,64,51,0.13)" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="10" y1="22" x2="30" y2="22" stroke="rgba(92,64,51,0.13)" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M0 33 L56 33 L53 38 L3 38 Z" stroke="rgba(92,64,51,0.2)" strokeWidth="1" strokeLinejoin="round" fill="none" />
                  <rect x="22" y="34" width="12" height="2.5" rx="1.25" stroke="rgba(92,64,51,0.18)" strokeWidth="1" fill="none" />
                </svg>
              </div>
              <div style={{ position: 'absolute', left: '50%', bottom: '2px', marginLeft: '-26px', width: '52px', height: '5px', borderRadius: '999px', background: 'rgba(92,64,51,0.16)', filter: 'blur(3px)', animation: 'handoff-pass-shadow 2.8s cubic-bezier(0.45,0,0.55,1) infinite' }} />
            </div>
            {/* Text */}
            <div className="flex flex-col items-center gap-2.5">
              <h2 style={{ fontFamily: "'Newsreader', serif", fontWeight: 300, color: '#3B2F2F', fontSize: '30px', lineHeight: 1.15, letterSpacing: '-0.01em' }}>Hand it over</h2>
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: '13px', color: 'rgba(92,64,51,0.65)', maxWidth: '260px', lineHeight: 1.65 }}>Pass the device to your interviewer. They pick a case, and things get going from there.</p>
            </div>
            {/* Progress bar */}
            <div className="flex flex-col items-center gap-2" style={{ width: '200px' }}>
              <div style={{ width: '100%', height: '1.5px', background: 'rgba(92,64,51,0.10)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, #3D5A35, rgba(61,90,53,0.6))', borderRadius: '999px', animation: 'handoff-progress 5s linear forwards' }} />
              </div>
              <p style={{ fontSize: '10px', color: 'rgba(92,64,51,0.35)', fontFamily: "'Work Sans', sans-serif", letterSpacing: '0.04em' }}>
                Opening in {handoffCountdown > 0 ? handoffCountdown : 1}s
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Navbar */}
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
          <div className="flex items-center gap-1">
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

      <main className="relative flex min-h-[calc(100vh-70px)] flex-1 flex-col justify-center px-4 pb-20 pt-[90px] md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl w-full">

          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div
              className="absolute top-[25%] left-[10%] w-[400px] h-[400px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(61,90,53,0.09) 0%, transparent 60%)', animation: 'lobby-glow 12s ease-in-out infinite' }}
            />
            <div
              className="absolute top-[35%] right-[8%] w-[320px] h-[320px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(92,64,51,0.06) 0%, transparent 60%)', animation: 'lobby-glow 16s ease-in-out infinite reverse' }}
            />
          </div>

          {/* Header */}
          <div
            className="mb-7 max-w-[760px]"
            style={{ animation: 'lobby-fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[2px]">
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#3D5A35]/20 text-[#3D5A35]/60 bg-[#3D5A35]/5 leading-tight uppercase">
                Interviewer Mode
              </span>
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight uppercase">
                {requestedSessionMode === 'local' ? 'Same Device' : 'Remote'}
              </span>
            </div>
            <h1
              className="text-4xl font-light leading-[0.94] tracking-tight text-[#453a2a] md:text-5xl"
              style={{ fontFamily: "'Newsreader', serif" }}
            >
              <span className="inline-block" style={{ fontWeight: 300, animation: '_hi 0.45s ease forwards', opacity: 0 }}>Welcome,</span>
              {' '}
              <span className="inline-block text-[#3D5A35]" style={{ fontWeight: 400, animation: '_name 0.7s cubic-bezier(0.16,1,0.3,1) 0.08s forwards', opacity: 0 }}>Interviewer</span>
            </h1>
            <p className="mt-4 max-w-[620px] pl-[2px] text-[13px] leading-relaxed text-[#5c4033]/62">
              Select a case to begin. Everything after that is handled automatically for both sides.
            </p>
          </div>

          {/* Main card */}
          <div
            className="lobby-glass rounded-xl overflow-hidden"
            style={{ animation: 'lobby-card-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s both' }}
          >
            {/* Status zone - glow bleeds into steps */}
            <div className="relative px-6 py-5 flex items-center justify-between overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(61,90,53,0.05) 0%, transparent 70%)' }}
              />
              {/* Gradient divider instead of hard border */}
              <div
                className="pointer-events-none absolute bottom-0 left-6 right-6 h-[1px]"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(61,90,53,0.1) 20%, rgba(196,168,130,0.08) 80%, transparent 100%)' }}
              />
              <div className="relative flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#3D5A35]/8 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inset-0 rounded-full bg-[#3D5A35]" style={{ animation: 'lobby-pulse-ring 2s ease-in-out infinite' }} />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#3D5A35]" />
                    </span>
                    <span className="text-[12px] text-[#3B2F2F] font-medium">Candidate connected</span>
                  </div>
                  <span className="text-[10px] text-[#5C4033]/35 mt-1 block">{elapsed >= 30 ? 'Your candidate is ready' : `Waiting ${formatTime(elapsed)}`}</span>
                </div>
              </div>
            </div>

            {/* Horizontal steps — interviewer's role only stops at "Rate and feedback".
                Steps 4 (AI evaluation) and 5 (Insights delivered) belong to the
                candidate's post-session flow and aren't visible to the interviewer. */}
            <div className="px-6 py-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {[
                  { num: '01', text: 'Pick a case', active: true },
                  { num: '02', text: 'Run the session' },
                  { num: '03', text: 'Rate and feedback' },
                ].map((step, i) => (
                  <div
                    key={step.num}
                    className="flex flex-col items-center text-center gap-2.5"
                    style={{ animation: `lobby-step-in 0.4s cubic-bezier(0.22,1,0.36,1) ${0.3 + i * 0.08}s both` }}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-semibold tracking-wider ${
                      step.active
                        ? 'bg-[#3D5A35] text-white'
                        : 'bg-[#D9D0C4]/25 text-[#5C4033]/40'
                    } ${step.active ? 'lobby-step-active' : ''}`}>
                      {step.num}
                    </span>
                    <span className={`text-[12px] leading-snug ${
                      step.active ? 'text-[#3B2F2F] font-medium' : 'text-[#5C4033]/50'
                    }`}>{step.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/repository?mode=select&lobby=${lobbyId}&sessionMode=${requestedSessionMode}`
                  )
                }
                className="lobby-btn w-full rounded-full px-3 py-2.5 text-[9px] font-medium uppercase tracking-[0.16em]"
              >
                Open Case Repository
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* Mic-blocked guard — local mode only (the interviewer's same-device guard). */}
      <MicGuardOverlay
        active={isLocalMode}
        lobbyId={lobbyId}
        onShowingChange={setMicGuardShowing}
      />

      {/* Remote mic-loss recovery -- shown after the gate resolves if a
          previously-granted mic drops before the session starts. Self-suppresses
          on candidate opt-out or a prior interviewer decline. */}
      {!isLocalMode && !micGateVisible ? (
        <InterviewerMicRecovery
          lobbyId={lobbyId}
          active={true}
          onShowingChange={setMicGuardShowing}
        />
      ) : null}

      {showCloseWarning && !micGuardShowing && (
        <LobbyOverlay
          type="warning"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
          title="Heads up, closing this stops the session"
          body="Your candidate is waiting. If you close now, the session won't start."
          autoDismissMs={7000}
          onDismiss={() => setShowCloseWarning(false)}
        />
      )}

      {candidateTabClosed && !micGuardShowing && (
        <LobbyOverlay
          type="warning"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><line x1="2" y1="2" x2="22" y2="22"/></svg>}
          title="Candidate tab closed"
          body="No recording is happening right now. Reopen their tab to start capturing audio again, or carry on without it."
          actionLabel="Reopen candidate tab"
          onAction={() => {
            const url = candidateTabUrlRef.current ?? `/lobby/${lobbyId}?mode=local`
            openCandidateTab(lobbyId, url)
            setCandidateTabClosed(false)
          }}
          secondaryActionLabel="Continue without recording"
          onSecondaryAction={() => {
            dismissCandidateClosedForSession(lobbyId)
            setCandidateTabClosed(false)
          }}
          onDismiss={() => setCandidateTabClosed(false)}
        />
      )}

    </div>
  )
}

export default function LobbyPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const lobbyId = params.id as string

  const isInterviewer = searchParams.get('role') === 'interviewer'
  const requestedSessionMode = searchParams.get('mode') === 'local' ? 'local' : 'remote'

  // Safari only grants one live mic stream per browser process, so Remote
  // mode is blocked outright there — for either role, however this URL was
  // reached (fresh start, shared invite link, reopened tab) — before any
  // mic prompt or session-join logic runs.
  //
  // isSafariBrowser() reads navigator.userAgent, which doesn't exist during
  // SSR — so the server-rendered HTML (and the first client render, which
  // must match it to avoid a hydration error) would briefly paint the real
  // unblocked lobby before this flips true. safariCheckReady stays false
  // until after mount, and we render a blank shell the whole time it's
  // false, so the unblocked UI never actually paints on Safari.
  const [safariRemoteBlockDismissed, setSafariRemoteBlockDismissed] = useState(false)
  const [safariCheckReady, setSafariCheckReady] = useState(false)
  const [safariRemoteBlocked, setSafariRemoteBlocked] = useState(false)
  useEffect(() => {
    setSafariRemoteBlocked(requestedSessionMode === 'remote' && isSafariBrowser())
    setSafariCheckReady(true)
  }, [requestedSessionMode])

  // Safari only: write a localStorage signal on mount so the candidate tab
  // can detect this window even when window.opener is null (happens when
  // Safari opens the popup after the user unblocks via the address bar).
  useEffect(() => {
    if (!isInterviewer || requestedSessionMode !== 'local') return
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isSafari = ua.includes('Safari') && !ua.includes('Chrome')
    if (!isSafari) return
    writeInterviewerReady(lobbyId)
    return () => clearInterviewerReady(lobbyId)
  }, [isInterviewer, requestedSessionMode, lobbyId])

  const [checkingCandidate, setCheckingCandidate] = useState(!isInterviewer)
  const [sessionAlreadyEnded, setSessionAlreadyEnded] = useState(false)
  const [sessionIssue, setSessionIssue] = useState('')
  const [candidateActionStatus, setCandidateActionStatus] = useState('')
  // After ~5 min in 'waiting' status (interviewer hasn't joined yet) we show
  // a nudge with a "Cancel" button so the candidate isn't stuck staring at
  // the same screen forever. We don't auto-redirect — the interviewer could
  // still be on their way and a surprise redirect would be worse than a stale
  // tab.
  const [waitingNudgeVisible, setWaitingNudgeVisible] = useState(false)
  // Interviewer browsing signal — set when the interviewer tab writes
  // 'compendium-interviewer-browsing' to localStorage.
  const [interviewerBrowsing, setInterviewerBrowsing] = useState(false)
  const [interviewerReplacing, setInterviewerReplacing] = useState(() => searchParams.get('replacing') === '1')
  // Remote mode only: interviewer's window/tab went stale during the waiting
  // lobby or a case replace (no equivalent to the local-mode popup-poll here
  // before this). Mirrors the same interviewerPresence staleness pattern
  // already used on the workspace page (B4) and the interviewer's own
  // candidate-presence check.
  const [interviewerRemoteWindowClosed, setInterviewerRemoteWindowClosed] = useState(false)
  // Brief launching state shown while router.replace fires after case selection.
  const [isLaunching, setIsLaunching] = useState(false)
  const [launchCaseName, setLaunchCaseName] = useState('')
  // Interviewers arrive via shared invite links. Silently provision an
  // anonymous Firebase user so they can call /api routes (which all require
  // a valid bearer token) without ever needing to sign up. Anonymous users
  // get a real UID — the server-side identity check and rules-scoped reads
  // both work as if they were a regular signed-in user.
  useEffect(() => {
    if (!isInterviewer) return
    void signInAnonymouslyIfNeeded().catch(() => {
      // Auth failure here will surface later as an /api 401 — let that path
      // own the user-facing error rather than blocking the page now.
    })
  }, [isInterviewer])

  // Candidate presence heartbeat (remote mode only) — mirrors the identical
  // effect in app/case/[id]/workspace/page.tsx. That page's heartbeat only
  // runs once a case is actually in progress, so without this one here the
  // interviewer has zero live signal for a candidate who closes their tab
  // while still waiting for the interviewer to pick a case, or while
  // sitting on this same lobby screen during a case replace (the candidate
  // is routed back here for the whole "replacing" window).
  useEffect(() => {
    if (isInterviewer || requestedSessionMode === 'local' || !lobbyId) return

    const sendHeartbeat = async (active: boolean) => {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) return
        await fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ role: 'candidate', active }),
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
  }, [isInterviewer, requestedSessionMode, lobbyId])

  const isLocalSession = requestedSessionMode === 'local'
  const interviewerLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/lobby/${lobbyId}?role=interviewer&mode=${requestedSessionMode}`
      : '...'

  const flashCandidateActionStatus = (message: string) => {
    setCandidateActionStatus(message)
    window.setTimeout(() => setCandidateActionStatus(''), 2200)
  }

  // ── Real network drop detection ───────────────────────────────────────────
  // navigator.onLine / online+offline events catch hard network loss.
  // The OfflineBanner covers total offline with a full-screen overlay (z-9999).
  // Here we layer a softer "Connection hiccup" toast for the lobby specifically
  // so the candidate knows what's happening even before OfflineBanner kicks in,
  // and we actively try to reconnect by re-querying the session doc.
  useEffect(() => {
    if (isInterviewer) return

    const onOffline = () => {
      setSessionIssue('Connection lost. Trying to reconnect...')
    }

    const onOnline = () => {
      // Network restored — clear immediately. The session issue overlay
      // effect detects the empty string and dismisses the toast itself.
      setSessionIssue('')
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [isInterviewer])

  const focusOrOpenLocalInterviewerWindow = () => {
    const popupHost = window as PopupWindowHost
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isSafari = ua.includes('Safari') && !ua.includes('Chrome')

    if (popupHost.__compendiumInterviewerWindow && !popupHost.__compendiumInterviewerWindow.closed) {
      popupHost.__compendiumInterviewerWindow.focus()
      flashCandidateActionStatus('Interviewer window ready')
      return
    }

    // Safari: use a named window so it can be re-targeted after an unblock.
    // Chrome: use '_blank' (original behaviour).
    const target = isSafari ? interviewerWindowName(lobbyId) : '_blank'
    const interviewerWindow = window.open(
      `/lobby/${lobbyId}?role=interviewer&mode=local`,
      target
    )

    if (!interviewerWindow) {
      flashCandidateActionStatus('Allow popups to continue')
      if (isSafari) {
        // Poll localStorage for the signal the interviewer window writes on
        // mount — auto-clears the blocked state when Safari opens it.
        clearInterviewerReady(lobbyId)
        const pollStart = Date.now()
        const poll = setInterval(() => {
          if (readInterviewerReady(lobbyId)) {
            clearInterval(poll)
            flashCandidateActionStatus('Interviewer window ready')
          } else if (Date.now() - pollStart > 30000) {
            clearInterval(poll)
          }
        }, 500)
      }
      return
    }

    popupHost.__compendiumInterviewerWindow = interviewerWindow
    interviewerWindow.focus()
    flashCandidateActionStatus('Interviewer window ready')
  }

  useEffect(() => {
    if (isInterviewer) return

    let unsubscribeSession = () => {}
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let waitingNudgeTimer: ReturnType<typeof setTimeout> | null = null
    const WAITING_NUDGE_DELAY_MS = 5 * 60 * 1000
    const sessionRef = sessionDoc(lobbyId)
    // Remote-mode interviewer-window-closed detection (waiting/replacing only —
    // in_progress is covered separately by the workspace page's own B4 check).
    // Same 3s staleness threshold and periodic-recheck pattern used there.
    const PRESENCE_STALE_MS = 8_000 // was 3_000 — 4× the 2s heartbeat; tolerates jitter
let interviewerStaleStreak = 0
    const interviewerPresenceRef: { current: SessionState['interviewerPresence'] } = { current: undefined }
    const latestStatusRef: { current: SessionState['status'] } = { current: undefined }
    const checkInterviewerPresenceStale = () => {
      if (isLocalSession) return
      if (latestStatusRef.current !== 'waiting' && latestStatusRef.current !== 'replacing') return
      const presence = interviewerPresenceRef.current
      // No presence data yet -> assume connected, same convention used
      // everywhere else this pattern appears.
      if (!presence?.lastSeenAt) return
        if (presence.active === false) {            // explicit leave -> trust immediately
    interviewerStaleStreak = 0
    setInterviewerRemoteWindowClosed(true)
    return
  }
  const age = Date.now() - presence.lastSeenAt.toDate().getTime()
  if (age > PRESENCE_STALE_MS) {
    interviewerStaleStreak += 1
    if (interviewerStaleStreak >= 2) setInterviewerRemoteWindowClosed(true)
  } else {
    interviewerStaleStreak = 0
    setInterviewerRemoteWindowClosed(false)   // clear instantly
  }
}
    const clearPoll = () => {
      if (!pollTimer) return
      clearInterval(pollTimer)
      pollTimer = null
    }
    const armWaitingNudge = () => {
      if (waitingNudgeTimer) return
      waitingNudgeTimer = setTimeout(() => {
        setWaitingNudgeVisible(true)
      }, WAITING_NUDGE_DELAY_MS)
    }
    const disarmWaitingNudge = () => {
      if (waitingNudgeTimer) {
        clearTimeout(waitingNudgeTimer)
        waitingNudgeTimer = null
      }
      setWaitingNudgeVisible(false)
    }

    const workspaceRoute = (caseId: string, mode?: SessionState['sessionMode']) => {
      const resolvedMode = mode === 'local' ? 'local' : 'remote'
      return `/case/${caseId}/workspace?lobby=${lobbyId}&mode=${resolvedMode}`
    }

    const routeFromSessionData = (data: SessionState | null) => {
      if (!data) return
      // Remote mode: read browsing state from Firestore (localStorage only works same-device).
      if (!isLocalSession && data.status === 'waiting') {
        setInterviewerBrowsing(data.interviewerBrowsing === true)
      }
      // Remote: persist interviewer audio declined flag so workspace reads it on mount.
      if (!isLocalSession && data.interviewerAudioCaptured === false) {
        try { sessionStorage.setItem(`compendium-interviewer-declined-${lobbyId}`, '1') } catch { /* quota */ }
      }
      // Cache presence + status for the periodic re-check (see
      // checkInterviewerPresenceStale) — must run before the early returns
      // below, since 'replacing' is one of the two statuses this covers.
      latestStatusRef.current = data.status
      interviewerPresenceRef.current = data.interviewerPresence
      checkInterviewerPresenceStale()
      if (data.status === 'replacing') {
        disarmWaitingNudge()
        setIsLaunching(false)
        setInterviewerBrowsing(false)
        setInterviewerReplacing(true)
        return
      }
      if (data.status === 'in_progress' && data.caseId) {
        disarmWaitingNudge()
        setInterviewerBrowsing(false)
        setInterviewerReplacing(false)
        setInterviewerRemoteWindowClosed(false)
        setIsLaunching(true)
        setLaunchCaseName(data.caseName ?? '')
        setTimeout(() => router.replace(workspaceRoute(data.caseId!, data.sessionMode)), 600)
        return
      }
      if (data.status === 'completed' || data.status === 'abandoned' || data.status === 'fallback_unrated') {
        disarmWaitingNudge()
        setInterviewerRemoteWindowClosed(false)
        stopPolling()
        setSessionAlreadyEnded(true)
        return
      }
      if (data.status === 'waiting') {
        setInterviewerReplacing(false)
        if (isLocalSession) setInterviewerBrowsing(false)
        armWaitingNudge()
      }
    }

    const startPolling = () => {
      if (pollTimer) return
      pollTimer = setInterval(async () => {
        try {
          const sessionSnapshot = await getDoc(sessionRef)
          if (!sessionSnapshot.exists()) {
            setSessionIssue('Session not found. Generate a fresh practice link.')
            return
          }
          setSessionIssue('')
          routeFromSessionData(sessionSnapshot.data() as SessionState)
        } catch {
          setSessionIssue('Connection unstable. Retrying...')
        }
      }, 4000)
    }

    const stopPolling = () => {
      clearPoll()
      setSessionIssue('')
    }

    const handleSessionEndedPayload = (raw: string | null) => {
      if (!raw) return
      try {
        const data = JSON.parse(raw)
        if (data?.lobbyId === lobbyId) {
          router.replace('/dashboard')
        }
      } catch {
        // Ignore malformed localStorage payloads.
      }
    }

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === 'compendium-interviewer-browsing') {
        try {
          const data = event.newValue ? JSON.parse(event.newValue) : null
          if (data?.lobbyId === lobbyId) {
            setInterviewerBrowsing(true)
          } else if (!event.newValue) {
            // Key removed — interviewer left the case library
            setInterviewerBrowsing(false)
          }
        } catch {
          // Ignore malformed payloads.
        }
      }
      if (event.key === 'compendium-session-start' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue)
          if (data.lobbyId === lobbyId) {
            setInterviewerBrowsing(false)
            setIsLaunching(true)
            setLaunchCaseName(data.caseName ?? '')
            setTimeout(() => router.replace(workspaceRoute(data.caseId, data.mode)), 600)
          }
        } catch {
          // Ignore malformed localStorage payloads.
        }
      }
      if (event.key === 'compendium-session-ended') {
        handleSessionEndedPayload(event.newValue)
      }
    }

    const setupCandidateSession = async () => {
      try {
        const user = await waitForAuthUser()
        if (!user) {
          router.push(`/login?redirect=/lobby/${lobbyId}`)
          return
        }

        const existingSession = await getDoc(sessionRef)
        if (existingSession.exists()) {
          const existingData = existingSession.data() as SessionState
          if (existingData.status === 'in_progress' && existingData.caseId) {
            router.replace(workspaceRoute(existingData.caseId, existingData.sessionMode))
            return
          }
          if (
            existingData.status === 'completed' ||
            existingData.status === 'abandoned' ||
            existingData.status === 'fallback_unrated'
          ) {
            setSessionAlreadyEnded(true)
            setCheckingCandidate(false)
            return
          }
          // Check 24h expiry on waiting sessions — if expired, block and
          // show a fatal error rather than letting the lobby hang forever.
          if (existingData.status === 'waiting' && existingData.expiresAt) {
            const expiry = existingData.expiresAt instanceof Date
              ? existingData.expiresAt
              : existingData.expiresAt.toDate()
            if (expiry < new Date()) {
              setCheckingCandidate(false)
              setSessionIssue('This session expired. Generate a new practice link.')
              return
            }
          }
        }

        await apiPost('/api/sessions', {
          lobbyId,
          sessionMode: requestedSessionMode,
        })

        // Remote: if the candidate opted out of recording at launch, persist it
        // to the session doc so the interviewer gate can suppress itself (Case b).
        if (!isInterviewer && requestedSessionMode !== 'local') {
          let optedOut = false
          try { optedOut = sessionStorage.getItem(`compendium-norecord-${lobbyId}`) === '1' } catch { /* quota */ }
          if (optedOut) {
            try {
              const token = await auth.currentUser?.getIdToken()
              if (token) {
                void fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ role: 'candidate', active: true, candidateOptedOutRecording: true }),
                  keepalive: true,
                })
              }
            } catch { /* best-effort */ }
          }
        }

        setCheckingCandidate(false)

        unsubscribeSession = onSnapshot(
          sessionRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              // The first snapshot can be served from the local cache before the
              // just-created doc has synced from the server -- don't flash
              // "Something went wrong" for that. Let polling (getDoc, server-backed)
              // confirm a genuine miss before surfacing a fatal error.
              if (snapshot.metadata.fromCache) {
                startPolling()
                return
              }
              setSessionIssue('Session not found. Generate a fresh practice link.')
              startPolling()
              return
            }
            stopPolling()
            routeFromSessionData(snapshot.data() as SessionState)
          },
          () => {
            setSessionIssue('Live updates paused. Reconnecting...')
            startPolling()
          }
        )

        window.addEventListener('storage', handleStorageEvent)
        const existing = localStorage.getItem('compendium-session-start')
        if (existing) {
          try {
            const parsed = JSON.parse(existing)
            if (parsed.lobbyId === lobbyId) {
              router.replace(workspaceRoute(parsed.caseId, parsed.mode))
            }
          } catch {
            // Ignore malformed localStorage payloads.
          }
        }
        handleSessionEndedPayload(localStorage.getItem('compendium-session-ended'))
      } catch {
        setCheckingCandidate(false)
        setSessionIssue('Unable to initialize session. Please refresh this page.')
      }
    }

    setupCandidateSession()

    // Periodic re-check so the interviewer-window-closed overlay fires within
    // ~500ms of crossing the 3s staleness mark, even when no new Firestore
    // snapshot happens to arrive right after the interviewer actually goes
    // stale (same rationale as the workspace page's B4 fix).
    const staleCheckTimer = setInterval(checkInterviewerPresenceStale, 500)

    return () => {
      unsubscribeSession()
      clearPoll()
      clearInterval(staleCheckTimer)
      if (waitingNudgeTimer) {
        clearTimeout(waitingNudgeTimer)
        waitingNudgeTimer = null
      }
      window.removeEventListener('storage', handleStorageEvent)
    }
  }, [isInterviewer, lobbyId, requestedSessionMode, router])

  const handleCancelSession = () => {
    const popupHost = window as PopupWindowHost
    popupHost.__compendiumInterviewerWindow?.close()
    // Fire-and-forget: don't block navigation on the API call.
    // Uses /cancel, not /abandon: /abandon only accepts status:'in_progress'
    // and silently no-ops (409, swallowed) from waiting/replacing — the two
    // statuses the candidate is actually in when this button is reachable (it
    // only shows on the lobby page). /cancel supports waiting/replacing and
    // in_progress, and actually resets the session doc instead of leaving it
    // stuck. Same fix already applied to the remote-mode Cancel button.
    apiPost(`/api/sessions/${lobbyId}/cancel`, {}).catch(() => {})
    router.push('/practice')
  }

  // Remote-mode equivalent of handleCancelSession, used when the interviewer's
  // window/tab has gone stale during waiting/replacing. Uses /cancel instead
  // of /abandon: /abandon only accepts status:'in_progress' and no-ops
  // (silently, since the failure is swallowed) from waiting/replacing, so the
  // session was never actually being reset by the existing same-device call
  // in this state. /cancel supports waiting/replacing and in_progress, and
  // properly resets the session doc back to a fresh 'waiting' state.
  const handleCancelSessionRemote = () => {
    apiPost(`/api/sessions/${lobbyId}/cancel`, {}).catch(() => {})
    router.push('/practice')
  }

  const openRepoInPopup = () => {
    const popupHost = window as PopupWindowHost
    const repoUrl = `/repository?mode=select&lobby=${lobbyId}&sessionMode=${requestedSessionMode}`
    // If the existing tab is still open, navigate it to the repo page
    if (popupHost.__compendiumInterviewerWindow && !popupHost.__compendiumInterviewerWindow.closed) {
      popupHost.__compendiumInterviewerWindow.location.href = repoUrl
      popupHost.__compendiumInterviewerWindow.focus()
      return
    }
    // Otherwise open a new tab
    const win = window.open(repoUrl, '_blank')
    if (win) {
      popupHost.__compendiumInterviewerWindow = win
      win.focus()
    } else {
      flashCandidateActionStatus('Allow popups to continue')
    }
  }

  const handleCandidatePrimaryAction = async () => {
    if (isLocalSession) {
      focusOrOpenLocalInterviewerWindow()
      return
    }

    try {
      await navigator.clipboard.writeText(interviewerLink)
      flashCandidateActionStatus('Link copied')
    } catch {
      flashCandidateActionStatus('Unable to copy')
    }
  }

  // Hard stop before any mic prompt or session-join logic — no lobby UI
  // renders underneath, since the raw shared link has no surrounding "Do a
  // Case" page to speak of for whoever opened it. Also covers the brief
  // window before safariCheckReady flips true, so Safari never gets a
  // single frame of the real (unblocked) lobby before the block kicks in.
  if (requestedSessionMode === 'remote' && (!safariCheckReady || safariRemoteBlocked)) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#fff8f0' }}>
        {safariCheckReady && !safariRemoteBlockDismissed && (
          <SafariRemoteBlockModal
            closeTabOnDismiss
            onDismiss={() => setSafariRemoteBlockDismissed(true)}
          />
        )}
      </div>
    )
  }

  if (!isInterviewer && checkingCandidate) {
    return <PlatformLoader message="Getting your space ready" />
  }

  if (!isInterviewer && sessionAlreadyEnded) {
    return <SessionEndedScreen />
  }

  if (isInterviewer) {
    return (
      <InterviewerLobby
        lobbyId={lobbyId}
        requestedSessionMode={requestedSessionMode}
        router={router}
        showHandoff={searchParams.get('handoff') === '1'}
      />
    )
  }

  return (
    <CandidateLobby
      lobbyId={lobbyId}
      requestedSessionMode={requestedSessionMode}
      interviewerLink={interviewerLink}
      sessionIssue={sessionIssue}
      candidateActionStatus={candidateActionStatus}
      waitingNudgeVisible={waitingNudgeVisible}
      interviewerBrowsing={interviewerBrowsing}
      interviewerReplacing={interviewerReplacing}
      interviewerRemoteWindowClosed={interviewerRemoteWindowClosed}
      isLaunching={isLaunching}
      launchCaseName={launchCaseName}
      onCancelSession={() => void handleCancelSession()}
      onCancelSessionRemote={() => void handleCancelSessionRemote()}
      onPrimaryAction={() => {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
        const isSafari = ua.includes('Safari') && !ua.includes('Chrome')
        // Safari blocks window.open inside async functions. Call it synchronously
        // for local sessions so it stays in the trusted gesture call stack.
        // Chrome uses the normal async path unchanged.
        if (isSafari && isLocalSession) { focusOrOpenLocalInterviewerWindow(); return }
        void handleCandidatePrimaryAction()
      }}
      onReopenRepo={openRepoInPopup}
    />
  )
}

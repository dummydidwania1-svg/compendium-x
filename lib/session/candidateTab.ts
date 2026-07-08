// Helpers for the split-screen candidate-tab liveness heartbeat.
//
// The candidate tab (lobby or workspace) writes `compendium-candidate-tab`
// every second with a fresh timestamp. The interviewer pages poll it: a
// heartbeat older than STALE_MS (after at least one fresh beat was seen) means
// the candidate tab closed unexpectedly.
//
// `compendium-session-ended` is set when a session completes and is NOT
// cleared by the existing flows, so it can be stale from a *previous* lobby.
// Always compare its lobbyId before treating the session as ended — a bare
// existence check would wrongly suppress the heartbeat for a new session.

export const CANDIDATE_TAB_KEY = 'compendium-candidate-tab'
const SESSION_ENDED_KEY = 'compendium-session-ended'

/** Heartbeat is considered stale (tab gone) once older than this. */
export const CANDIDATE_TAB_STALE_MS = 2500

/** Universal (non-Safari) heartbeat cadence + staleness thresholds.
 * Visible tab: 8s (= 4 missed 2s beats). Hidden/backgrounded tab: 35s, since
 * every browser throttles background timers. Safari keeps its own constant
 * below and is intentionally left untouched. */
export const CANDIDATE_HEARTBEAT_MS = 2000
export const CANDIDATE_TAB_STALE_VISIBLE_MS = 8000
export const CANDIDATE_TAB_STALE_HIDDEN_MS = 35000

/** Extended stale threshold for Safari — background-tab timer throttling
 *  slows setInterval to as little as 30s, so the normal 2.5s window fires
 *  false positives. Safari also fires storage events instantly (no throttle)
 *  so the overlay clears as soon as the tab writes its next beat. */
export const CANDIDATE_TAB_STALE_MS_SAFARI = 30000

export type CandidateTabBeat = {
  lobbyId: string
  url: string
  ts: number
  /** Whether the tab was backgrounded when it wrote this beat, so the reader
   * can pick the visible (8s) vs hidden (35s) threshold. Older beats without
   * this field are treated as visible. */
  hidden?: boolean
}

/** True only if the *current* lobby's session has ended (upload phase started). */
export function sessionEndedForLobby(lobbyId: string | null | undefined): boolean {
  if (!lobbyId) return false
  try {
    const raw = localStorage.getItem(SESSION_ENDED_KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    return data?.lobbyId === lobbyId
  } catch {
    return false
  }
}

/** Read the latest candidate heartbeat for this lobby, or null. */
export function readCandidateBeat(lobbyId: string | null | undefined): CandidateTabBeat | null {
  if (!lobbyId) return null
  try {
    const raw = localStorage.getItem(CANDIDATE_TAB_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as CandidateTabBeat
    if (data?.lobbyId !== lobbyId) return null
    return data
  } catch {
    return null
  }
}

/** Normal-flow (non-Safari) staleness test. Uses the longer window when the
 * beat was written while hidden, because background timers are throttled.
 * Safari has its own separate path and does not use this. */
export function isCandidateBeatStale(beat: CandidateTabBeat, now: number = Date.now()): boolean {
  const threshold = beat.hidden ? CANDIDATE_TAB_STALE_HIDDEN_MS : CANDIDATE_TAB_STALE_VISIBLE_MS
  return now - beat.ts > threshold
}

/** Write a fresh heartbeat for this lobby. No-op if the session has ended. */
export function writeCandidateBeat(lobbyId: string): void {
  if (sessionEndedForLobby(lobbyId)) return
  try {
    localStorage.setItem(CANDIDATE_TAB_KEY, JSON.stringify({
  lobbyId,
  url: window.location.href,
  ts: Date.now(),
  hidden: typeof document !== 'undefined' && document.hidden,
} satisfies CandidateTabBeat))
  } catch { /* quota */ }
}

/** Stable window name for the candidate tab so the interviewer can re-target the
 *  same window instead of spawning a fresh one each time. */
export function candidateWindowName(lobbyId: string): string {
  return `compendium-candidate-${lobbyId}`
}

/** Stable window name for the interviewer popup so Safari can reuse it after
 *  unblocking via the address bar notification. */
export function interviewerWindowName(lobbyId: string): string {
  return `compendium-interviewer-${lobbyId}`
}

/**
 * Interviewer-side: open (or focus) the candidate tab. Using a named window
 * means a second call re-targets the existing tab rather than stacking up new
 * ones. The opened tab gets window.opener pointing back at the interviewer, so
 * the candidate can reconnect to this exact interviewer window.
 */
export function openCandidateTab(lobbyId: string, url: string): void {
  try {
    const win = window.open(url, candidateWindowName(lobbyId))
    win?.focus()
  } catch { /* popup blocked */ }
}

const INTERVIEWER_READY_PREFIX = 'compendium-interviewer-ready-'

/** Interviewer window writes this on mount so the candidate tab can detect it
 *  even when window.opener is unavailable (e.g. Safari popup unblocked via
 *  address bar — opener is null in that case). */
export function writeInterviewerReady(lobbyId: string): void {
  try {
    localStorage.setItem(INTERVIEWER_READY_PREFIX + lobbyId, String(Date.now()))
  } catch { /* quota */ }
}

export function readInterviewerReady(lobbyId: string): number | null {
  try {
    const val = localStorage.getItem(INTERVIEWER_READY_PREFIX + lobbyId)
    return val ? Number(val) : null
  } catch { return null }
}

export function clearInterviewerReady(lobbyId: string): void {
  try { localStorage.removeItem(INTERVIEWER_READY_PREFIX + lobbyId) } catch { /* quota */ }
}

const DISMISSED_KEY_PREFIX = 'compendium-candidate-closed-dismissed-'

/** "Continue without recording" was chosen for this lobby — don't nag again. */
export function isCandidateClosedDismissed(lobbyId: string): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY_PREFIX + lobbyId) === '1'
  } catch {
    return false
  }
}

export function dismissCandidateClosedForSession(lobbyId: string): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY_PREFIX + lobbyId, '1')
  } catch { /* quota */ }
}

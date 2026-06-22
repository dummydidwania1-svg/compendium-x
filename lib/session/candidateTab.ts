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

export type CandidateTabBeat = {
  lobbyId: string
  url: string
  ts: number
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

/** Write a fresh heartbeat for this lobby. No-op if the session has ended. */
export function writeCandidateBeat(lobbyId: string): void {
  if (sessionEndedForLobby(lobbyId)) return
  try {
    localStorage.setItem(CANDIDATE_TAB_KEY, JSON.stringify({
      lobbyId,
      url: window.location.href,
      ts: Date.now(),
    } satisfies CandidateTabBeat))
  } catch { /* quota */ }
}

/** Stable window name for the candidate tab so the interviewer can re-target the
 *  same window instead of spawning a fresh one each time. */
export function candidateWindowName(lobbyId: string): string {
  return `compendium-candidate-${lobbyId}`
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

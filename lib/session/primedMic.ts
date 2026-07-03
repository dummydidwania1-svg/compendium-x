// SAFARI-ONLY: primed microphone stream handoff for split-screen (local) mode.
//
// Safari refuses navigator.mediaDevices.getUserMedia() unless the calling
// document is the focused, frontmost tab within a fresh user-activation window.
// In split-screen the candidate tab is backgrounded the moment the interviewer
// popup takes focus, so the candidate workspace can never acquire the mic on
// its own — the user has to manually click the candidate tab first.
//
// The fix: acquire the mic stream on the practice page during the "Launch Split
// Screen" click (a real user gesture, tab focused), keep it alive, and hand it
// to the workspace. A MediaStream reference on the window object survives the
// client-side navigations practice -> lobby -> workspace because they all happen
// in the same tab/window object (same technique as __compendiumInterviewerWindow).
//
// None of this runs on Chrome — the practice page and workspace both gate every
// call behind their existing Safari detection.

const HOLDER_KEY = '__compendiumPrimedMicStream'
// Auto-stop the held stream if it's never consumed within this window, so a user
// who launches split-screen and abandons it doesn't leave a dangling hot mic.
const PRIMED_MIC_TIMEOUT_MS = 5 * 60 * 1000

type PrimedMicHost = Window & {
  [HOLDER_KEY]?: MediaStream | null
  __compendiumPrimedMicTimer?: ReturnType<typeof setTimeout> | null
  __compendiumPrimedMicPagehide?: (() => void) | null
}

/** Stop every track on a stream (releases the mic / turns off the indicator). */
function stopStream(stream: MediaStream | null | undefined): void {
  try {
    stream?.getTracks().forEach((t) => t.stop())
  } catch { /* noop */ }
}

/**
 * Practice page: stash a live mic stream for the workspace to adopt. Also arms
 * two safety guards so the mic never stays hot indefinitely:
 *  - a timeout that stops the stream if it's never consumed
 *  - a pagehide listener that stops the stream if the tab is closed/left
 */
export function primeMicStreamForWorkspace(stream: MediaStream): void {
  if (typeof window === 'undefined') return
  const host = window as PrimedMicHost

  // Clear any previous primed stream first (defensive — shouldn't normally exist).
  clearPrimedMicStream()

  host[HOLDER_KEY] = stream
  console.log('[primedMic] PRIMED stream stored', {
    tracks: stream.getAudioTracks().length,
    state: stream.getAudioTracks()[0]?.readyState,
  })

  host.__compendiumPrimedMicTimer = setTimeout(() => {
    // Never consumed in time — stop it and clear the holder.
    const s = host[HOLDER_KEY]
    if (s) {
      stopStream(s)
      host[HOLDER_KEY] = null
    }
  }, PRIMED_MIC_TIMEOUT_MS)

  const onPagehide = () => {
    const s = host[HOLDER_KEY]
    if (s) stopStream(s)
    host[HOLDER_KEY] = null
  }
  host.__compendiumPrimedMicPagehide = onPagehide
  window.addEventListener('pagehide', onPagehide)
}

/**
 * Workspace: take ownership of a primed stream if one exists AND still has a
 * live audio track. Disarms the safety guards and clears the holder so the
 * stream isn't torn down twice. Returns null if there's nothing usable — the
 * caller then falls back to the normal getUserMedia path.
 */
export function consumePrimedMicStream(): MediaStream | null {
  if (typeof window === 'undefined') return null
  const host = window as PrimedMicHost
  const stream = host[HOLDER_KEY]
  console.log('[primedMic] CONSUME called', { hasStream: !!stream })
  if (!stream) return null

  // Disarm the safety guards — we're taking ownership now.
  if (host.__compendiumPrimedMicTimer) {
    clearTimeout(host.__compendiumPrimedMicTimer)
    host.__compendiumPrimedMicTimer = null
  }
  if (host.__compendiumPrimedMicPagehide) {
    window.removeEventListener('pagehide', host.__compendiumPrimedMicPagehide)
    host.__compendiumPrimedMicPagehide = null
  }
  host[HOLDER_KEY] = null

  // Only usable if it still has a live audio track (mic not revoked/ended).
  const liveTrack = stream.getAudioTracks().some((t) => t.readyState === 'live')
  if (!liveTrack) {
    stopStream(stream)
    return null
  }
  return stream
}

/** Stop and clear any primed stream + disarm guards. Safe to call anytime. */
export function clearPrimedMicStream(): void {
  if (typeof window === 'undefined') return
  const host = window as PrimedMicHost
  if (host.__compendiumPrimedMicTimer) {
    clearTimeout(host.__compendiumPrimedMicTimer)
    host.__compendiumPrimedMicTimer = null
  }
  if (host.__compendiumPrimedMicPagehide) {
    window.removeEventListener('pagehide', host.__compendiumPrimedMicPagehide)
    host.__compendiumPrimedMicPagehide = null
  }
  const s = host[HOLDER_KEY]
  if (s) stopStream(s)
  host[HOLDER_KEY] = null
}

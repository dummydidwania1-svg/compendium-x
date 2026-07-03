// SAFARI-ONLY: primed microphone recording handoff for split-screen (local) mode.
//
// Safari refuses to CAPTURE microphone audio from a backgrounded tab — it blocks
// getUserMedia, AudioContext.resume(), and effectively the MediaRecorder too. In
// split-screen the candidate tab is backgrounded the moment the interviewer popup
// takes focus, so the candidate workspace can never START recording on its own.
//
// The fix: start the MediaRecorder on the practice page during the "Launch Split
// Screen" click — the one moment the candidate tab is focused with a real user
// gesture — and never stop it. A MediaRecorder already running when its tab
// backgrounds KEEPS recording (Safari only blocks *starting* capture on a
// background tab). The recorder + its live stream + captured chunks are stashed
// on the window object, which survives the client-side navigations
// practice -> lobby -> workspace (same tab/window object). The workspace then
// adopts the already-running recorder instead of starting a new one.
//
// The dead air recorded between the launch click and the interviewer picking a
// case is trimmed off server-side (ffmpeg -ss) using trimStartMs.
//
// None of this runs on Chrome — the practice page and workspace both gate every
// call behind their existing Safari detection.

const HOLDER_KEY = '__compendiumPrimedMic'
// Auto-stop the held recorder if it's never consumed within this window, so a
// user who launches split-screen and abandons it doesn't leave a runaway recorder.
const PRIMED_MIC_TIMEOUT_MS = 10 * 60 * 1000

export type PrimedRecorder = {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  startMs: number
  mimeType: string
}

type PrimedMicHost = Window & {
  [HOLDER_KEY]?: PrimedRecorder | null
  __compendiumPrimedMicTimer?: ReturnType<typeof setTimeout> | null
  __compendiumPrimedMicPagehide?: (() => void) | null
}

/** Debug: append a message to a localStorage log readable from any tab.
 *  Read it from the interviewer tab console with:
 *    JSON.parse(localStorage.getItem('compendium-mic-debug') || '[]')
 *  Temporary — remove once the Safari mic bug is confirmed fixed. */
export function micDebug(msg: string, data?: unknown): void {
  try {
    const line = `${new Date().toISOString().slice(11, 23)} ${msg} ${data ? JSON.stringify(data) : ''}`
    const raw = localStorage.getItem('compendium-mic-debug')
    const arr: string[] = raw ? JSON.parse(raw) : []
    arr.push(line)
    localStorage.setItem('compendium-mic-debug', JSON.stringify(arr.slice(-50)))
    console.log('[mic]', msg, data ?? '')
  } catch { /* noop */ }
}

const MIME_TYPE_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

/** Pick the first MediaRecorder-supported mime type (mp4 first for Safari). */
export function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const c of MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return null
}

/** Stop a recorder + release its stream (turns off the mic indicator). */
function teardownPrimed(primed: PrimedRecorder | null | undefined): void {
  if (!primed) return
  try { if (primed.recorder.state !== 'inactive') primed.recorder.stop() } catch { /* noop */ }
  try { primed.stream.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
}

/**
 * Practice page (Safari + local): start a MediaRecorder on the launch-click mic
 * stream WHILE THE TAB IS STILL FOCUSED, then stash the running recorder for the
 * workspace to adopt. Must be called before focus shifts to the interviewer popup.
 *
 * Arms safety guards so an abandoned launch never leaves a runaway recorder:
 *  - a timeout that stops the recorder if never consumed
 *  - a pagehide listener that stops it if the tab is closed/left
 *
 * Returns true if recording started, false if MediaRecorder couldn't be created
 * (caller then falls back to the old prime-stream-only behaviour).
 */
export function startPrimedRecording(stream: MediaStream, mimeType: string | null): boolean {
  if (typeof window === 'undefined') return false
  const host = window as PrimedMicHost

  clearPrimedMic() // defensive — clear any prior holder

  let recorder: MediaRecorder
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  } catch {
    return false
  }

  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  const primed: PrimedRecorder = {
    recorder,
    stream,
    chunks,
    startMs: Date.now(),
    mimeType: recorder.mimeType || mimeType || 'audio/mp4',
  }

  try {
    recorder.start(1000) // 1s timeslices, same cadence as the workspace recorder
  } catch {
    try { stream.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
    return false
  }

  host[HOLDER_KEY] = primed
  micDebug('PRIMED recording started', { mimeType: primed.mimeType, startMs: primed.startMs })

  host.__compendiumPrimedMicTimer = setTimeout(() => {
    const p = host[HOLDER_KEY]
    if (p) { teardownPrimed(p); host[HOLDER_KEY] = null }
  }, PRIMED_MIC_TIMEOUT_MS)

  const onPagehide = () => {
    const p = host[HOLDER_KEY]
    if (p) { teardownPrimed(p); host[HOLDER_KEY] = null }
  }
  host.__compendiumPrimedMicPagehide = onPagehide
  window.addEventListener('pagehide', onPagehide)

  return true
}

/**
 * Workspace (Safari + local): take ownership of the running primed recorder if
 * one exists AND its stream still has a live audio track. Disarms the safety
 * guards and clears the holder so it isn't torn down twice. Returns null if
 * there's nothing usable — the caller then falls back to the normal path.
 */
export function consumePrimedRecording(): PrimedRecorder | null {
  if (typeof window === 'undefined') return null
  const host = window as PrimedMicHost
  const primed = host[HOLDER_KEY]
  micDebug('CONSUME recording', { has: !!primed, state: primed?.recorder.state })
  if (!primed) return null

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

  // Only usable if the recorder is still recording and the mic track is live.
  const liveTrack = primed.stream.getAudioTracks().some((t) => t.readyState === 'live')
  if (primed.recorder.state !== 'recording' || !liveTrack) {
    teardownPrimed(primed)
    return null
  }
  return primed
}

/** Stop and clear any primed recorder + disarm guards. Safe to call anytime. */
export function clearPrimedMic(): void {
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
  const p = host[HOLDER_KEY]
  if (p) teardownPrimed(p)
  host[HOLDER_KEY] = null
}

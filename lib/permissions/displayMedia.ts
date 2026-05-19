/**
 * Cross-route slot for a live `getDisplayMedia` MediaStream.
 *
 * The candidate needs to share their meeting tab + tab audio so we can
 * record the case audio. `getDisplayMedia()` REQUIRES a user gesture, so it
 * can't be auto-triggered when the workspace mounts — and asking for it
 * mid-case forces the candidate to context-switch off the case prompt onto
 * Chrome's tab picker right when they should be focused on the interview.
 *
 * Instead we acquire the stream on the lobby (where the candidate is idle
 * waiting for the interviewer) and KEEP IT ALIVE across the route change
 * into `/workspace`. By stashing the stream on `window` (the only thing
 * that survives a Next.js client navigation) the workspace can pick it up
 * without ever prompting.
 *
 * If the user clicks "Stop sharing" in Chrome's sharing bar, the stream's
 * tracks transition to `readyState === 'ended'`. We detect that and clear
 * the slot so consumers re-prompt or show a "share again" UI.
 */

const SLOT_KEY = '__compendiumDisplayMediaStream' as const

type StreamHolder = { stream: MediaStream | null }

function getSlot(): StreamHolder {
  if (typeof window === 'undefined') return { stream: null }
  const w = window as Window & { [SLOT_KEY]?: StreamHolder }
  if (!w[SLOT_KEY]) {
    w[SLOT_KEY] = { stream: null }
  }
  return w[SLOT_KEY]!
}

/**
 * Return the currently-active display stream, if any. Returns null if the
 * slot is empty OR if every audio track has ended (which happens when the
 * user clicks "Stop sharing" in Chrome's sharing bar). Also self-heals the
 * slot in that case.
 */
export function getActiveDisplayStream(): MediaStream | null {
  const holder = getSlot()
  const stream = holder.stream
  if (!stream) return null
  const hasLiveAudio = stream.getAudioTracks().some((track) => track.readyState === 'live')
  if (!hasLiveAudio) {
    // Stream's audio is dead. Stop any leftover video tracks and drop the slot.
    for (const track of stream.getTracks()) track.stop()
    holder.stream = null
    return null
  }
  return stream
}

/**
 * Trigger Chrome's screen-share picker. Caller must invoke from inside a
 * user gesture handler (button click). The returned stream's audio gets
 * piped into the recording pipeline; the video tracks are unused but
 * required by the API.
 */
export async function acquireDisplayMedia(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen sharing is not supported in this browser.')
  }

  // Release any prior stream first so we don't leak two simultaneous shares.
  const holder = getSlot()
  if (holder.stream) {
    for (const track of holder.stream.getTracks()) track.stop()
    holder.stream = null
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })

  // No audio track = user picked a window/screen instead of a tab with
  // "Share audio" enabled. Reject; the candidate must re-share with audio.
  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) {
    for (const track of stream.getTracks()) track.stop()
    throw new Error(
      'No audio is being shared. Share the meeting tab and turn on "Share audio" in the picker.',
    )
  }

  // Listen for "ended" on all tracks so we self-heal the slot when the
  // user clicks "Stop sharing" later.
  for (const track of stream.getTracks()) {
    track.addEventListener('ended', () => {
      const current = getSlot()
      if (current.stream === stream) {
        // Stop any siblings that haven't yet ended, then clear.
        for (const t of stream.getTracks()) t.stop()
        current.stream = null
      }
    })
  }

  holder.stream = stream
  return stream
}

/**
 * Explicitly stop and clear the cached stream. Call this on session
 * teardown so we don't leave a "Sharing tab" indicator hanging in Chrome.
 */
export function releaseDisplayMedia(): void {
  const holder = getSlot()
  if (!holder.stream) return
  for (const track of holder.stream.getTracks()) track.stop()
  holder.stream = null
}

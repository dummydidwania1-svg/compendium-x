/**
 * MeetingTabShareCard — lobby-side card for the candidate to set up screen
 * share (tab audio) BEFORE the case starts. Mirrors MicPermissionCard's
 * three-state pattern (idle / requesting / active) but for getDisplayMedia.
 *
 * Acquires the stream via `acquireDisplayMedia()` on user click and stashes
 * it on a window-level slot. The workspace later picks it up directly,
 * skipping the mid-case prompt entirely.
 *
 * Detects when the user clicks "Stop sharing" in Chrome's sharing bar via
 * a poll (track.onended events are also wired in the helper, but polling
 * keeps the visible state in sync without an extra subscription pattern).
 */
'use client'

import { useEffect, useState } from 'react'
import {
  acquireDisplayMedia,
  getActiveDisplayStream,
} from '@/lib/permissions/displayMedia'

type CardState = 'idle' | 'requesting' | 'active' | 'failed'

export function MeetingTabShareCard() {
  const [state, setState] = useState<CardState>(() =>
    getActiveDisplayStream() ? 'active' : 'idle',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // While we think we're active, check periodically whether the user
  // clicked "Stop sharing" in Chrome's sharing bar. The helper clears the
  // slot when tracks end; we just need to notice and flip back to idle.
  useEffect(() => {
    if (state !== 'active') return
    const interval = window.setInterval(() => {
      if (!getActiveDisplayStream()) {
        setState('idle')
      }
    }, 700)
    return () => window.clearInterval(interval)
  }, [state])

  const handleShare = async () => {
    setState('requesting')
    setErrorMessage(null)
    try {
      await acquireDisplayMedia()
      setState('active')
    } catch (err) {
      setState('failed')
      const message = err instanceof Error ? err.message : 'Could not start sharing.'
      // AbortError = user cancelled the picker. Don't show that as a hard
      // error — just go back to idle. NotAllowedError = permission denied.
      const isUserCancel =
        err instanceof Error && (err.name === 'AbortError' || message.includes('aborted'))
      if (isUserCancel) {
        setState('idle')
      } else {
        setErrorMessage(message)
      }
    }
  }

  if (state === 'active') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-full border border-[#3D5A35]/25 bg-[rgba(174,208,161,0.18)] px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-[#3D5A35]">
        <span aria-hidden="true">✓</span>
        Meeting tab is being shared
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-[22px] border border-[#b48a57]/22 bg-[rgba(255,245,233,0.92)] px-4 py-4 text-left">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#5c4033]">
        Share your meeting tab
      </p>
      <p className="mt-2 text-sm leading-7 text-[#5c4033]">
        We&apos;ll record audio from your Google Meet (or Zoom) tab plus your microphone. Set this up
        now so we don&apos;t interrupt you once the case starts. When the picker opens, pick the
        meeting tab and turn on <strong className="font-semibold">Share audio</strong>.
      </p>
      <button
        type="button"
        onClick={() => void handleShare()}
        disabled={state === 'requesting'}
        className="mt-3 inline-flex items-center justify-center rounded-full border border-[#3D5A35]/35 bg-[#3D5A35] px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white transition hover:bg-[#3D5A35]/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === 'requesting'
          ? 'Opening picker…'
          : state === 'failed'
            ? 'Try again'
            : 'Share meeting tab'}
      </button>
      {errorMessage ? (
        <p className="mt-2 text-[11px] text-[#92400e]">{errorMessage}</p>
      ) : null}
    </div>
  )
}

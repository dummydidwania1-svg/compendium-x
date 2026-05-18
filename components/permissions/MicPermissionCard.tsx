/**
 * MicPermissionCard — three-state card rendered in the candidate lobby.
 * Lets the user set up the microphone while they're waiting for their
 * interviewer to pick a case, so by the time the workspace loads
 * recording can start without any prompt.
 *
 * - granted: small "Microphone ready" affirmation (subtle, non-blocky).
 * - prompt / unknown: explainer + "Allow microphone" button that triggers
 *   the native browser prompt.
 * - denied: lock-icon hint + "Try again" button. The hook's onchange
 *   subscription causes the card to auto-flip to ✓ the moment the user
 *   fixes permissions in their browser settings.
 */
'use client'

import { useState } from 'react'
import { useMicPermission } from '@/lib/permissions/microphone'

export function MicPermissionCard() {
  const { state, request, retry, isSupported } = useMicPermission()
  const [requesting, setRequesting] = useState(false)
  const [stillBlocked, setStillBlocked] = useState(false)

  const handleAllow = async () => {
    setRequesting(true)
    setStillBlocked(false)
    const stream = await request()
    if (stream) {
      // We just wanted the permission, not the live stream.
      stream.getTracks().forEach((track) => track.stop())
    } else {
      // Likely still denied. Re-query in case state changed in between.
      const next = await retry()
      if (next === 'denied') setStillBlocked(true)
    }
    setRequesting(false)
  }

  if (!isSupported) {
    return null
  }

  if (state === 'granted') {
    return (
      <div className="mt-5 flex items-center gap-2 rounded-full border border-[#3D5A35]/25 bg-[rgba(174,208,161,0.18)] px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-[#3D5A35]">
        <span aria-hidden="true">✓</span>
        Microphone ready
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="mt-5 rounded-[22px] border border-[#b48a57]/22 bg-[rgba(255,245,233,0.92)] px-4 py-4 text-left">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#5c4033]">
          Microphone blocked
        </p>
        <p className="mt-2 text-sm leading-7 text-[#5c4033]">
          Click the <span aria-hidden="true">🔒</span> lock icon in your browser&apos;s address bar and set
          Microphone to <strong className="font-semibold">Allow</strong>. We&apos;ll detect it automatically.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleAllow()}
            disabled={requesting}
            className="inline-flex items-center justify-center rounded-full border border-[#5c4033]/25 bg-white/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-[#5c4033] transition hover:border-[#5c4033]/50 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requesting ? 'Checking…' : 'Try again'}
          </button>
          {stillBlocked ? (
            <span className="text-[11px] text-[#92400e]">Still blocked — check the address bar.</span>
          ) : null}
        </div>
      </div>
    )
  }

  // 'prompt' or 'unknown' — never asked, or browser doesn't expose state.
  return (
    <div className="mt-5 rounded-[22px] border border-[#b48a57]/22 bg-[rgba(255,245,233,0.92)] px-4 py-4 text-left">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#5c4033]">
        Set up microphone
      </p>
      <p className="mt-2 text-sm leading-7 text-[#5c4033]">
        We&apos;ll record audio during your case so AI can transcribe it and generate written feedback.
      </p>
      <button
        type="button"
        onClick={() => void handleAllow()}
        disabled={requesting}
        className="mt-3 inline-flex items-center justify-center rounded-full border border-[#3D5A35]/35 bg-[#3D5A35] px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white transition hover:bg-[#3D5A35]/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {requesting ? 'Waiting for browser…' : 'Allow microphone'}
      </button>
    </div>
  )
}

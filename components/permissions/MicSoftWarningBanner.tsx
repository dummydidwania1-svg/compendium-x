/**
 * MicSoftWarningBanner — soft warning shown in the candidate workspace when
 * the microphone is not (yet) granted. The case prompt and the rest of the
 * UI stay fully functional; this banner only tells the candidate that no
 * transcript will be generated unless they enable mic.
 *
 * Two actions:
 *   - "Allow microphone": tries getUserMedia. Succeeds if state is 'prompt'
 *     (native browser prompt appears) or if user has already unblocked.
 *     On success, the banner disappears because the parent observes the
 *     state change via useMicPermission.
 *   - "Continue without recording": session-scoped dismiss. Refreshing or
 *     re-entering the workspace shows it again.
 */
'use client'

import { useState } from 'react'
import type { MicPermissionState } from '@/lib/permissions/microphone'

interface MicSoftWarningBannerProps {
  state: MicPermissionState
  onAllow: () => Promise<void>
}

export function MicSoftWarningBanner({ state, onAllow }: MicSoftWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [requesting, setRequesting] = useState(false)

  if (state === 'granted' || dismissed) return null

  const isDenied = state === 'denied'

  const handleAllow = async () => {
    setRequesting(true)
    try {
      await onAllow()
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="mx-auto mt-4 max-w-3xl rounded-[20px] border border-[#b48a57]/30 bg-[rgba(255,245,233,0.92)] px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs leading-relaxed text-[#5c4033]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#92400e]">Recording disabled</p>
          <p className="mt-1 text-sm">
            Without microphone access we can&apos;t generate a transcript or AI feedback for this case.
            {isDenied ? (
              <>
                {' '}Click the <span aria-hidden="true">🔒</span> lock icon in your address bar to enable mic, then press Allow microphone.
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleAllow()}
            disabled={requesting}
            className="rounded-full border border-[#3D5A35]/40 bg-[#3D5A35] px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white transition hover:bg-[#3D5A35]/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requesting ? 'Asking…' : 'Allow microphone'}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-full border border-[#5c4033]/25 bg-white/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-[#5c4033] transition hover:border-[#5c4033]/50 hover:bg-white/90"
          >
            Continue without recording
          </button>
        </div>
      </div>
    </div>
  )
}

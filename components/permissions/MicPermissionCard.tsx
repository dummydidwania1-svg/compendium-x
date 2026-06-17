'use client'

/**
 * MicPermissionCard — headless controller.
 * Renders nothing itself. Fires onOverlay whenever the mic state changes
 * so the parent (CandidateLobby) can show/update the LobbyOverlay toast.
 *
 * States:
 *   granted  → info toast, auto-dismisses after 3.5s
 *   prompt   → action toast, stays until granted
 *   denied   → warning toast, stays, "Try again" button
 *   unknown  → no toast (browser doesn't expose state)
 */

import { useEffect, useRef, useState } from 'react'
import { useMicPermission } from '@/lib/permissions/microphone'

export type MicOverlayPayload =
  | { kind: 'granted' }
  | { kind: 'denied'; onRetry: () => void; stillBlocked: boolean }
  | { kind: 'prompt'; onAllow: () => void; requesting: boolean }
  | { kind: 'hidden' }

interface MicPermissionCardProps {
  onOverlay: (payload: MicOverlayPayload) => void
}

export function MicPermissionCard({ onOverlay }: MicPermissionCardProps) {
  const { state, request, retry, isSupported } = useMicPermission()
  const [requesting, setRequesting] = useState(false)
  const [stillBlocked, setStillBlocked] = useState(false)
  const autoPromptedRef = useRef(false)

  const handleAllow = async () => {
    setRequesting(true)
    setStillBlocked(false)
    const stream = await request()
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
    } else {
      const next = await retry()
      if (next === 'denied') setStillBlocked(true)
    }
    setRequesting(false)
  }

  // Emit overlay state whenever mic state or derived state changes
  useEffect(() => {
    if (!isSupported) { onOverlay({ kind: 'hidden' }); return }

    if (state === 'granted') {
      onOverlay({ kind: 'granted' })
      return
    }
    if (state === 'denied') {
      onOverlay({ kind: 'denied', onRetry: () => void handleAllow(), stillBlocked })
      return
    }
    if (state === 'prompt') {
      onOverlay({ kind: 'prompt', onAllow: () => void handleAllow(), requesting })
      return
    }
    onOverlay({ kind: 'hidden' })
  }, [state, isSupported, requesting, stillBlocked, onOverlay])

  // Auto-prompt once on first 'prompt'
  useEffect(() => {
    if (autoPromptedRef.current) return
    if (!isSupported || state !== 'prompt') return
    autoPromptedRef.current = true
    void handleAllow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, state])

  return null
}

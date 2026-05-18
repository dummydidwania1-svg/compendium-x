/**
 * useMicPermission — single source of truth for microphone permission state
 * across onboarding, lobby, and workspace.
 *
 * Subscribes to the browser's PermissionStatus.onchange event so callers
 * react to grants/revocations without polling or page reloads. Provides
 * `request()` which calls getUserMedia directly — this is the only way to
 * trigger the native browser prompt (and it's silently rejected if the user
 * has previously denied; that's a deliberate browser security feature).
 *
 * The hook is intentionally minimal: state + retry + request. Anything else
 * (UI, copy, instructions) lives in the consuming component.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

export interface UseMicPermissionResult {
  /** Latest known permission state. Defaults to 'unknown' before the first query resolves. */
  state: MicPermissionState
  /** False if the browser doesn't expose mediaDevices.getUserMedia at all. */
  isSupported: boolean
  /**
   * Call getUserMedia({ audio: true }) and return the resulting stream on
   * success (caller should release tracks if they don't need the stream).
   * Returns null on failure. The browser shows the native prompt only when
   * state is 'prompt'; on 'denied' it rejects silently.
   */
  request: () => Promise<MediaStream | null>
  /** Force re-query of permission state (e.g. after user fixes settings). */
  retry: () => Promise<MicPermissionState>
}

export function useMicPermission(): UseMicPermissionResult {
  const [state, setState] = useState<MicPermissionState>('unknown')
  const [isSupported, setIsSupported] = useState(false)
  const statusRef = useRef<PermissionStatus | null>(null)

  const queryState = useCallback(async (): Promise<MicPermissionState> => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
      setState('unknown')
      return 'unknown'
    }
    try {
      const status = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      })
      statusRef.current = status
      const next = status.state as MicPermissionState
      setState(next)
      return next
    } catch {
      setState('unknown')
      return 'unknown'
    }
  }, [])

  useEffect(() => {
    // Feature-detect inside the effect (not a lazy useState initializer)
    // to avoid an SSR/client hydration mismatch on the gated render
    // branches in consuming components.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(
      typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    )

    let active = true
    let status: PermissionStatus | null = null

    const onChange = () => {
      if (!active || !status) return
      setState(status.state as MicPermissionState)
    }

    void queryState().then(() => {
      if (!active || !statusRef.current) return
      status = statusRef.current
      status.addEventListener('change', onChange)
    })

    return () => {
      active = false
      if (status) status.removeEventListener('change', onChange)
    }
  }, [queryState])

  const request = useCallback(async (): Promise<MediaStream | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // The 'change' event may not fire when transitioning from 'prompt' → 'granted'
      // in every browser. Update state eagerly here so consumers re-render.
      setState('granted')
      return stream
    } catch {
      // Re-query state — getUserMedia rejection doesn't tell us why, but
      // permissions.query will give us the truthful current state.
      await queryState()
      return null
    }
  }, [queryState])

  return { state, isSupported, request, retry: queryState }
}

'use client'

/**
 * Pings /api/heartbeat at most once per authenticated user per UTC calendar
 * day (guarded via sessionStorage so re-mounts/re-renders within the same
 * tab don't re-fire). Feeds DAU/WAU/MAU + unique-vs-recurring for the
 * weekly KPI report — see app/api/heartbeat/route.ts.
 */
import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'

function todayUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD', UTC
}

export function useActivityHeartbeat(): void {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return

      const dateKey = todayUtcDateKey()
      const storageKey = `compendiumx-heartbeat-${user.uid}-${dateKey}`
      if (sessionStorage.getItem(storageKey)) return

      user
        .getIdToken()
        .then((token) =>
          fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ dateKey }),
          }),
        )
        .then(() => {
          sessionStorage.setItem(storageKey, '1')
        })
        .catch((err) => {
          console.error('[useActivityHeartbeat] ping failed', err instanceof Error ? err.message : String(err))
        })
    })

    return unsubscribe
  }, [])
}

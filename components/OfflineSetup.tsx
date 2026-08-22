'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { scheduleCasePrefetch } from '@/lib/offline/prefetchCases'

// Live-session routes where an involuntary reload would kill an in-progress
// recording / evaluation: the lobby, the candidate workspace, and every
// interviewer view under /case/[id].
const LIVE_SESSION_ROUTE = /^(\/lobby\/.+|\/case\/[^/]+\/(workspace|interviewer))/
const PENDING_SW_RELOAD_KEY = 'ccx-pending-sw-reload'

export default function OfflineSetup() {
  const pathname = usePathname()

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // SW registration failed silently — app still works online
      })

      // A new SW version means a new deploy with new hashed chunk filenames.
      // This tab may still be running the old build in memory; if it later
      // lazy-loads a chunk by the old hash, that file no longer exists on
      // the origin and the fetch fails, crashing React. Reload once to pick
      // up the current build.
      //
      // EXCEPT mid-session: hard-reloading a tab that is actively recording
      // audio or writing an evaluation loses the session -- exactly what the
      // product must never do. On live-session routes we defer the reload
      // (flag below) until the user navigates somewhere safe.
      let currentPath = window.location.pathname
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type !== 'SW_UPDATED') return
        if (LIVE_SESSION_ROUTE.test(currentPath)) {
          try {
            sessionStorage.setItem(PENDING_SW_RELOAD_KEY, '1')
          } catch {
            // Storage blocked -- skip the deferred reload rather than risk
            // interrupting a session we can't detect again later.
          }
          return
        }
        window.location.reload()
      })

      // Keep the handler's view of the route fresh without re-registering.
      const syncPath = () => {
        currentPath = window.location.pathname
      }
      window.addEventListener('popstate', syncPath)
      const originalPushState = history.pushState.bind(history)
      const originalReplaceState = history.replaceState.bind(history)
      history.pushState = (...args) => {
        originalPushState(...args)
        syncPath()
      }
      history.replaceState = (...args) => {
        originalReplaceState(...args)
        syncPath()
      }
      return () => {
        window.removeEventListener('popstate', syncPath)
        history.pushState = originalPushState
        history.replaceState = originalReplaceState
      }
    }

    // Prefetch all cases into localStorage at idle priority
    scheduleCasePrefetch()
  }, [])

  // Apply a deferred reload once the user leaves a live-session route.
  useEffect(() => {
    if (!pathname || LIVE_SESSION_ROUTE.test(pathname)) return
    let pending = false
    try {
      pending = sessionStorage.getItem(PENDING_SW_RELOAD_KEY) === '1'
      if (pending) sessionStorage.removeItem(PENDING_SW_RELOAD_KEY)
    } catch {
      pending = false
    }
    if (pending) window.location.reload()
  }, [pathname])

  return null
}

'use client'

import { useEffect } from 'react'
import { scheduleCasePrefetch } from '@/lib/offline/prefetchCases'

export default function OfflineSetup() {
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
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_UPDATED') {
          window.location.reload()
        }
      })
    }

    // Prefetch all cases into localStorage at idle priority
    scheduleCasePrefetch()
  }, [])

  return null
}

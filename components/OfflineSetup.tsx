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
    }

    // Prefetch all cases into localStorage at idle priority
    scheduleCasePrefetch()
  }, [])

  return null
}

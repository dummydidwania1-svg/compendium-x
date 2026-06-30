// Service worker for Case CompendiumX
// Caches app shell on install, serves offline for repository + case pages.

const CACHE = 'ccx-shell-v6'

// App shell: pages that must survive offline
const SHELL = [
  '/',
  '/repository',
  '/offline.html',
]

function isCacheable(response) {
  // Cannot cache: partial responses (206), opaque cross-origin, errors
  return response.ok && response.status !== 206 && response.type !== 'opaque'
}

// ── Install: cache the shell ────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  )
  self.skipWaiting()
})

// ── Activate: remove old caches, then tell open tabs to reload ──
// A tab that's been open since before this deploy is still running the
// previous build's JS in memory. If it later lazy-loads a chunk (route
// transition, code-split import) by the old hashed filename, that file no
// longer exists on the origin once the new deploy has replaced .next/static
// — the fetch 404s/503s and React crashes with "Cannot read properties of
// undefined" trying to use the missing module. Forcing a reload once on
// activation gets every open tab onto the current build's chunk hashes.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      await self.clients.claim()
      const clientList = await self.clients.matchAll({ type: 'window' })
      for (const client of clientList) client.postMessage({ type: 'SW_UPDATED' })
    })()
  )
})

// ── Fetch: network-first for Firestore/API, cache-first for assets ──
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept: Firebase/Firestore, API routes, auth, analytics
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/') ||
    request.method !== 'GET'
  ) {
    return
  }

  // Next.js static assets (_next/static) — cache-first, very long lived
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          if (isCacheable(response)) {
            const clone = response.clone()
            caches.open(CACHE).then(cache => cache.put(request, clone)).catch(() => {})
          }
          return response
        })
      })
    )
    return
  }

  // Navigation requests (HTML pages) — network-first, fall back to cached
  // shell at '/' so the React app loads and shows the OfflineBanner overlay.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (isCacheable(response)) {
            const clone = response.clone()
            caches.open(CACHE).then(cache => cache.put(request, clone)).catch(() => {})
          }
          return response
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached ?? caches.match('/')
          )
        )
    )
    return
  }

  // Fonts and other static assets — cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (isCacheable(response)) {
          const clone = response.clone()
          caches.open(CACHE).then(cache => cache.put(request, clone)).catch(() => {})
        }
        return response
      }).catch(() => new Response('', { status: 503 }))
    })
  )
})

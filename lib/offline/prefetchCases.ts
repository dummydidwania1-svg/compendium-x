// Silently prefetch all cases into localStorage so they're available offline.
// Runs once per session (gated by sessionStorage flag) at low priority using
// requestIdleCallback so it never competes with page rendering.

import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

const SESSION_FLAG = 'ccx-prefetched'
const CASE_KEY = (id: string) => `compendium-case-${id}`
const LIST_KEY = 'compendium_cases_v2'
const LIST_VERSION = 1

export function scheduleCasePrefetch() {
  if (typeof window === 'undefined') return
  if (sessionStorage.getItem(SESSION_FLAG)) return
  sessionStorage.setItem(SESSION_FLAG, '1')

  const run = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'cases'))
      const listItems: Array<{
        id: string; numericId?: number; title: string
        industry: string | null; case_type: string | null; difficulty: string | null
      }> = []

      snapshot.docs.forEach(docSnap => {
        const d = docSnap.data()
        // Store full case doc for offline case rendering
        try {
          localStorage.setItem(CASE_KEY(docSnap.id), JSON.stringify(d))
        } catch { /* quota */ }

        listItems.push({
          id: docSnap.id,
          numericId: typeof d.id === 'number' ? d.id : undefined,
          title: typeof d.title === 'string' ? d.title : 'Untitled Case',
          industry: typeof d.industry === 'string' ? d.industry : null,
          case_type: typeof d.case_type === 'string' ? d.case_type : typeof d.caseType === 'string' ? d.caseType : null,
          difficulty: typeof d.difficulty === 'string' ? d.difficulty : null,
        })
      })

      listItems.sort((a, b) => {
        if (typeof a.numericId === 'number' && typeof b.numericId === 'number') return a.numericId - b.numericId
        return a.title.localeCompare(b.title)
      })

      try {
        localStorage.setItem(LIST_KEY, JSON.stringify({ version: LIST_VERSION, savedAt: Date.now(), data: listItems }))
      } catch { /* quota */ }
    } catch {
      // Offline or fetch failed — silently skip, will retry next session
      sessionStorage.removeItem(SESSION_FLAG)
    }
  }

  if ('requestIdleCallback' in window) {
    // Wait for browser to be idle, then run
    ;(window as Window & { requestIdleCallback: (cb: () => void, opts?: object) => void })
      .requestIdleCallback(run, { timeout: 8000 })
  } else {
    // Fallback: run after 3s so it doesn't block initial render
    setTimeout(run, 3000)
  }
}

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { X } from 'lucide-react'
import Footer from '@/components/dashboard/Footer'
import Navbar from '@/components/dashboard/Navbar'
import { db, signInAnonymouslyIfNeeded } from '@/lib/firebase/config'
import { FILTER_LEVELS } from '@/lib/constants'
import RepoFilterDropdown from '@/components/ui/RepoFilterDropdown'
import { apiPost } from '@/lib/api/client'
import { slugifyCase } from '@/lib/slug'
import PlatformLoader from '@/components/PlatformLoader'
import CursorGlow from '@/components/CursorGlow'
import { LobbyOverlay } from '@/components/lobby/LobbyOverlay'
import { MicGuardOverlay } from '@/components/permissions/MicGuardOverlay'
import { InterviewerMicRecovery } from '@/components/permissions/InterviewerMicRecovery'
import { readCandidateBeat, sessionEndedForLobby, CANDIDATE_TAB_STALE_MS, openCandidateTab, isCandidateClosedDismissed, dismissCandidateClosedForSession } from '@/lib/session/candidateTab'
import casesCatalog from '@/data/cases.json'
import NewCaseBadge, { isNewCase } from '@/components/case/NewCaseBadge'


function normalizeCaseType(raw: string | null): string | null {
  if (!raw) return null
  if (/^(market growth|growth)$/i.test(raw.trim())) return 'Growth'
  return raw
}

function normalizeCompany(raw: string | null): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (/^accenture( strategy)?$/i.test(t)) return 'Accenture Strategy'
  if (/^(pwc[\s\-]*)?strategy\s*&?$/i.test(t)) return 'Strategy&'
  if (/^(by (the )?)?author(s)?$/i.test(t)) return 'By the Authors'
  if (/^l\.e\.k\.? consulting$/i.test(t)) return 'L.E.K. Consulting'
  return t
}

const CASES_CACHE_KEY = 'compendium_cases_v2'
// Bump when the cached shape (CaseListItem) changes — old envelopes get
// rejected automatically so users don't render stale, type-mismatched data.
const CASES_CACHE_VERSION = 4
// Optimistic-render cache window. Beyond this the cache is treated as too
// stale to flash on screen and we wait for fresh data instead. Firestore is
// fetched on every load regardless; this just controls "do we show
// something immediately or render a brief loading state."
const CASES_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

const READY_CASE_SLUGS = new Set<string>(
  (casesCatalog as Array<{ title?: string; slug?: string }>)
    .map((c) => (c.slug && c.slug.trim()) ? c.slug.trim() : slugifyCase(c.title ?? ''))
    .filter(Boolean)
)

type CaseListItem = {
  id: string
  numericId?: number
  title: string
  industry: string | null
  case_type: string | null
  difficulty: string | null
  company: string | null
  subtype: string | null
  round: string | null
    slug: string | null
}

interface CasesCacheEnvelope {
  version: number
  savedAt: number
  data: CaseListItem[]
}

function parseCacheEnvelope(raw: string): { data: CaseListItem[]; stale: boolean } | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CasesCacheEnvelope> | unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('version' in parsed) ||
      (parsed as CasesCacheEnvelope).version !== CASES_CACHE_VERSION ||
      !Array.isArray((parsed as CasesCacheEnvelope).data)
    ) {
      return null
    }
    const envelope = parsed as CasesCacheEnvelope
    return { data: envelope.data, stale: Date.now() - envelope.savedAt > CASES_CACHE_TTL_MS }
  } catch {
    return null
  }
}

// Returns cached data only if fresh enough to optimistically flash on screen.
// Always keeps data on disk as an offline fallback — use readCacheForFallback when offline.
function readCasesCache(): CaseListItem[] | null {
  try {
    const raw = localStorage.getItem(CASES_CACHE_KEY)
    if (!raw) return null
    const result = parseCacheEnvelope(raw)
    if (!result) { localStorage.removeItem(CASES_CACHE_KEY); return null }
    // Stale: don't flash on screen when online, but keep as offline fallback
    if (result.stale) return null
    return result.data
  } catch {
    return null
  }
}

// Always returns cached data regardless of staleness — used when Firestore fails.
function readCacheForFallback(): CaseListItem[] | null {
  try {
    const raw = localStorage.getItem(CASES_CACHE_KEY)
    if (!raw) return null
    const result = parseCacheEnvelope(raw)
    return result ? result.data : null
  } catch {
    return null
  }
}

function writeCasesCache(data: CaseListItem[]) {
  try {
    const envelope: CasesCacheEnvelope = {
      version: CASES_CACHE_VERSION,
      savedAt: Date.now(),
      data,
    }
    localStorage.setItem(CASES_CACHE_KEY, JSON.stringify(envelope))
  } catch {
    // Quota exceeded or storage disabled. Best-effort only.
  }
}


const DIFFICULTY_RANK: Record<string, number> = { easy: 1, medium: 2, hard: 3 }

function DifficultyDots({ level }: { level: string | null }) {
  const rank = DIFFICULTY_RANK[(level ?? '').toLowerCase()] ?? 0
  const label = level ? level[0].toUpperCase() + level.slice(1).toLowerCase() : 'General'
  return (
    <span className="inline-flex items-center gap-[5px]" title={label} aria-label={`Difficulty: ${label}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-[7px] w-[7px] rounded-full transition-colors ${
            i < rank ? 'bg-[#5C4033]' : 'border border-[#5C4033]/25 bg-transparent'
          }`}
        />
      ))}
    </span>
  )
}

const ROW_GRID =
  'grid grid-cols-[40px_minmax(0,1.5fr)_minmax(0,1.05fr)_minmax(0,0.6fr)_minmax(0,1fr)_112px] items-center gap-x-4'

const OPEN_ENDED = (t: string | null) =>
  ['guesstimate', 'unconventional'].includes((t ?? '').toLowerCase())

const SECTION_HEADING_LABEL: Record<string, string> = {
  Guesstimate: 'Guesstimates',
}

const SectionBand = ({ letter, type, isFirst }: { letter: string; type: string; isFirst: boolean }) => (
  <div className={`repo-section ${ROW_GRID} px-2 sm:px-4 ${isFirst ? 'pt-3' : 'pt-8'} pb-3`}>
<div className="flex items-center px-2">   {/* ← same px-/justify as the CaseRow number cell */}
  <span className="font-serif text-[16px] leading-none tracking-tight text-[#3D5A35]/85">
    {letter}
  </span>
</div>
    <div className="col-span-5 flex items-baseline gap-3 px-2 pr-4">
      <span className="font-serif text-[15px] italic tracking-wide text-[#453a2a]/80">{SECTION_HEADING_LABEL[type] ?? type}</span>
      <span className="repo-section-rule" />
    </div>
  </div>
)

type CaseRowProps = {
  caseItem: CaseListItem
  index: number
  selectionMode: boolean
  pendingCaseId: string | null
  prefetchCase: (caseItem: CaseListItem) => void
  handleSelectClick: (caseItem: CaseListItem) => void
  handlePreviewClick: (e: React.MouseEvent<HTMLAnchorElement>, caseItem: CaseListItem) => void
}

const CaseRow = memo(function CaseRow({
  caseItem,
  index,
  selectionMode,
  pendingCaseId,
  prefetchCase,
  handleSelectClick,
  handlePreviewClick,
}: CaseRowProps) {
  return (
    <div
      onMouseEnter={() => prefetchCase(caseItem)}
      onFocus={() => prefetchCase(caseItem)}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={`repo-table-row repo-rise ${ROW_GRID} px-2 sm:px-4 ${pendingCaseId === caseItem.id ? 'opacity-50' : ''}`}
    >
      <div className="px-2 py-4 text-[11px] tabular-nums text-[#5C4033]/35">
        {index + 1}
      </div>
      <div className="px-2 py-4 pr-4">
        <div className="repo-title">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[13px] font-medium leading-snug tracking-[0.01em] text-[#3B2F2F]">{caseItem.title}</span>
            <NewCaseBadge caseId={caseItem.numericId} caseKey={caseItem.slug ?? caseItem.title} size="sm" />
          </span>
        </div>
      </div>
      <div className="px-2 py-4 text-[12px] text-[#5C4033]/65">
        {OPEN_ENDED(caseItem.case_type) ? '' : (caseItem.industry ?? '')}
      </div>
      <div className="px-2 py-4"><DifficultyDots level={caseItem.difficulty} /></div>
      <div className="px-2 py-4 text-[12px] text-[#5C4033]/65">{caseItem.company ?? ''}</div>
      <div className="px-2 py-4">
        {selectionMode ? (
          <button
            onClick={() => handleSelectClick(caseItem)}
            disabled={pendingCaseId !== null}
            className="repo-preview-button w-full rounded-full px-3 py-2 text-[9px] font-medium uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingCaseId === caseItem.id ? 'Starting…' : 'Select'}
          </button>
        ) : (
          <Link
            href={`/case/${caseItem.slug ?? slugifyCase(caseItem.title)}`}
            onMouseEnter={() => prefetchCase(caseItem)}
            onClick={(e) => handlePreviewClick(e, caseItem)}
            className="repo-preview-button block w-full rounded-full px-3 py-2 text-center text-[9px] font-medium uppercase tracking-[0.16em]"
          >
            Preview
          </Link>
        )}
      </div>
    </div>
  )
})

type CaseCardProps = CaseRowProps

const CaseCard = memo(function CaseCard({
  caseItem,
  index,
  selectionMode,
  pendingCaseId,
  prefetchCase,
  handleSelectClick,
  handlePreviewClick,
}: CaseCardProps) {
  return (
    <div
      onMouseEnter={() => prefetchCase(caseItem)}
      onFocus={() => prefetchCase(caseItem)}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={`repo-mobile-card repo-rise px-4 py-4 space-y-2 ${pendingCaseId === caseItem.id ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-[#5C4033]/35">{index + 1}</span>
          <span className="text-[13px] font-medium tracking-[0.01em] text-[#3B2F2F]">{caseItem.title}</span>
          <NewCaseBadge caseKey={caseItem.slug ?? caseItem.title} size="sm" />
        </div>
        <DifficultyDots level={caseItem.difficulty} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#5C4033]/65">
        {!OPEN_ENDED(caseItem.case_type) && caseItem.industry ? <span>{caseItem.industry}</span> : null}
        {caseItem.company ? <span>· {caseItem.company}</span> : null}
      </div>
      {selectionMode ? (
        <button
          onClick={() => handleSelectClick(caseItem)}
          disabled={pendingCaseId !== null}
          className="repo-preview-button w-full rounded-full px-5 py-2 text-[9px] font-medium uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingCaseId === caseItem.id ? 'Starting…' : 'Select Case'}
        </button>
      ) : (
        <Link
          href={`/case/${caseItem.slug ?? slugifyCase(caseItem.title)}`}
          onMouseEnter={() => prefetchCase(caseItem)}
          onClick={(e) => handlePreviewClick(e, caseItem)}
          className="repo-preview-button block w-full rounded-full px-5 py-2 text-center text-[9px] font-medium uppercase tracking-[0.16em]"
        >
          Preview Case
        </Link>
      )}
    </div>
  )
})

const SEARCH_DEMOS = ['bcg easy', 'fmcg revenue', 'market entry', 'guesstimate hard']

const PREFERRED_TYPE_ORDER = [
  'Profitability', 'Market Entry', 'Growth',
  'Pricing', 'Unconventional', 'Guesstimate',
]

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

const frameworkSlug = (type: string) =>
  type.toLowerCase().trim().replace(/\s+/g, '-')

const FRAMEWORK_CHIPS = PREFERRED_TYPE_ORDER.map((label) => ({
  label,
  slug: frameworkSlug(label),
  href: `/repository/frameworks/${frameworkSlug(label)}`,
}))

function useTypewriter(words: string[], active: boolean) {
  const [text, setText] = useState('')
  const [wordIdx, setWordIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    if (!active) return
    const word = words[wordIdx % words.length]
    const atFull = !deleting && text === word
    const atEmpty = deleting && text === ''
    let delay = deleting ? 45 : 95
    if (atFull) delay = 1100
    if (atEmpty) delay = 280
    const timer = setTimeout(() => {
      if (atFull) return setDeleting(true)
      if (atEmpty) { setDeleting(false); return setWordIdx((i) => (i + 1) % words.length) }
      setText((prev) => (deleting ? prev.slice(0, -1) : word.slice(0, prev.length + 1)))
    }, delay)
    return () => clearTimeout(timer)
  }, [text, deleting, wordIdx, active, words])
  return text
}

function SearchPlaceholder({ words }: { words: string[] }) {
  const typed = useTypewriter(words.length > 0 ? words : SEARCH_DEMOS, true)
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-2">
      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/40">try</span>
      <span className="font-mono text-[12px] text-[#3D5A35]">{typed}</span>
      <span className="repo-caret font-mono text-[12px] text-[#3D5A35]">|</span>
    </div>
  )
}

function FrameworkChips({ activeSlug }: { activeSlug: string | null }) {
  return (
    <nav
      aria-label="Browse case frameworks"
      className="repo-chiprow"
      data-has-active={activeSlug ? 'true' : undefined}
    >
      {FRAMEWORK_CHIPS.map((chip, i) => (
        <Link
          key={chip.slug}
          href={chip.href}
          data-active={activeSlug === chip.slug ? 'true' : undefined}
          data-fw={i}
          className="repo-chip"
        >
          <span className="repo-chip-label">{chip.label}</span>
        </Link>
      ))}
    </nav>
  )
}

function RepositoryContent() {

  const [cases, setCases] = useState<CaseListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [levelFilter, setLevelFilter] = useState<string[]>([])
  const [industryFilter, setIndustryFilter] = useState<string[]>([])
const [companyFilter, setCompanyFilter] = useState<string[]>([])
  const [recentlyAddedFilter, setRecentlyAddedFilter] = useState(false)
  const [actionError, setActionError] = useState('')
  const [failedCase, setFailedCase] = useState<{ id: string; title: string } | null>(null)
  // When selection fails because a case is already in_progress, store the
  // running case id so we can offer "Go to session" CTA.
  const [activeSessionCaseId, setActiveSessionCaseId] = useState<string | null>(null)
  // When interviewer navigates back to repo from a live session, show an overlay.
  const [liveSessionOverlayInfo, setLiveSessionOverlayInfo] = useState<{ caseId: string; caseName: string; lobbyId: string; sessionMode: string } | null>(null)
  // When the interviewer panel couldn't load a case and redirected back here.
  const [caseLoadErrorVisible, setCaseLoadErrorVisible] = useState(false)
  const [comingSoonVisible, setComingSoonVisible] = useState(false)
  const [comingSoonBody, setComingSoonBody] = useState('')
  const [offlineBanner, setOfflineBanner] = useState(false)
  const [firestoreFailed, setFirestoreFailed] = useState(false)
  // ID of the case the user just clicked, while the API call + navigation
  // resolve. The row dims and the button switches to a spinner-like label
  // so the click doesn't feel like it was dropped. Cleared on error so the
  // user can retry; on success the page navigates away before clearing is
  // needed.
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null)
  const [showCloseWarning, setShowCloseWarning] = useState(false)
  const closeAttemptRef = useRef(false)
  const [micGuardShowing, setMicGuardShowing] = useState(false)
  const [showReplaceBackGuard, setShowReplaceBackGuard] = useState(false)
  const [candidateTabClosed, setCandidateTabClosed] = useState(false)
  const [activeFramework, setActiveFramework] = useState<string | null>(null)
  const [stuck, setStuck] = useState(false)
  const candidateTabUrlRef = useRef<string | null>(null)
  const candidateWasAliveRef = useRef(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  // Track which case destinations we've already asked Next.js to prefetch
  // so we don't fire the same prefetch call on every mouseenter event.
  const prefetchedCasesRef = useRef<Set<string>>(new Set())

  const selectionMode = searchParams.get('mode') === 'select'
  const lobbyId = searchParams.get('lobby')
  const sessionMode = searchParams.get('sessionMode') === 'local' ? 'local' : 'remote'
  const caseError = searchParams.get('caseError')
  const prevCaseId = searchParams.get('prevCaseId') ?? ''
  const prevCaseName = searchParams.get('prevCaseName') ?? ''
  const isReplaceMode = selectionMode && !!lobbyId && !!prevCaseId


  const showSectionBands = typeFilter.length !== 1;

const hasActiveFilters =
  typeFilter.length > 0 || levelFilter.length > 0 ||
  industryFilter.length > 0 || companyFilter.length > 0 || recentlyAddedFilter
const hasQuery = filter.trim().length > 0
const clearAllFilters = () => {
  setTypeFilter([]); setLevelFilter([]); setIndustryFilter([]); setCompanyFilter([]); setRecentlyAddedFilter(false)
}

  // Show case-load-error overlay when redirected back from a failed interviewer panel.
  useEffect(() => {
    if (caseError) setCaseLoadErrorVisible(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close guard — only in selection mode (interviewer is picking a case for a live session).
  useEffect(() => {
    if (!selectionMode || !lobbyId) return
    let armed = false
    const armTimer = setTimeout(() => { armed = true }, 3000)
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!armed) return
      closeAttemptRef.current = true
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    const onReturn = () => {
      if (!closeAttemptRef.current) return
      closeAttemptRef.current = false
      if (armed) setShowCloseWarning(true)
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') onReturn() }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onReturn)
    return () => {
      clearTimeout(armTimer)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onReturn)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode, lobbyId])

  // liveSessionOverlayInfo trigger removed — the replace-case flow now clears
  // compendium-session-start before navigating here, so this check is no longer needed.

  // Poll every 1s for the candidate heartbeat (local split-screen only).
  // A heartbeat older than the stale threshold, after we've seen the tab
  // alive, means it closed unexpectedly.
  useEffect(() => {
    if (!selectionMode || !lobbyId || sessionMode !== 'local') return
    const interval = setInterval(() => {
      if (sessionEndedForLobby(lobbyId) || isCandidateClosedDismissed(lobbyId)) {
        setCandidateTabClosed(false)
        return
      }
      const beat = readCandidateBeat(lobbyId)
      if (!beat) return
      if (beat.url) candidateTabUrlRef.current = beat.url
      const age = Date.now() - beat.ts
      if (age < CANDIDATE_TAB_STALE_MS) {
        candidateWasAliveRef.current = true
        setCandidateTabClosed(false)
      } else if (candidateWasAliveRef.current) {
        setCandidateTabClosed(true)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [selectionMode, lobbyId, sessionMode])

  // Back-button guard for replace-case flow. Pushes a dummy history entry so
  // pressing back shows our overlay instead of navigating away blindly.
  useEffect(() => {
    if (!isReplaceMode) return
    history.pushState({ replaceGuard: true }, '', window.location.href)
    const onPopstate = () => {
      history.pushState({ replaceGuard: true }, '', window.location.href)
      setShowReplaceBackGuard(true)
    }
    window.addEventListener('popstate', onPopstate)
    return () => window.removeEventListener('popstate', onPopstate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReplaceMode])

  const handleResumePreviousSession = async () => {
    if (!lobbyId) return
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/select-case`, {
        caseId: prevCaseId,
        sessionMode,
        caseName: prevCaseName,
      })
      localStorage.setItem('compendium-session-start', JSON.stringify({
        lobbyId, caseId: prevCaseId, caseName: prevCaseName, mode: sessionMode,
      }))
      router.replace(
        `/case/${prevCaseId}/interviewer?lobby=${lobbyId}&role=interviewer&sessionMode=${sessionMode}`
      )
    } catch {
      // Non-fatal — let the overlay stay open so the interviewer can retry.
    }
  }

  const handleCancelSessionFromRepo = async () => {
    if (!lobbyId) return
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/cancel`, {})
    } catch {
      // Non-fatal — navigate away regardless so the session isn't left dangling.
    }
    localStorage.setItem('compendium-session-cancelled', JSON.stringify({ lobbyId, ts: Date.now() }))
    // Match the interviewer experience cancel behaviour: go back to the
    // interviewer lobby so they can start fresh (same as handleCancelSession).
    router.replace(`/lobby/${encodeURIComponent(lobbyId)}?role=interviewer&mode=${sessionMode}`)
  }

  // Interviewers arriving in select-mode (via shared invite link) may not be
  // signed in. Silently provision an anonymous Firebase user so the /api
  // select-case call has a valid bearer token. Real signed-in interviewers
  // are a no-op (the helper returns the existing user).
  useEffect(() => {
    if (!selectionMode || !lobbyId) return
    void signInAnonymouslyIfNeeded().catch(() => {
      // Surface error via actionError if it actually blocks a click.
    })
    // Signal to the candidate that the interviewer has opened the case library.
    // Local mode: localStorage storage event (same device).
    // Remote mode: Firestore presence field (cross-device).
    localStorage.setItem('compendium-interviewer-browsing', JSON.stringify({ lobbyId, ts: Date.now() }))
    if (sessionMode !== 'local') {
      void (async () => {
        try {
          const { auth } = await import('@/lib/firebase/config')
          const token = await auth.currentUser?.getIdToken()
          if (!token) return
          await fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ role: 'interviewer', active: true, interviewerBrowsing: true }),
          })
        } catch { /* best-effort */ }
      })()
    }
    return () => {
      localStorage.removeItem('compendium-interviewer-browsing')
      if (sessionMode !== 'local') {
        void (async () => {
          try {
            const { auth } = await import('@/lib/firebase/config')
            const token = await auth.currentUser?.getIdToken()
            if (!token) return
            await fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ role: 'interviewer', active: true, interviewerBrowsing: false }),
            })
          } catch { /* best-effort */ }
        })()
      }
    }
  }, [selectionMode, lobbyId, sessionMode])


  useEffect(() => {
    const fetchCases = async () => {
      // Optimistic flash from cache if fresh enough
      const cached = readCasesCache()
      if (cached) {
        setCases(cached)
        setLoading(false)
      }

      try {
        const snapshot = await getDocs(collection(db, 'cases'))

        // Firestore returns 0 docs when offline (SDK internal cache miss) instead
        // of throwing. If we have cached data and got 0 back, trust the cache.
        if (snapshot.docs.length === 0) {
          const fallback = readCacheForFallback()
          if (fallback && fallback.length > 0) {
            setCases(fallback)
            setFirestoreFailed(true)
            setOfflineBanner(true)
            return
          }
        }

        const data = snapshot.docs.map((caseDoc) => {
          const value = caseDoc.data()
          return {
            id: caseDoc.id,
            numericId: typeof value.id === 'number' ? value.id : undefined,
            title: typeof value.title === 'string' ? value.title : 'Untitled Case',
            industry: typeof value.industry === 'string' ? value.industry : null,
            case_type: normalizeCaseType(
              typeof value.case_type === 'string'
                ? value.case_type
                : typeof value.caseType === 'string'
                  ? value.caseType
                  : null
            ),
            difficulty: typeof value.difficulty === 'string' ? value.difficulty : null,
            company: normalizeCompany(typeof value.company === 'string' ? value.company : null),
                        round: typeof value.round === 'string' ? value.round : null,
slug:
  typeof value.slug === 'string' && value.slug
    ? value.slug
    : slugifyCase(typeof value.title === 'string' ? value.title : ''),

subtype:
  typeof value.subtype === 'string'
    ? value.subtype
    : typeof value.case_subtype === 'string'
    ? value.case_subtype
    : null,
          } satisfies CaseListItem
        })

        data.sort((a, b) => {
          const da = DIFFICULTY_RANK[(a.difficulty ?? '').toLowerCase()] ?? 99
          const db = DIFFICULTY_RANK[(b.difficulty ?? '').toLowerCase()] ?? 99
          if (da !== db) return da - db
          if (typeof a.numericId === 'number' && typeof b.numericId === 'number') {
            return a.numericId - b.numericId
          }
          return a.title.localeCompare(b.title)
        })

        setCases(data)
        writeCasesCache(data)
      } catch (error) {
        setFirestoreFailed(true)
        const fallback = readCacheForFallback()
        if (fallback) {
          setCases(fallback)
          setOfflineBanner(true)
        } else if (navigator.onLine) {
          setActionError(
            error instanceof Error
              ? `Unable to load case library: ${error.message}`
              : 'Unable to load case library. Check your connection and refresh.',
          )
        }
      }

      setLoading(false)
    }

    fetchCases()
  }, [])

  const orderTypes = (types: string[]) =>
  [...types].sort((a, b) => {
    const ia = PREFERRED_TYPE_ORDER.findIndex((t) => t.toLowerCase() === a.toLowerCase())
    const ib = PREFERRED_TYPE_ORDER.findIndex((t) => t.toLowerCase() === b.toLowerCase())
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
  })

const typeOptions = useMemo(
  () => orderTypes(Array.from(new Set(cases.map((c) => c.case_type).filter(Boolean) as string[]))),
  [cases],
)
const industryOptions = useMemo(
  () => Array.from(new Set(cases.map((c) => c.industry).filter(Boolean) as string[])).sort(),
  [cases],
)
const companyOptions = useMemo(
  () => Array.from(new Set(cases.map((c) => c.company).filter(Boolean) as string[])).sort(),
  [cases],
)


// Large, data-driven pool of example searches spanning every filter dimension.
const searchDemos = useMemo(() => {
  const lc = (s: string) => s.toLowerCase().trim()
  const companies = companyOptions
  const industries = industryOptions
  const types = typeOptions
  const levels = FILTER_LEVELS
  const subtypes = Array.from(
    new Set(cases.map((c) => c.subtype).filter(Boolean) as string[]),
  )

  const out = new Set<string>()
  const add = (...parts: string[]) => {
    const phrase = parts.map(lc).filter(Boolean).join(' ')
    if (phrase) out.add(phrase)
  }

  // singles
  ;[...companies, ...industries, ...types, ...levels, ...subtypes].forEach((v) => add(v))

  // pairs across dimensions
  companies.forEach((c) => levels.forEach((l) => add(c, l)))
  companies.forEach((c) => types.forEach((t) => add(c, t)))
  companies.forEach((c) => industries.forEach((i) => add(c, i)))
  industries.forEach((i) => types.forEach((t) => add(i, t)))
  industries.forEach((i) => levels.forEach((l) => add(i, l)))
  industries.forEach((i) => subtypes.forEach((s) => add(i, s)))
  types.forEach((t) => levels.forEach((l) => add(t, l)))
  subtypes.forEach((s) => levels.forEach((l) => add(s, l)))

  // a few triples for extra variety
  industries.forEach((i) => types.forEach((t) => levels.forEach((l) => add(i, t, l))))

  return Array.from(out)
}, [cases, companyOptions, industryOptions, typeOptions])

// Fisher–Yates shuffle, fresh per mount → different users see different orders.
const shuffledDemos = useMemo(() => {
  const arr = [...searchDemos]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}, [searchDemos])

 // Token search: query is split on spaces; a case matches only if EVERY
// token appears in AT LEAST ONE field. So "bcg easy" => BCG + Easy,
// "profitability revenue" => only profitability-revenue cases, a case
// name matches its title, an industry name matches that industry, etc.
const filteredCases = useMemo(() => {
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean)
  return cases.filter((caseItem) => {
const haystack = [
  caseItem.title, caseItem.industry, caseItem.case_type,
  caseItem.subtype, caseItem.difficulty, caseItem.company, caseItem.round,
].map((v) => (v ?? '').toLowerCase())

    const matchesText = tokens.every((tok) => haystack.some((f) => f.includes(tok)))
    const eq = (val: string | null, list: string[]) =>
      list.length === 0 || list.some((x) => (val ?? '').toLowerCase() === x.toLowerCase())

return (
  matchesText &&
  eq(caseItem.case_type, typeFilter) &&
  eq(caseItem.difficulty, levelFilter) &&
  eq(caseItem.industry, industryFilter) &&
  eq(caseItem.company, companyFilter) &&
  (!recentlyAddedFilter || isNewCase(caseItem.numericId, caseItem.slug))
)
  })
}, [cases, filter, typeFilter, levelFilter, industryFilter, companyFilter, recentlyAddedFilter])


// Book-style lettered sections — only when browsing (no search/filter active).
const grouped = useMemo(() => {
  if (!showSectionBands) return null
  return typeOptions
    .map((type) => ({
      type,
      items: filteredCases.filter((c) => (c.case_type ?? '') === type),
    }))
    .filter((g) => g.items.length > 0)
    .map((g, i) => ({ ...g, letter: ROMAN[i] ?? String(i + 1) }))
}, [filteredCases, typeOptions, showSectionBands])

  // Scroll-spy: highlight the framework chip whose case section is in view.
  // Must come after `grouped` declaration since it depends on it.
  useEffect(() => {
    if (!grouped || grouped.length === 0) {
      setActiveFramework(null)
      return
    }
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('.repo-fw-section[data-framework]')
    )
    if (sections.length === 0) {
      setActiveFramework(null)
      return
    }
    const ratios = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const slug = (entry.target as HTMLElement).dataset.framework
          if (!slug) continue
          ratios.set(slug, entry.isIntersecting ? entry.intersectionRatio : 0)
        }
        let best: string | null = null
        let bestRatio = 0
        ratios.forEach((r, slug) => {
          if (r > bestRatio) { bestRatio = r; best = slug }
        })
        setActiveFramework(bestRatio > 0 ? best : null)
      },
      {
        rootMargin: '-210px 0px -55% 0px',
        threshold: [0, 0.15, 0.35, 0.6, 1],
      }
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [grouped])

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [selectionMode])

  // On row hover (or focus) ask Next.js to download the destination page
  // bundle so click → navigation feels closer to instant. We mirror the
  // exact URLs handleSelectCase will router.push to, including the lobby
  // params, so the prefetched route hydrates correctly.
const prefetchCase = useCallback((caseItem: CaseListItem) => {
  if (prefetchedCasesRef.current.has(caseItem.id)) return
  prefetchedCasesRef.current.add(caseItem.id)

  // 1. Prefetch the JS bundle for the destination route.
  const destination =
    selectionMode && lobbyId
      ? `/case/${caseItem.id}/interviewer?lobby=${lobbyId}&role=interviewer&sessionMode=${sessionMode}`
      : `/case/${caseItem.slug ?? slugifyCase(caseItem.title)}`
  router.prefetch(destination)

  // 2. Warm the case-document localStorage cache used by InterviewerExperience.
  //    If it's already cached, skip the Firestore read. If not, fetch it now at
  //    low priority so it's ready by the time the user clicks.
  const cacheKey = `compendium-case-v9-${caseItem.id}`
  if (typeof window !== 'undefined' && !localStorage.getItem(cacheKey)) {
    import('firebase/firestore').then(({ getDoc }) => {
      import('@/lib/firebase/collections').then(({ caseDoc }) => {
        getDoc(caseDoc(caseItem.id))
          .then(snap => {
            if (snap.exists()) {
              try { localStorage.setItem(cacheKey, JSON.stringify(snap.data())) } catch { /* quota */ }
            }
          })
          .catch(() => { /* ignore — just a best-effort prefetch */ })
      })
    })
  }
}, [selectionMode, lobbyId, sessionMode, router])

  const handleSelectCase = async (caseId: string, caseTitle?: string) => {
    if (pendingCaseId) return // ignore double-clicks while one is in flight
    setActionError('')
    setFailedCase(null)
    setPendingCaseId(caseId)

    if (selectionMode && lobbyId) {
      const destination = `/case/${caseId}/interviewer?lobby=${lobbyId}&role=interviewer&sessionMode=${sessionMode}`
      const eventData = { lobbyId, caseId, caseName: caseTitle ?? '', mode: sessionMode }
      localStorage.setItem('compendium-session-start', JSON.stringify(eventData))

      // Mark selection in-flight. The interviewer page suppresses its
      // "waiting → lobby" redirect for up to 12 s while this marker exists,
      // giving select-case time to transition the session to in_progress.
      localStorage.setItem(
        `compendium-selecting-${lobbyId}`,
        JSON.stringify({ caseId, ts: Date.now() }),
      )

      // Navigate immediately — don't wait for the API round-trip.
      // select-case runs in parallel; the interviewer page's Firestore
      // listener picks up the in_progress transition as soon as it lands.
      router.push(destination)

      apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/select-case`, {
        caseId,
        sessionMode,
        ...(caseTitle ? { caseName: caseTitle } : {}),
      }).catch((error) => {
        // API failed — clear the marker so the interviewer page's grace
        // window expires and it redirects back to the lobby on next snapshot.
        localStorage.removeItem(`compendium-selecting-${lobbyId}`)
        const message = error instanceof Error ? error.message : 'Unable to start this session right now.'
        setActionError(message)
        if (lobbyId && message.includes('already running')) {
          getDoc(doc(db, 'sessions', lobbyId))
            .then((snap) => setActiveSessionCaseId(snap.data()?.caseId ?? null))
            .catch(() => setActiveSessionCaseId(null))
        } else {
          setActiveSessionCaseId(null)
          setFailedCase({ id: caseId, title: caseTitle ?? '' })
        }
        setPendingCaseId(null)
      })

      return
    }

    router.push(`/case/${caseId}/interviewer?preview=1`)
    // Same reasoning as above — don't clear; the route change unmounts us.
  }

  const handlePreviewClick = useCallback((
    e: React.MouseEvent<HTMLAnchorElement>,
    caseItem: CaseListItem,
  ) => {
    const slug = caseItem.slug ?? slugifyCase(caseItem.title)
    if (READY_CASE_SLUGS.has(slug)) return
    e.preventDefault()
    setComingSoonBody('Team CCX is putting the finishing touches on this case. Check back shortly.')
    setComingSoonVisible(true)
  }, [setComingSoonBody, setComingSoonVisible])

  const handleSelectClick = useCallback((caseItem: CaseListItem) => {
    const slug = caseItem.slug ?? slugifyCase(caseItem.title)
    if (!READY_CASE_SLUGS.has(slug)) {
      setComingSoonBody('Team CCX is putting the finishing touches on this case. Please select a different case.')
      setComingSoonVisible(true)
      return
    }
    void handleSelectCase(caseItem.id, caseItem.title)
  }, [handleSelectCase, setComingSoonBody, setComingSoonVisible])

  const resultsLabel = loading
    ? 'Loading...'
    : `${filteredCases.length} ${filteredCases.length === 1 ? 'case' : 'cases'} available`

  const cardHandlers = { selectionMode, pendingCaseId, prefetchCase, handleSelectClick, handlePreviewClick }

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative flex min-h-screen flex-col bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      {/* Mic-blocked guard — only while picking a case for a live local session.
          Top priority: suppresses every other repository overlay while shown. */}
      <MicGuardOverlay
        active={selectionMode && !!lobbyId && sessionMode === 'local'}
        lobbyId={lobbyId}
        onShowingChange={setMicGuardShowing}
      />

      {/* Interviewer mic-loss recovery — remote only, while browsing cases.
          Shows if a previously-granted mic drops; "Skip recording" routes to the
          gate's no-consent path. Self-suppresses on candidate opt-out / prior decline. */}
      {selectionMode && !!lobbyId && sessionMode !== 'local' ? (
        <InterviewerMicRecovery
          lobbyId={lobbyId}
          active={true}
          onShowingChange={setMicGuardShowing}
        />
      ) : null}

      {caseLoadErrorVisible && !micGuardShowing ? (
        <LobbyOverlay
          key="case-load-error"
          type="warning"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
          title="That case couldn't load"
          body="Something went wrong opening the case. Pick a different one to try again."
          onDismiss={() => setCaseLoadErrorVisible(false)}
        />
      ) : null}

      {comingSoonVisible && !micGuardShowing ? (
        <LobbyOverlay
          key="case-coming-soon"
          type="info"
          autoDismissMs={2500}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
          title="Cooking this one up"
          body={comingSoonBody}
          onDismiss={() => setComingSoonVisible(false)}
        />
      ) : null}

      {showCloseWarning && !micGuardShowing ? (
        <LobbyOverlay
          key="close-warning"
          type="warning"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
          title="Case not picked yet"
          body="Your candidate is waiting. Close this and they'll be stuck on the loading screen."
          autoDismissMs={7000}
          onDismiss={() => setShowCloseWarning(false)}
        />
      ) : null}

      {showReplaceBackGuard && isReplaceMode && !micGuardShowing ? (
        <LobbyOverlay
          key="replace-back-guard"
          type="warning"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>}
          title="Going back?"
          body={`Jump back into "${prevCaseName}", or pull the plug on this one.`}
          actionLabel="Resume last session"
          onAction={() => { setShowReplaceBackGuard(false); void handleResumePreviousSession() }}
          secondaryActionLabel="Cancel session"
          onSecondaryAction={() => { setShowReplaceBackGuard(false); void handleCancelSessionFromRepo() }}
          onDismiss={() => setShowReplaceBackGuard(false)}
        />
      ) : null}

      {candidateTabClosed && !micGuardShowing && lobbyId ? (
        <LobbyOverlay
          key="candidate-tab-closed"
          type="warning"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><line x1="2" y1="2" x2="22" y2="22"/></svg>}
          title="Candidate tab closed"
          body="No recording is happening right now. Reopen their tab to start capturing audio again, or carry on without it."
          actionLabel="Reopen candidate tab"
          onAction={() => {
            const url = candidateTabUrlRef.current ?? `/lobby/${lobbyId}?mode=local`
            openCandidateTab(lobbyId, url)
            setCandidateTabClosed(false)
          }}
          secondaryActionLabel="Continue without recording"
          onSecondaryAction={() => {
            dismissCandidateClosedForSession(lobbyId)
            setCandidateTabClosed(false)
          }}
          onDismiss={() => setCandidateTabClosed(false)}
        />
      ) : null}

      {liveSessionOverlayInfo && !micGuardShowing ? (
        <LobbyOverlay
          key="live-session"
          type="warning"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          title="Session still going"
          body={`A case is already live with the candidate. Go back to it or pick a new one to replace it.`}
          actionLabel="Go to session"
          onAction={() => router.push(
            `/case/${liveSessionOverlayInfo.caseId}/interviewer?lobby=${liveSessionOverlayInfo.lobbyId}&role=interviewer&sessionMode=${liveSessionOverlayInfo.sessionMode}`
          )}
          onDismiss={() => setLiveSessionOverlayInfo(null)}
        />
      ) : null}

      {selectionMode && actionError && !micGuardShowing ? (
        <LobbyOverlay
          key={actionError}
          type={activeSessionCaseId ? 'warning' : 'error'}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
          title={activeSessionCaseId ? 'Session already running' : 'Couldn\'t start session'}
          body={actionError}
          actionLabel={activeSessionCaseId ? 'Go to session' : failedCase ? 'Try again' : undefined}
          onAction={
            activeSessionCaseId
              ? () => router.push(`/case/${activeSessionCaseId}/interviewer?lobby=${lobbyId}&role=interviewer&sessionMode=${sessionMode}`)
              : failedCase
                ? () => { void handleSelectCase(failedCase.id, failedCase.title) }
                : undefined
          }
          onDismiss={() => {
            setActionError('')
            setFailedCase(null)
            setActiveSessionCaseId(null)
          }}
        />
      ) : null}
      <style>{`
.repo-table-surface {
  background: rgba(255, 248, 240, 0.55);
  border: 1px solid rgba(92,64,51,0.08);
  box-shadow: 0 1px 2px rgba(59,47,47,0.02), 0 18px 40px rgba(59,47,47,0.04);
}
/* Toolbar - sticky layer B (search + filters, inside the container) */
.repo-table-toolbar {
  position: sticky;
  top: 118px;
  z-index: 41;
  background: transparent;
  transition: background 320ms cubic-bezier(0.22,1,0.36,1);
}
[data-stuck='true'] .repo-table-toolbar {
  background: #fff8f0;
}
[data-stuck='true'] .repo-table-toolbar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -18px;
  height: 18px;
  pointer-events: none;
  background: linear-gradient(180deg, #fff8f0 0%, rgba(255,248,240,0) 100%);
  z-index: 1;
}
@media (max-width: 760px) {
  .repo-table-toolbar { top: 106px; }
}
[data-mode='select'] .repo-table-toolbar { top: 70px; }
@media (max-width: 760px) {
  [data-mode='select'] .repo-table-toolbar { top: 70px; }
}
.repo-table-head { background: transparent; }

.repo-filter-pop {
  padding: 8px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255,250,244,0.98), rgba(248,241,233,0.96));
  border: 1px solid rgba(92,64,51,0.10);
  box-shadow: 0 14px 36px rgba(59,47,47,0.12);
  animation: repo-tip-in .18s cubic-bezier(0.16,1,0.3,1) both;
}
.repo-filter-scroll::-webkit-scrollbar { width: 6px; }
.repo-filter-scroll::-webkit-scrollbar-thumb { background: rgba(92,64,51,0.18); border-radius: 99px; }
.repo-filter-scroll::-webkit-scrollbar-track { background: transparent; }


.repo-clear { animation: repo-clear-in .3s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes repo-clear-in { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: none; } }

/* Flowy, glassy search that melts into the page */
.repo-search-shell {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(252,245,236,0.55) 0%, rgba(249,241,232,0.4) 50%, rgba(247,238,228,0.45) 100%);
  border: 1px solid rgba(92,64,51,0.09);
  border-radius: 16px;
  box-shadow: inset 0 1px 0 rgba(255,252,247,0.4), 0 1px 2px rgba(59,47,47,0.02);
  backdrop-filter: blur(16px) saturate(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  transition: border-color .3s ease, box-shadow .3s ease, background .3s ease;
}
/* faint warm-green drift instead of a white glare */
.repo-search-shell::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(110deg, transparent 35%, rgba(61,90,53,0.05) 50%, transparent 65%);
  background-size: 220% 100%;
  animation: repo-shimmer 9s ease-in-out infinite;
  opacity: 0.7;
}
.repo-search-shell:focus-within {
  border-color: rgba(61,90,53,0.16);
  background: linear-gradient(135deg, rgba(253,247,239,0.62) 0%, rgba(250,243,234,0.46) 50%, rgba(248,240,230,0.5) 100%);
  box-shadow: inset 0 1px 0 rgba(255,252,247,0.5), 0 6px 22px rgba(61,90,53,0.05), 0 0 0 5px rgba(255,248,240,0.45);
}
.repo-input::placeholder { color: rgba(92,64,51,0.42); opacity: 1; }

.repo-tip {
  background: linear-gradient(180deg, rgba(255,250,244,0.94) 0%, rgba(248,241,233,0.88) 100%);
  border: 1px solid rgba(92,64,51,0.10);
  box-shadow: 0 12px 30px rgba(59,47,47,0.10);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  animation: repo-tip-in .22s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes repo-tip-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.repo-caret { animation: repo-blink 1s steps(1) infinite; }
@keyframes repo-blink { 50% { opacity: 0; } }

.repo-hint-chip:hover { background: rgba(61,90,53,0.14); border-color: rgba(61,90,53,0.28); transform: translateY(-1px); }

.repo-no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.repo-no-scrollbar::-webkit-scrollbar { display: none; }
.repo-scroll-cue { animation: repo-bounce 1.4s ease-in-out infinite; }

/* Book-style category header: drop-cap + fading green rule, no fill, no full divider */
.repo-section { animation: repo-fade .6s ease both; }
.repo-section-rule {
  flex: 1; height: 1px; align-self: center; margin-left: 8px;
  background: linear-gradient(90deg, rgba(61,90,53,0.22) 0%, rgba(92,64,51,0.06) 38%, transparent 100%);
}

/* Rows: no borders, no zebra — structure from whitespace + a green accent bar on hover */
.repo-table-row, .repo-mobile-card {
  position: relative;
  transition: background-color .22s ease, opacity .22s ease;
}
.repo-table-row::before {
  content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 2px;
  border-radius: 2px; background: #3D5A35; opacity: 0; transform: scaleY(0.35);
  transform-origin: center; transition: opacity .22s ease, transform .22s ease;
}
.repo-table-row:hover { background: rgba(61,90,53,0.045); }
.repo-table-row:hover::before { opacity: 1; transform: scaleY(1); }
.repo-mobile-card:hover { background: rgba(61,90,53,0.04); }
.repo-title { transition: transform .22s ease; }
.repo-table-row:hover .repo-title { transform: translateX(4px); }

.repo-preview-button {
  background: rgba(255,248,240,0.7);
  border: 1px solid rgba(61,90,53,0.18);
  color: #3D5A35;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
  transition: background-color .2s ease, border-color .2s ease, color .2s ease, box-shadow .2s ease, transform .2s ease;
}
.repo-preview-button:hover {
  background: rgba(61,90,53,0.10);
  border-color: rgba(61,90,53,0.30);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 16px rgba(61,90,53,0.08);
  transform: translateY(-1px);
}

@keyframes repo-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes repo-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.repo-rise { animation: repo-rise .5s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes repo-bounce { 0%,100% { transform: translateY(0);} 50% { transform: translateY(4px);} }
@keyframes repo-shimmer { 0% { background-position: -200% 0;} 100% { background-position: 200% 0;} }

@media (prefers-reduced-motion: reduce) {
  .repo-rise, .repo-section, .repo-hints { animation: none; }
  .repo-table-row:hover .repo-title { transform: none; }
}

/* ===== Unified frozen header block (chips + toolbar) ===== */
.repo-chiprail {
  position: sticky;
  top: 70px;
  z-index: 42;
  margin: 0;
  padding: 10px 20px 10px;
  background: transparent;
  transition: background 320ms cubic-bezier(0.22,1,0.36,1);
  display: flex;
  align-items: center;
  gap: 18px;
}
@media (min-width: 768px) {
  .repo-chiprail { padding-left: 28px; padding-right: 28px; gap: 22px; }
}
[data-stuck='true'] .repo-chiprail {
  background: #fff8f0;
}

/* ===== Permanent "Frameworks" label left of chip row ===== */
.repo-frameworks-label {
  flex-shrink: 0;
  font-family: 'Newsreader', serif;
  font-style: italic;
  font-weight: 400;
  font-size: 17px;
  letter-spacing: 0.015em;
  color: rgba(92,64,51,0.58);
  text-shadow: 0 1px 0 rgba(255,252,247,0.9);
  white-space: nowrap;
  position: relative;
  padding-bottom: 5px;
  opacity: 0;
  animation: repo-frameworks-pop 0.65s cubic-bezier(0.16, 1, 0.3, 1) 180ms forwards;
}
.repo-frameworks-label::after {
  content: '';
  position: absolute;
  left: 2px;
  right: 2px;
  bottom: 0;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg,
    rgba(92,64,51,0) 0%,
    rgba(150,116,86,0.42) 30%,
    rgba(196,168,130,0.6) 60%,
    rgba(196,168,130,0) 100%);
}
@keyframes repo-frameworks-pop {
  0%   { opacity: 0; transform: translateY(8px) rotate(-1.2deg); filter: blur(1px); }
  60%  { opacity: 1; transform: translateY(-2px) rotate(-1.2deg); filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) rotate(-1.2deg); filter: blur(0); }
}
@media (prefers-reduced-motion: reduce) {
  .repo-frameworks-label { animation: none; opacity: 1; }
}

.repo-chiprow {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
  padding: 2px;
}
.repo-chiprow::-webkit-scrollbar { display: none; }

.repo-chip {
  position: relative;
  overflow: hidden;
  flex: 1 1 0;
  min-width: max-content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 13px 18px;
  border-radius: 16px;
  background: linear-gradient(135deg,
    rgba(255,250,243,0.9) 0%, rgba(252,245,236,0.78) 52%, rgba(250,242,232,0.85) 100%);
  border: 1px solid rgba(92,64,51,0.08);
  color: rgba(69,58,42,0.78);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
  transition:
    background 420ms cubic-bezier(0.22,1,0.36,1),
    border-color 420ms cubic-bezier(0.22,1,0.36,1),
    color 420ms cubic-bezier(0.22,1,0.36,1),
    box-shadow 420ms cubic-bezier(0.22,1,0.36,1),
    transform 420ms cubic-bezier(0.22,1,0.36,1);
}

/* Per-framework subtle differentiation */
.repo-chip[data-fw='0'] {
  background: linear-gradient(135deg, rgba(255,251,244,0.92), rgba(250,243,233,0.8));
  box-shadow: 0 2px 10px rgba(196,168,130,0.07);
}
.repo-chip[data-fw='1'] {
  background: linear-gradient(120deg, rgba(255,250,242,0.92), rgba(248,242,234,0.8));
  box-shadow: 0 2px 10px rgba(61,90,53,0.06);
}
.repo-chip[data-fw='2'] {
  background: linear-gradient(150deg, rgba(255,251,245,0.92), rgba(249,243,235,0.8));
  box-shadow: 0 2px 10px rgba(196,168,130,0.08);
}
.repo-chip[data-fw='3'] {
  background: linear-gradient(110deg, rgba(255,250,243,0.92), rgba(250,243,234,0.8));
  box-shadow: 0 2px 10px rgba(92,64,51,0.05);
}
.repo-chip[data-fw='4'] {
  background: linear-gradient(160deg, rgba(255,251,244,0.92), rgba(248,242,233,0.8));
  box-shadow: 0 2px 10px rgba(61,90,53,0.07);
}
.repo-chip[data-fw='5'] {
  background: linear-gradient(130deg, rgba(255,250,242,0.92), rgba(250,242,232,0.8));
  box-shadow: 0 2px 10px rgba(196,168,130,0.06);
}
.repo-chip-label { position: relative; z-index: 1; line-height: 1; }

.repo-chip::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(110deg, transparent 35%, rgba(255,252,247,0.55) 50%, transparent 65%);
  background-size: 220% 100%;
  background-position: 200% 0;
  opacity: 0;
  transition: opacity 420ms ease;
}

.repo-chip:hover {
  background: linear-gradient(135deg,
    rgba(253,247,239,0.85) 0%, rgba(250,243,234,0.72) 50%, rgba(248,240,230,0.8) 100%);
  border-color: rgba(92,64,51,0.16);
  color: #5C4033;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(92,64,51,0.07);
}
.repo-chip:hover::before {
  opacity: 1;
  animation: repo-shimmer 1.6s cubic-bezier(0.22,1,0.36,1);
}

.repo-chip:focus-visible {
  outline: none;
  border-color: rgba(92,64,51,0.22);
  box-shadow: 0 0 0 3px rgba(255,248,240,0.9), 0 0 0 4px rgba(92,64,51,0.12);
}

/* When one chip is active, dim all chips softly (warm recede, never dark) */
.repo-chiprow[data-has-active='true'] .repo-chip {
  opacity: 0.55;
  background: linear-gradient(135deg,
    rgba(250,243,233,0.5) 0%, rgba(247,239,228,0.4) 100%);
  border-color: rgba(92,64,51,0.06);
  color: rgba(69,58,42,0.6);
  transition:
    opacity 360ms cubic-bezier(0.22,1,0.36,1),
    background 360ms cubic-bezier(0.22,1,0.36,1),
    border-color 360ms cubic-bezier(0.22,1,0.36,1),
    color 360ms cubic-bezier(0.22,1,0.36,1);
}

/* Restore the active chip to full strength */
.repo-chiprow[data-has-active='true'] .repo-chip[data-active='true'] {
  opacity: 1;
  background: radial-gradient(110% 130% at 50% 45%,
    rgba(255,250,242,0.98) 0%,
    rgba(253,247,238,0.95) 50%,
    rgba(250,243,233,0.94) 100%);
  border-color: rgba(92,64,51,0.18);
  color: #3a2f25;
  box-shadow: inset 0 0 0 1px rgba(255,252,247,0.7);
}

/* Lift dimmed chips on hover so the row stays interactive */
.repo-chiprow[data-has-active='true'] .repo-chip:hover {
  opacity: 0.9;
}

/* Slow contained cream sheen on the active chip for subtle life */
.repo-chiprow[data-has-active='true'] .repo-chip[data-active='true']::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(110deg, transparent 38%, rgba(255,253,248,0.5) 50%, transparent 62%);
  background-size: 220% 100%;
  opacity: 1;
  animation: repo-shimmer 5s ease-in-out infinite;
}

@media (max-width: 760px) {
  .repo-chiprow { gap: 8px; }
  .repo-chip { flex: 0 0 auto; font-size: 11.5px; padding: 11px 15px; }
}
@keyframes repo-fab-ping {
  0%   { transform: scale(1);   opacity: 0.7; }
  70%  { transform: scale(1.55); opacity: 0; }
  100% { transform: scale(1.55); opacity: 0; }
}
      `}</style>

      {selectionMode ? (
        <div
          className="fixed top-0 z-[100] w-full"
          style={{
            height: '70px',
            background: 'rgba(255,248,240,0.9)',
            backdropFilter: 'blur(28px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
            borderBottom: '1px solid rgba(92,64,51,0.06)',
          }}
        >
          <div className="mx-auto flex h-[74px] max-w-screen-2xl items-center justify-between px-4 md:px-12">
            <div className="flex items-center gap-1">
              <Image
                src="/logo.png"
                alt="Case Compendium X"
                width={56}
                height={56}
                className="h-14 w-14 object-contain"
              />
              <div style={{ fontFamily: "'Newsreader', serif" }} className="text-xl font-semibold tracking-tight">
                <span className="text-[#453a2a]">Case Compendium</span>
                <span className="text-[#3D5A35]">X</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Navbar currentPage="repository" />
      )}

      {/* pt-[90px] clears the fixed 70px navbar + breathing room */}
      <main
        className={`min-h-[88vh] px-4 md:px-8 ${
          selectionMode
            ? 'flex min-h-[calc(100vh-70px)] flex-1 flex-col justify-center pb-20 pt-[90px] md:pb-24'
            : 'pb-12 pt-[90px]'
        }`}
      >
        <section data-stuck={stuck ? 'true' : undefined} data-mode={selectionMode ? 'select' : undefined} className="mx-auto w-full max-w-[1320px] pb-16">

          {/* Header */}
          <div className="mb-12 max-w-[760px]">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[2px]">
                <span className="text-[10px] uppercase tracking-[0.28em] text-[#3D5A35]">
                  Repository
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {selectionMode && (
                    <>
                      <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#3D5A35]/20 text-[#3D5A35]/60 bg-[#3D5A35]/5 leading-tight uppercase">
                        Interviewer Mode
                      </span>
                      <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight uppercase">
                        {sessionMode === 'local' ? 'Same Device' : 'Remote'}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <h1
                style={{ fontFamily: "'Newsreader', serif" }}
                className="text-4xl font-light leading-[0.94] tracking-tight text-[#453a2a] md:text-5xl"
              >
                Case Library
              </h1>
              <p className="mt-4 max-w-[620px] pl-[2px] text-[13px] leading-relaxed text-[#5c4033]/62">
                {selectionMode
                  ? 'Choose a case to launch this interview session.'
                  : 'Browse available cases, search and filter by type or level, and preview before practicing.'}
              </p>
            </div>
          </div>

          {/* Framework chips - standalone, above the case table container */}
          {!selectionMode && !loading && (
            <div className="repo-chiprail">
              <span className="repo-frameworks-label">Frameworks</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <FrameworkChips activeSlug={activeFramework} />
              </div>
            </div>
          )}

          {offlineBanner && (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#3D5A35]/12 bg-[rgba(255,248,240,0.9)] px-5 py-3 text-[12px] text-[#5C4033]/60">
              <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#3D5A35]/40" />
              Showing cached library. Connect to refresh.
            </div>
          )}

          {/* Case Table */}
          <div className="repo-table-surface relative z-10 rounded-[30px]">
            <div className="repo-table-toolbar relative z-30 rounded-t-[30px] px-5 py-5 md:px-7 md:py-6">

{/* Search */}
<div className="repo-search-shell flex items-center gap-2.5 px-4 py-3">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#3D5A35]/55">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
    <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
  <div className="relative w-full">
    <input
      value={filter}
      onChange={(event) => setFilter(event.target.value)}
      onFocus={() => setSearchFocused(true)}
      onBlur={() => setSearchFocused(false)}
      placeholder=""
      className="repo-input w-full border-none bg-transparent text-[13px] text-[#453a2a] outline-none"
    />
    {filter === '' && !searchFocused && <SearchPlaceholder words={shuffledDemos} />}
  </div>
  {filter ? (
    <button onClick={() => setFilter('')} aria-label="Clear search" className="shrink-0 text-[#5C4033]/40 hover:text-[#5C4033] transition-colors">
      <X className="h-4 w-4" />
    </button>
  ) : null}
</div>

{/* Filters */}
<div className="mt-4 flex flex-wrap items-center gap-1">
  <RepoFilterDropdown label="Type" options={typeOptions} selected={typeFilter} onChange={setTypeFilter} align="left" columns={1} width={190} />
  <RepoFilterDropdown label="Industry" options={industryOptions} selected={industryFilter} onChange={setIndustryFilter} align="left" />
  <RepoFilterDropdown label="Company" options={companyOptions} selected={companyFilter} onChange={setCompanyFilter} align="left" />
  <RepoFilterDropdown label="Level" options={FILTER_LEVELS} selected={levelFilter} onChange={setLevelFilter} align="left" columns={1} width={150} />

{hasActiveFilters && (
  <button
    onClick={clearAllFilters}
    className="repo-clear group ml-1 inline-flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium text-[#5C4033]/45 transition-colors duration-200 hover:text-[#3D5A35]"
  >
    <X className="h-3 w-3 transition-transform duration-300 group-hover:rotate-90" />
    Clear
  </button>
)}

<div className="ml-auto flex items-center gap-3">
  {(hasActiveFilters || hasQuery) && (
    <span className="text-[10px] uppercase tracking-[0.16em] text-[#5C4033]/45">
      {filteredCases.length} {filteredCases.length === 1 ? 'result' : 'results'}
    </span>
  )}
  <button
    onClick={() => setRecentlyAddedFilter((v) => !v)}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors duration-200 ${
      recentlyAddedFilter
        ? 'border-[#3D5A35]/35 bg-[#3D5A35]/10 text-[#3D5A35]'
        : 'border-[#5C4033]/12 bg-transparent text-[#5C4033]/50 hover:border-[#3D5A35]/22 hover:text-[#3D5A35]/70'
    }`}
  >
    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="shrink-0"><circle cx="4" cy="4" r="3" /></svg>
    Recently Added
  </button>
</div>
</div>
            </div>

            <div className="relative overflow-hidden rounded-b-[30px]">
{/* Table Header */}
<div className={`repo-table-head ${ROW_GRID} hidden md:grid px-2 sm:px-4 pt-5 md:pt-6`}>
  {['', 'Case', 'Industry', 'Level', 'Company', ''].map((label, i) => (
    <div key={i} className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#3D5A35]/55">
      {label}
    </div>
  ))}
</div>

              {loading ? (
  <PlatformLoader message="Pulling up your cases…" />
) : firestoreFailed && cases.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                  <svg viewBox="0 0 64 64" fill="none" width="28" height="28" style={{ opacity: 0.35 }}>
                    <path d="M16 10h32l-8 14 5 8-13 22-13-22 5-8-8-14Z" fill="#5C4033" />
                    <path d="M32 24 27 32h10l-5-8Z" fill="#3D5A35" />
                  </svg>
                  <p className="text-[13px] font-medium text-[#5c4033]/60">You&rsquo;re offline</p>
                  <p className="max-w-[240px] text-[12px] leading-relaxed text-[#5c4033]/38">
                    Visit once with a connection and the whole library stays with you.
                  </p>
                </div>
              ) : filteredCases.length === 0 ? (
                <div className="px-6 py-14 text-center text-[13px] text-[#5c4033]/45">
                  No cases found for that search
                </div>
              ) : (
                <>
<div className="hidden md:block">
{grouped
  ? grouped.map((g, gi) => (
      <div
        key={g.type}
        id={`fw-${frameworkSlug(g.type)}`}
        data-framework={frameworkSlug(g.type)}
        className="repo-fw-section"
      >
        <SectionBand letter={g.letter} type={g.type} isFirst={gi === 0} />
        {g.items.map((caseItem, i) => <CaseRow key={caseItem.id} caseItem={caseItem} index={i} {...cardHandlers} />)}
      </div>
    ))
  : filteredCases.map((caseItem, i) => <CaseRow key={caseItem.id} caseItem={caseItem} index={i} {...cardHandlers} />)}
</div>

                  {/* Mobile cards */}
<div className="md:hidden">
{grouped
  ? grouped.map((g, gi) => (
      <div
        key={g.type}
        id={`fw-${frameworkSlug(g.type)}`}
        data-framework={frameworkSlug(g.type)}
        className="repo-fw-section"
      >
        <SectionBand letter={g.letter} type={g.type} isFirst={gi === 0} />
        {g.items.map((caseItem, i) => <CaseCard key={caseItem.id} caseItem={caseItem} index={i} {...cardHandlers} />)}
      </div>
    ))
  : filteredCases.map((caseItem, i) => <CaseCard key={caseItem.id} caseItem={caseItem} index={i} {...cardHandlers} />)}
</div>

                </>
              )}
            </div>
          </div>

        </section>
      </main>

      {!selectionMode ? (
        <div className="relative z-10">
          <Footer currentPage="repository" />
        </div>
      ) : null}

    </div>
  )
}

export default function RepositoryPage() {
  return (
    <>
      <CursorGlow />
      <Suspense fallback={<PlatformLoader message="Pulling up your cases…" />}>
        <RepositoryContent />
      </Suspense>
    </>
  )
}

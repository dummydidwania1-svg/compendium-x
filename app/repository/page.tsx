'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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


const CASES_CACHE_KEY = 'compendium_cases_v2'
// Bump when the cached shape (CaseListItem) changes — old envelopes get
// rejected automatically so users don't render stale, type-mismatched data.
const CASES_CACHE_VERSION = 4
// Optimistic-render cache window. Beyond this the cache is treated as too
// stale to flash on screen and we wait for fresh data instead. Firestore is
// fetched on every load regardless; this just controls "do we show
// something immediately or render a brief loading state."
const CASES_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

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

const SEARCH_DEMOS = ['bcg easy', 'fmcg revenue', 'market entry', 'guesstimate hard']

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

function RepositoryContent() {

  const [cases, setCases] = useState<CaseListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [levelFilter, setLevelFilter] = useState<string[]>([])
  const [industryFilter, setIndustryFilter] = useState<string[]>([])
const [companyFilter, setCompanyFilter] = useState<string[]>([])
const [roundFilter, setRoundFilter] = useState<string[]>([])
  const [actionError, setActionError] = useState('')
  const [failedCase, setFailedCase] = useState<{ id: string; title: string } | null>(null)
  // When selection fails because a case is already in_progress, store the
  // running case id so we can offer "Go to session" CTA.
  const [activeSessionCaseId, setActiveSessionCaseId] = useState<string | null>(null)
  // When interviewer navigates back to repo from a live session, show an overlay.
  const [liveSessionOverlayInfo, setLiveSessionOverlayInfo] = useState<{ caseId: string; caseName: string; lobbyId: string; sessionMode: string } | null>(null)
  // When the interviewer panel couldn't load a case and redirected back here.
  const [caseLoadErrorVisible, setCaseLoadErrorVisible] = useState(false)
  const [offlineBanner, setOfflineBanner] = useState(false)
  const [firestoreFailed, setFirestoreFailed] = useState(false)
  // ID of the case the user just clicked, while the API call + navigation
  // resolve. The row dims and the button switches to a spinner-like label
  // so the click doesn't feel like it was dropped. Cleared on error so the
  // user can retry; on success the page navigates away before clearing is
  // needed.
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  // Track which case destinations we've already asked Next.js to prefetch
  // so we don't fire the same prefetch call on every mouseenter event.
  const prefetchedCasesRef = useRef<Set<string>>(new Set())

  const selectionMode = searchParams.get('mode') === 'select'
  const lobbyId = searchParams.get('lobby')
  const sessionMode = searchParams.get('sessionMode') === 'local' ? 'local' : 'remote'
  const caseError = searchParams.get('caseError')


  const showSectionBands = typeFilter.length !== 1;

const hasActiveFilters =
  typeFilter.length > 0 || levelFilter.length > 0 ||
  industryFilter.length > 0 || companyFilter.length > 0 ||
  roundFilter.length > 0
const hasQuery = filter.trim().length > 0
const clearAllFilters = () => {
  setTypeFilter([]); setLevelFilter([]); setIndustryFilter([]); setCompanyFilter([]); setRoundFilter([])
}

  // Show case-load-error overlay when redirected back from a failed interviewer panel.
  useEffect(() => {
    if (caseError) setCaseLoadErrorVisible(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On load in selection mode, check if a session for this lobby is already
  // in_progress (interviewer pressed back from the interviewer panel).
  useEffect(() => {
    if (!selectionMode || !lobbyId) return
    try {
      const raw = localStorage.getItem('compendium-session-start')
      if (!raw) return
      const data = JSON.parse(raw) as { lobbyId?: string; caseId?: string; caseName?: string; mode?: string }
      if (data.lobbyId === lobbyId && data.caseId) {
        setLiveSessionOverlayInfo({
          caseId: data.caseId,
          caseName: data.caseName ?? 'the current case',
          lobbyId,
          sessionMode: data.mode ?? sessionMode,
        })
      }
    } catch { /* ignore */ }
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Interviewers arriving in select-mode (via shared invite link) may not be
  // signed in. Silently provision an anonymous Firebase user so the /api
  // select-case call has a valid bearer token. Real signed-in interviewers
  // are a no-op (the helper returns the existing user).
  useEffect(() => {
    if (!selectionMode || !lobbyId) return
    void signInAnonymouslyIfNeeded().catch(() => {
      // Surface error via actionError if it actually blocks a click.
    })
    // Signal to the candidate lobby that the interviewer has opened the case
    // library. The candidate tab picks this up via a 'storage' event.
    localStorage.setItem('compendium-interviewer-browsing', JSON.stringify({ lobbyId, ts: Date.now() }))
    return () => {
      localStorage.removeItem('compendium-interviewer-browsing')
    }
  }, [selectionMode, lobbyId])


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
            case_type:
              typeof value.case_type === 'string'
                ? value.case_type
                : typeof value.caseType === 'string'
                  ? value.caseType
                  : null,
            difficulty: typeof value.difficulty === 'string' ? value.difficulty : null,
            company: typeof value.company === 'string' ? value.company : null,
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

  // Preferred display order; anything not listed still gets its own real
// section (sorted after), so no case is ever dumped into "Other".
const PREFERRED_TYPE_ORDER = [
  'Profitability', 'Market Entry', 'Market Growth', 'Growth',
  'Pricing', 'Unconventional', 'Guesstimate',
]

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

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

const roundOptions = useMemo(
  () => Array.from(new Set(cases.map((c) => c.round).filter(Boolean) as string[])).sort(),
  [cases],
)

// Large, data-driven pool of example searches spanning every filter dimension.
const searchDemos = useMemo(() => {
  const lc = (s: string) => s.toLowerCase().trim()
  const companies = companyOptions
  const industries = industryOptions
  const types = typeOptions
  const rounds = roundOptions
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
  ;[...companies, ...industries, ...types, ...levels, ...rounds, ...subtypes].forEach((v) => add(v))

  // pairs across dimensions
  companies.forEach((c) => levels.forEach((l) => add(c, l)))
  companies.forEach((c) => types.forEach((t) => add(c, t)))
  companies.forEach((c) => industries.forEach((i) => add(c, i)))
  industries.forEach((i) => types.forEach((t) => add(i, t)))
  industries.forEach((i) => levels.forEach((l) => add(i, l)))
  industries.forEach((i) => subtypes.forEach((s) => add(i, s)))
  types.forEach((t) => levels.forEach((l) => add(t, l)))
  types.forEach((t) => rounds.forEach((r) => add(t, r)))
  subtypes.forEach((s) => levels.forEach((l) => add(s, l)))

  // a few triples for extra variety
  industries.forEach((i) => types.forEach((t) => levels.forEach((l) => add(i, t, l))))

  return Array.from(out)
}, [cases, companyOptions, industryOptions, typeOptions, roundOptions])

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
  eq(caseItem.round, roundFilter)
)
  })
}, [cases, filter, typeFilter, levelFilter, industryFilter, companyFilter, roundFilter])


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

  // On row hover (or focus) ask Next.js to download the destination page
  // bundle so click → navigation feels closer to instant. We mirror the
  // exact URLs handleSelectCase will router.push to, including the lobby
  // params, so the prefetched route hydrates correctly.
const prefetchCase = (caseItem: CaseListItem) => {
  if (prefetchedCasesRef.current.has(caseItem.id)) return
  prefetchedCasesRef.current.add(caseItem.id)
  const destination =
    selectionMode && lobbyId
      ? `/case/${caseItem.id}/interviewer?lobby=${lobbyId}&role=interviewer&sessionMode=${sessionMode}`
      : `/case/${caseItem.slug ?? slugifyCase(caseItem.title)}`
  router.prefetch(destination)
}

  const handleSelectCase = async (caseId: string, caseTitle?: string) => {
    if (pendingCaseId) return // ignore double-clicks while one is in flight
    setActionError('')
    setFailedCase(null)
    setPendingCaseId(caseId)

    if (selectionMode && lobbyId) {
      const eventData = { lobbyId, caseId, caseName: caseTitle ?? '', mode: sessionMode }
      localStorage.setItem('compendium-session-start', JSON.stringify(eventData))

      try {
        await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/select-case`, {
          caseId,
          sessionMode,
          ...(caseTitle ? { caseName: caseTitle } : {}),
        })

        router.push(
          `/case/${caseId}/interviewer?lobby=${lobbyId}&role=interviewer&sessionMode=${sessionMode}`
        )
        // Intentionally do NOT clear pendingCaseId — the navigation is in
        // flight and the next page's loading state takes over from here.
        // Clearing now would let the button flicker back to "Select" right
        // before the route changes.
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to start this session right now.'
        setActionError(message)
        // If a case is already running, fetch the session to get the active caseId
        // so we can offer a "Go to session" CTA instead of "Try again".
        if (lobbyId && message.includes('already running')) {
          try {
            const snap = await getDoc(doc(db, 'sessions', lobbyId))
            const data = snap.data()
            setActiveSessionCaseId(data?.caseId ?? null)
          } catch {
            setActiveSessionCaseId(null)
          }
        } else {
          setActiveSessionCaseId(null)
          setFailedCase({ id: caseId, title: caseTitle ?? '' })
        }
        setPendingCaseId(null)
      }

      return
    }

    router.push(`/case/${caseId}/interviewer?preview=1`)
    // Same reasoning as above — don't clear; the route change unmounts us.
  }

  const resultsLabel = loading
    ? 'Loading...'
    : `${filteredCases.length} ${filteredCases.length === 1 ? 'case' : 'cases'} available`

const ROW_GRID =
  'grid grid-cols-[40px_minmax(0,1.5fr)_minmax(0,1.05fr)_minmax(0,0.6fr)_minmax(0,1fr)_112px] items-center gap-x-4'


  const OPEN_ENDED = (t: string | null) => ['guesstimate', 'unconventional'].includes((t ?? '').toLowerCase())

const SectionBand = ({ letter, type, isFirst }: { letter: string; type: string; isFirst: boolean }) => (
  <div className={`repo-section ${ROW_GRID} px-2 sm:px-4 ${isFirst ? 'pt-3' : 'pt-8'} pb-3`}>
<div className="flex items-center px-2">   {/* ← same px-/justify as the CaseRow number cell */}
  <span className="font-serif text-[16px] leading-none tracking-tight text-[#3D5A35]/85">
    {letter}
  </span>
</div>
    <div className="col-span-5 flex items-baseline gap-3 px-2 pr-4">
      <span className="font-serif text-[15px] italic tracking-wide text-[#453a2a]/80">{type}</span>
      <span className="repo-section-rule" />
    </div>
  </div>
)

const CaseRow = ({ caseItem, index }: { caseItem: CaseListItem; index: number }) => (
  <div
    onMouseEnter={() => prefetchCase(caseItem)}
    onFocus={() => prefetchCase(caseItem)}
    style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    className={`repo-table-row repo-rise ${ROW_GRID} px-2 sm:px-4 ${pendingCaseId === caseItem.id ? 'opacity-50' : ''}`}
  >
    <div className="px-2 py-4 text-[11px] tabular-nums text-[#5C4033]/35">
      {caseItem.numericId ?? caseItem.id.slice(0, 4)}
    </div>
    <div className="px-2 py-4 pr-4">
      <div className="repo-title flex flex-col gap-0.5">
<span className="text-[13px] font-medium leading-snug tracking-[0.01em] text-[#3B2F2F]">{caseItem.title}</span>        {caseItem.subtype ? (
          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#3D5A35]/75">{caseItem.subtype}</span>
        ) : null}
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
      onClick={() => handleSelectCase(caseItem.id, caseItem.title)}
      disabled={pendingCaseId !== null}
      className="repo-preview-button w-full rounded-full px-3 py-2 text-[9px] font-medium uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pendingCaseId === caseItem.id ? 'Starting…' : 'Select'}
    </button>
  ) : (
    <Link
      href={`/case/${caseItem.slug ?? slugifyCase(caseItem.title)}`}
      onMouseEnter={() => prefetchCase(caseItem)}
      className="repo-preview-button block w-full rounded-full px-3 py-2 text-center text-[9px] font-medium uppercase tracking-[0.16em]"
    >
      Preview
    </Link>
  )}
</div>
  </div>
)

const CaseCard = ({ caseItem, index }: { caseItem: CaseListItem; index: number }) => (
  <div
    onMouseEnter={() => prefetchCase(caseItem)}
    onFocus={() => prefetchCase(caseItem)}
    style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    className={`repo-mobile-card repo-rise px-4 py-4 space-y-2 ${pendingCaseId === caseItem.id ? 'opacity-50' : ''}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] tabular-nums text-[#5C4033]/35">{caseItem.numericId ?? caseItem.id.slice(0, 4)}</span>
<span className="text-[13px] font-medium tracking-[0.01em] text-[#3B2F2F]">{caseItem.title}</span>
      </div>
      <DifficultyDots level={caseItem.difficulty} />
    </div>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#5C4033]/65">
      {caseItem.subtype ? (
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#3D5A35]/80">{caseItem.subtype}</span>
      ) : null}
      {!OPEN_ENDED(caseItem.case_type) && caseItem.industry ? <span>{caseItem.industry}</span> : null}
      {caseItem.company ? <span>· {caseItem.company}</span> : null}
    </div>
{selectionMode ? (
  <button
    onClick={() => handleSelectCase(caseItem.id, caseItem.title)}
    disabled={pendingCaseId !== null}
    className="repo-preview-button w-full rounded-full px-5 py-2 text-[9px] font-medium uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-60"
  >
    {pendingCaseId === caseItem.id ? 'Starting…' : 'Select Case'}
  </button>
) : (
  <Link
    href={`/case/${caseItem.slug ?? slugifyCase(caseItem.title)}`}
    onMouseEnter={() => prefetchCase(caseItem)}
    className="repo-preview-button block w-full rounded-full px-5 py-2 text-center text-[9px] font-medium uppercase tracking-[0.16em]"
  >
    Preview Case
  </Link>
)}
  </div>
)

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative flex min-h-screen flex-col bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      {caseLoadErrorVisible ? (
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

      {liveSessionOverlayInfo ? (
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

      {selectionMode && actionError ? (
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
.repo-table-toolbar { position: relative; }
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
        <section className="mx-auto w-full max-w-[1320px] pb-16">

          {/* Header */}
          <div className="mb-7 max-w-[760px]">
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
  <RepoFilterDropdown label="Type" options={typeOptions} selected={typeFilter} onChange={setTypeFilter} align="left" />
  <RepoFilterDropdown label="Industry" options={industryOptions} selected={industryFilter} onChange={setIndustryFilter} align="left" />
  <RepoFilterDropdown label="Company" options={companyOptions} selected={companyFilter} onChange={setCompanyFilter} align="left" />
  <RepoFilterDropdown label="Level" options={FILTER_LEVELS} selected={levelFilter} onChange={setLevelFilter} align="left" />
<RepoFilterDropdown label="Round" options={roundOptions} selected={roundFilter} onChange={setRoundFilter} align="left" />

{hasActiveFilters && (
  <button
    onClick={clearAllFilters}
    className="repo-clear group ml-1 inline-flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium text-[#5C4033]/45 transition-colors duration-200 hover:text-[#3D5A35]"
  >
    <X className="h-3 w-3 transition-transform duration-300 group-hover:rotate-90" />
    Clear
  </button>
)}

{(hasActiveFilters || hasQuery) && (
  <div className="ml-auto flex items-center gap-3">
    <span className="text-[10px] uppercase tracking-[0.16em] text-[#5C4033]/45">
      {filteredCases.length} {filteredCases.length === 1 ? 'result' : 'results'}
    </span>
  </div>
)}
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
      <div key={g.type}>
        <SectionBand letter={g.letter} type={g.type} isFirst={gi === 0} />
        {g.items.map((caseItem, i) => <CaseRow key={caseItem.id} caseItem={caseItem} index={i} />)}
      </div>
    ))
  : filteredCases.map((caseItem, i) => <CaseRow key={caseItem.id} caseItem={caseItem} index={i} />)}
</div>

                  {/* Mobile cards */}
<div className="md:hidden">
{grouped
  ? grouped.map((g, gi) => (
      <div key={g.type}>
        <SectionBand letter={g.letter} type={g.type} isFirst={gi === 0} />
        {g.items.map((caseItem, i) => <CaseCard key={caseItem.id} caseItem={caseItem} index={i} />)}
      </div>
    ))
  : filteredCases.map((caseItem, i) => <CaseCard key={caseItem.id} caseItem={caseItem} index={i} />)}
</div>

                  {/* Coming Soon - animated glass strip */}
                  <div className="relative border-t border-[#5C4033]/6 overflow-hidden">
                    <div
                      className="relative flex items-center justify-center gap-3 py-5"
                      style={{
                        background: 'linear-gradient(180deg, rgba(255,248,240,0.32) 0%, rgba(252,245,237,0.72) 45%, rgba(248,240,231,0.88) 100%)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                      }}
                    >
                      {/* Shimmer overlay */}
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
                          backgroundSize: '200% 100%',
                          animation: 'repo-shimmer 4s ease-in-out infinite',
                        }}
                      />
                      <span className="inline-block w-6 h-[1px] bg-[#D9D0C4]/50" />
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-[0.22em] font-semibold text-[#5C4033]/35">
                          More cases coming soon
                        </span>
                        <svg
                          width="10" height="10" viewBox="0 0 10 10" fill="none"
                          className="text-[#5C4033]/30"
                          style={{ animation: 'repo-bounce 1.8s ease-in-out infinite' }}
                        >
                          <path d="M5 2L5 8M5 8L2.5 5.5M5 8L7.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span className="inline-block w-6 h-[1px] bg-[#D9D0C4]/50" />
                    </div>
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

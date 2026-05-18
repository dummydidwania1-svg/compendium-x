'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { collection, getDocs } from 'firebase/firestore'
import { X } from 'lucide-react'
import Footer from '@/components/dashboard/Footer'
import Navbar from '@/components/dashboard/Navbar'
import { db, signInAnonymouslyIfNeeded } from '@/lib/firebase/config'
import { FILTER_TYPES, FILTER_LEVELS } from '@/lib/constants'
import MultiSelectDropdown from '@/components/ui/MultiSelectDropdown'
import { apiPost } from '@/lib/api/client'

const CASES_CACHE_KEY = 'compendium_cases_v2'
// Bump when the cached shape (CaseListItem) changes — old envelopes get
// rejected automatically so users don't render stale, type-mismatched data.
const CASES_CACHE_VERSION = 1
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
}

interface CasesCacheEnvelope {
  version: number
  savedAt: number
  data: CaseListItem[]
}

function readCasesCache(): CaseListItem[] | null {
  try {
    const raw = localStorage.getItem(CASES_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CasesCacheEnvelope> | unknown
    // Reject legacy bare-array caches and version-mismatched envelopes.
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('version' in parsed) ||
      (parsed as CasesCacheEnvelope).version !== CASES_CACHE_VERSION ||
      !Array.isArray((parsed as CasesCacheEnvelope).data)
    ) {
      localStorage.removeItem(CASES_CACHE_KEY)
      return null
    }
    const envelope = parsed as CasesCacheEnvelope
    const stale = Date.now() - envelope.savedAt > CASES_CACHE_TTL_MS
    if (stale && navigator.onLine) {
      // Stale and online: don't flash old data, wait for fresh Firestore fetch.
      // Keep on disk as offline fallback.
      return null
    }
    // Offline or fresh: always show cached data
    return envelope.data
  } catch {
    try {
      localStorage.removeItem(CASES_CACHE_KEY)
    } catch {
      // localStorage unavailable; nothing we can do.
    }
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

function formatDifficultyLabel(value: string | null) {
  if (!value) return 'General'
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function RepositoryContent() {
  const [cases, setCases] = useState<CaseListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [levelFilter, setLevelFilter] = useState<string[]>([])
  const [actionError, setActionError] = useState('')
  const [offlineBanner, setOfflineBanner] = useState(false)
  // ID of the case the user just clicked, while the API call + navigation
  // resolve. The row dims and the button switches to a spinner-like label
  // so the click doesn't feel like it was dropped. Cleared on error so the
  // user can retry; on success the page navigates away before clearing is
  // needed.
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectionMode = searchParams.get('mode') === 'select'
  const lobbyId = searchParams.get('lobby')
  const sessionMode = searchParams.get('sessionMode') === 'local' ? 'local' : 'remote'

  const hasActiveFilters = typeFilter.length > 0 || levelFilter.length > 0
  const clearAllFilters = () => { setTypeFilter([]); setLevelFilter([]) }

  // Interviewers arriving in select-mode (via shared invite link) may not be
  // signed in. Silently provision an anonymous Firebase user so the /api
  // select-case call has a valid bearer token. Real signed-in interviewers
  // are a no-op (the helper returns the existing user).
  useEffect(() => {
    if (!selectionMode || !lobbyId) return
    void signInAnonymouslyIfNeeded().catch(() => {
      // Surface error via actionError if it actually blocks a click.
    })
  }, [selectionMode, lobbyId])

  useEffect(() => {
    const fetchCases = async () => {
      // Optimistic flash from cache if it's fresh enough — readCasesCache()
      // returns null for missing, malformed, version-bumped, or stale caches.
      const cached = readCasesCache()
      if (cached) {
        setCases(cached)
        setLoading(false)
      }

      try {
        const snapshot = await getDocs(collection(db, 'cases'))
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
        if (cached) {
          // We have cached data showing — show a quiet offline banner instead
          // of a hard error. User can still browse everything they've seen before.
          setOfflineBanner(true)
        } else if (!navigator.onLine) {
          // Offline with no cache — nothing to show, OfflineBanner overlay handles UX
          setOfflineBanner(true)
        } else {
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

  const filteredCases = useMemo(
    () =>
      cases.filter((caseItem) => {
        const matchesText =
          caseItem.title.toLowerCase().includes(filter.toLowerCase()) ||
          (caseItem.industry ?? '').toLowerCase().includes(filter.toLowerCase())
        const matchesType =
          typeFilter.length === 0 ||
          typeFilter.some((t) => (caseItem.case_type ?? '').toLowerCase() === t.toLowerCase())
        const matchesLevel =
          levelFilter.length === 0 ||
          levelFilter.some((l) => (caseItem.difficulty ?? '').toLowerCase() === l.toLowerCase())
        return matchesText && matchesType && matchesLevel
      }),
    [cases, filter, typeFilter, levelFilter]
  )

  const handleSelectCase = async (caseId: string) => {
    if (pendingCaseId) return // ignore double-clicks while one is in flight
    setActionError('')
    setPendingCaseId(caseId)

    if (selectionMode && lobbyId) {
      const eventData = { lobbyId, caseId, mode: sessionMode }
      localStorage.setItem('compendium-session-start', JSON.stringify(eventData))

      try {
        await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/select-case`, {
          caseId,
          sessionMode,
        })

        router.push(
          `/case/${caseId}/interviewer?lobby=${lobbyId}&role=interviewer&sessionMode=${sessionMode}`
        )
        // Intentionally do NOT clear pendingCaseId — the navigation is in
        // flight and the next page's loading state takes over from here.
        // Clearing now would let the button flicker back to "Select" right
        // before the route changes.
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Unable to start this session right now.'
        )
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

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative flex min-h-screen flex-col bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        .repo-table-surface {
          background: rgba(255,248,240,0.8);
          border: 1px solid rgba(61, 90, 53, 0.1);
          box-shadow: 0 4px 12px rgba(59, 47, 47, 0.04);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .repo-table-toolbar {
          background: linear-gradient(180deg, rgba(255,248,240,0.9) 0%, rgba(247,240,232,0.82) 72%, rgba(246,239,231,0.62) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.52);
        }
        .repo-table-toolbar::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1px;
          height: 10px;
          background: linear-gradient(180deg, rgba(246,239,231,0) 0%, rgba(255,248,240,0.5) 100%);
          pointer-events: none;
          z-index: 2;
        }
        .repo-table-toolbar::after {
          content: '';
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 0;
          height: 1px;
          background: linear-gradient(90deg, rgba(92,64,51,0) 0%, rgba(92,64,51,0.07) 18%, rgba(92,64,51,0.12) 50%, rgba(92,64,51,0.07) 82%, rgba(92,64,51,0) 100%);
          pointer-events: none;
          z-index: 3;
        }
        .repo-table-head {
          background: linear-gradient(180deg, rgba(255,248,240,0.82) 0%, rgba(255,248,240,0.95) 100%);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        .repo-search-shell {
          background: linear-gradient(180deg, rgba(255,249,242,0.56) 0%, rgba(245,238,229,0.42) 100%);
          border: 1px solid rgba(92,64,51,0.06);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.5);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .repo-search-shell:focus-within {
          background: linear-gradient(180deg, rgba(255,249,242,0.7) 0%, rgba(248,241,233,0.56) 100%);
          border-color: rgba(92,64,51,0.09);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.62), 0 0 0 3px rgba(255,248,240,0.5);
        }
        .repo-preview-button {
          background: rgba(255,248,240,0.84);
          border: 1px solid rgba(61,90,53,0.16);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72), 0 1px 2px rgba(61,90,53,0.04);
          transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .repo-preview-button:hover {
          background: rgba(61,90,53,0.08);
          border-color: rgba(61,90,53,0.24);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 6px 14px rgba(61,90,53,0.06);
          transform: translateY(-1px);
        }
        .repo-table-row,
        .repo-mobile-card {
          transition: background-color 0.2s ease, box-shadow 0.2s ease;
        }
        .repo-table-row:nth-child(even),
        .repo-mobile-card:nth-child(even) {
          background: rgba(217,208,196,0.05);
        }
        .repo-table-row:hover {
          background: rgba(217,208,196,0.2);
        }
        .repo-mobile-card:hover {
          background: rgba(217,208,196,0.2);
        }
        .repo-input::placeholder {
          color: rgba(92,64,51,0.46);
          opacity: 1;
        }
        @keyframes repo-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(4px); }
        }
        @keyframes repo-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
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
            <Link href="/" className="flex items-center gap-1 text-left transition-opacity hover:opacity-85">
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
            </Link>
          </div>
        </div>
      ) : (
        <Navbar currentPage="repository" />
      )}

      {/* pt-[90px] clears the fixed 70px navbar + breathing room */}
      <main
        className={`relative px-4 md:px-8 ${
          selectionMode
            ? 'flex min-h-[calc(100vh-70px)] flex-1 flex-col justify-center pb-20 pt-[90px] md:pb-24'
            : 'pb-12 pt-[90px]'
        }`}
      >
        <section className="mx-auto w-full max-w-6xl">

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
                {!selectionMode && (
                  <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight uppercase">
                    Sample
                  </span>
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

          {actionError ? (
            <div className="mb-5 rounded-xl border border-[#b4543e]/15 bg-[rgba(255,244,239,0.9)] px-5 py-3.5 text-[13px] text-[#92400e]">
              {actionError}
            </div>
          ) : null}

          {/* Case Table */}
          <div className="repo-table-surface relative z-10 rounded-[30px]">
            <div className="repo-table-toolbar relative z-30 rounded-t-[30px] px-4 py-3 md:px-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2.5">
                  <MultiSelectDropdown
                    label="Type"
                    options={FILTER_TYPES}
                    selected={typeFilter}
                    onChange={setTypeFilter}
                    align="left"
                  />
                  <MultiSelectDropdown
                    label="Level"
                    options={FILTER_LEVELS}
                    selected={levelFilter}
                    onChange={setLevelFilter}
                    align="left"
                  />
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-[#5C4033]/50 transition-colors hover:bg-[#D9D0C4]/30 hover:text-[#3B2F2F]"
                    >
                      <X className="h-3 w-3" /> Clear all
                    </button>
                  )}
                  <span className="ml-1 text-[10px] text-[#5C4033]/35">{resultsLabel}</span>
                </div>
                <div className="w-full md:max-w-[260px]">
                  <div className="repo-search-shell rounded-full px-3.5 py-1.5">
                    <input
                      type="text"
                      placeholder="Search..."
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      className="repo-input w-full border-none bg-transparent text-[12px] text-[#453a2a] outline-none"
                      style={{ fontFamily: "'Work Sans', sans-serif" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-b-[30px]">
              {/* Table Header */}
              <div className="repo-table-head hidden border-b border-[#5C4033]/8 md:grid md:grid-cols-[56px_minmax(0,1.28fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_96px_150px] items-center">
                {['#', 'Case', 'Industry', 'Type', 'Level', ''].map((label) => (
                  <div
                    key={label}
                    className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#5C4033]/60"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="px-6 py-14 text-center text-[13px] text-[#5c4033]/45">
                  Loading library...
                </div>
              ) : filteredCases.length === 0 ? (
                <div className="px-6 py-14 text-center text-[13px] text-[#5c4033]/45">
                  No cases found for that search
                </div>
              ) : (
                <>
                  {/* Desktop rows */}
                  <div className="hidden md:block">
                    {filteredCases.map((caseItem) => (
                      <div
                        key={caseItem.id}
                        className="repo-table-row grid grid-cols-[56px_minmax(0,1.28fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_96px_150px] items-center"
                      >
                        <div className="px-4 py-3.5 text-[11px] text-[#5c4033]/34 font-medium tabular-nums">
                          {caseItem.numericId ?? caseItem.id.slice(0, 4)}
                        </div>
                        <div className="px-4 py-3.5">
                          <span className="text-[13px] font-medium text-[#453a2a]/88">{caseItem.title}</span>
                        </div>
                        <div className="px-4 py-3.5 text-[12px] text-[#5c4033]/78">
                          {caseItem.industry ?? 'General'}
                        </div>
                        <div className="px-4 py-3.5 text-[12px] text-[#5c4033]/76">
                          {caseItem.case_type ?? 'General'}
                        </div>
                        <div className="px-4 py-3.5">
                          <span className="text-[9px] font-medium bg-[#D9D0C4]/20 border border-[#5C4033]/10 text-[#5C4033]/66 px-2 py-[3px] rounded-md whitespace-nowrap">
                            {formatDifficultyLabel(caseItem.difficulty)}
                          </span>
                        </div>
                        <div className="px-4 py-3.5 pr-5">
                          <button
                            type="button"
                            onClick={() => handleSelectCase(caseItem.id)}
                            disabled={pendingCaseId !== null}
                            className="repo-preview-button w-full rounded-full px-3 py-2 text-[9px] font-medium uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {pendingCaseId === caseItem.id
                              ? selectionMode
                                ? 'Starting…'
                                : 'Opening…'
                              : selectionMode
                                ? 'Select'
                                : 'Preview'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden">
                    {filteredCases.map((caseItem) => (
                      <article key={caseItem.id} className="repo-mobile-card px-4 py-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] text-[#5c4033]/30 font-medium">
                              {caseItem.numericId ?? caseItem.id.slice(0, 4)}
                            </span>
                            <h2
                              style={{ fontFamily: "'Newsreader', serif" }}
                              className="mt-0.5 text-xl leading-tight text-[#453a2a]/88"
                            >
                              {caseItem.title}
                            </h2>
                          </div>
                          <span className="text-[9px] font-medium bg-[#D9D0C4]/20 border border-[#5C4033]/10 text-[#5C4033]/60 px-2 py-[3px] rounded-md whitespace-nowrap mt-1">
                            {formatDifficultyLabel(caseItem.difficulty)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-[#5c4033]/64">
                          <span>{caseItem.industry ?? 'General'}</span>
                          <span className="text-[#D9D0C4]">·</span>
                          <span>{caseItem.case_type ?? 'General'}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectCase(caseItem.id)}
                          disabled={pendingCaseId !== null}
                          className="repo-preview-button w-full rounded-full px-5 py-2 text-[9px] font-medium uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingCaseId === caseItem.id
                            ? selectionMode
                              ? 'Starting…'
                              : 'Opening…'
                            : selectionMode
                              ? 'Select Case'
                              : 'Preview Case'}
                        </button>
                      </article>
                    ))}
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
      ) : (
        <footer style={{ background: '#453a2a' }} className="mt-auto w-full px-6 py-6 md:px-10 md:py-7">
          <div className="mx-auto max-w-screen-2xl">
            <div className="mb-5 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center md:gap-10">
              <div>
                <Link href="/" style={{ fontFamily: "'Newsreader', serif" }} className="mb-2 inline-block text-2xl font-semibold tracking-tight transition-opacity hover:opacity-85">
                  <span style={{ color: '#d5c4b1' }}>Case Compendium</span>
                  <span style={{ color: '#aed0a1' }}>X</span>
                </Link>
                <p
                  style={{
                    fontFamily: "'Work Sans', sans-serif",
                    color: 'rgba(213,196,177,0.5)',
                    maxWidth: '280px',
                    lineHeight: 1.6,
                  }}
                  className="text-xs"
                >
                  AI-powered case practice and performance analytics for consulting interviews.
                </p>
              </div>
              <div className="flex flex-wrap gap-x-10 gap-y-3 md:gap-x-12">
                <Link
                  href="/"
                  style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
                  className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
                >
                  Home
                </Link>
                <Link
                  href="/about"
                  style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
                  className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
                >
                  About Us
                </Link>
                <Link
                  href="/privacy-policy"
                  style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
                  className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
                >
                  Privacy Policy
                </Link>
                <a
                  href="mailto:contact@casecompendiumx.in?subject=Compendium%20X%20Privacy%20Request"
                  style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
                  className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
                >
                  Contact Us
                </a>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(213,196,177,0.12)', paddingTop: '12px' }} className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-5">
                <a href="https://www.linkedin.com/company/casecompendiumx" target="_blank" rel="noreferrer" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="LinkedIn">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                  </svg>
                </a>
                <a href="mailto:contact@casecompendiumx.in" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="Email Us">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                </a>
              </div>
              <p style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.35)', lineHeight: 1.8 }} className="text-[10px] tracking-[0.2em] uppercase">
                &copy; 2026 Case CompendiumX. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}

export default function RepositoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#fff8f0] text-[#5c4033]">
          Loading Repository...
        </div>
      }
    >
      <RepositoryContent />
    </Suspense>
  )
}

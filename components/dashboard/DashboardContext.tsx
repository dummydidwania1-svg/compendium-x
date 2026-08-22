'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import {
  buildDashboardEntries,
  mapCaseMeta,
  mapSessionMeta,
  type DashboardCaseEntry,
  type DashboardCaseMeta,
  type DashboardSessionMeta,
} from '@/lib/dashboard/live'
import type { EvaluationRecord } from '@/lib/dashboard/types'

type StreamKey = 'profile' | 'cases' | 'evaluations' | 'sessions'

type DashboardContextValue = {
  authResolved: boolean
  isPreview: boolean
  loading: boolean
  error: string
  user: User | null
  fullName: string | null
  firstName: string
  goalTargetCases: number
  records: EvaluationRecord[]
  entries: DashboardCaseEntry[]
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined)

// Case-meta cache: short TTL, sessionStorage-scoped per tab.
const CASES_META_CACHE_KEY = 'ccx-dashboard-case-meta-v1'
const CASES_META_CACHE_TTL_MS = 30 * 60 * 1000

function firstNameOf(value: string | null, fallbackEmail?: string | null) {
  const raw = value?.trim() || fallbackEmail?.trim() || 'Candidate'
  return raw.split(' ')[0] || 'Candidate'
}

/**
 * Translates Firestore listener failures into calm, actionable copy. Raw SDK
 * messages ("Missing or insufficient permissions") previously surfaced verbatim
 * and never cleared even after the stream recovered.
 */
function friendlyStreamError(label: string, issue: unknown): string {
  const code =
    typeof issue === 'object' && issue !== null && 'code' in issue
      ? String((issue as { code?: unknown }).code)
      : ''
  if (code.includes('permission-denied')) {
    return `Your ${label} couldn't be loaded (access denied). Try signing out and back in.`
  }
  if (
    code.includes('unavailable') ||
    code.includes('failed-precondition') ||
    code.includes('deadline-exceeded')
  ) {
    return `Connection hiccup while loading ${label} — it will retry automatically.`
  }
  return `Your ${label} couldn't be loaded just now — it will retry automatically.`
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [authResolved, setAuthResolved] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  // Per-stream error slots: any single stream hiccup no longer banners the
  // whole dashboard, success clears its own slot, and unrelated streams don't
  // overwrite each other.
  const [streamErrors, setStreamErrors] = useState<Record<StreamKey, string>>({
    profile: '',
    cases: '',
    evaluations: '',
    sessions: '',
  })
  const [profileName, setProfileName] = useState<string | null>(null)
  const [goalTargetCases, setGoalTargetCases] = useState(20)
  const [evaluationDocs, setEvaluationDocs] = useState<Array<{ id: string; data: Record<string, unknown> }>>([])
  const [casesById, setCasesById] = useState<Record<string, DashboardCaseMeta>>({})
  const [sessionsByLobby, setSessionsByLobby] = useState<Record<string, DashboardSessionMeta>>({})
  const [profileReady, setProfileReady] = useState(false)
  const [evaluationsReady, setEvaluationsReady] = useState(false)
  const [casesReady, setCasesReady] = useState(false)
  const [sessionsReady, setSessionsReady] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setAuthResolved(true)
      // Anonymous users (silently provisioned for guest interviewers on shared
      // invite links) must never see the real dashboard — treat them exactly
      // like a signed-out visitor so isPreview/loading/records all fall back
      // to the preview state automatically.
      setUser(nextUser?.isAnonymous ? null : nextUser)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!authResolved) return

    if (!user) {
      setStreamErrors({ profile: '', cases: '', evaluations: '', sessions: '' })
      setProfileName(null)
      setGoalTargetCases(20)
      setEvaluationDocs([])
      setCasesById({})
      setSessionsByLobby({})
      setProfileReady(true)
      setEvaluationsReady(true)
      setCasesReady(true)
      setSessionsReady(true)
      return
    }

    setStreamErrors({ profile: '', cases: '', evaluations: '', sessions: '' })
    setProfileReady(false)
    setEvaluationsReady(false)
    setCasesReady(false)
    setSessionsReady(false)

    let casesCancelled = false

    // Case metadata (title/type/company/industry/difficulty) is effectively
    // immutable during a dashboard visit and only six fields of ~90 docs are
    // consumed — a realtime listener over the FULL cases collection (including
    // every framework tree payload) streamed hundreds of KB per visitor and
    // re-pushed on every catalog write anywhere. A one-shot fetch is all the
    // dashboard needs; a short-lived sessionStorage cache makes repeat
    // navigation render instantly while a background refresh keeps it honest.
    const loadCaseMeta = async () => {
      let hydrated = false
      try {
        const raw = sessionStorage.getItem(CASES_META_CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as { ts: number; cases: Record<string, DashboardCaseMeta> }
          if (
            parsed?.cases &&
            typeof parsed.ts === 'number' &&
            Date.now() - parsed.ts < CASES_META_CACHE_TTL_MS &&
            Object.keys(parsed.cases).length > 0
          ) {
            setCasesById(parsed.cases)
            setCasesReady(true)
            hydrated = true
          }
        }
      } catch {
        // Malformed cache — ignore and fetch fresh.
      }

      try {
        const snapshot = await getDocs(query(collection(db, 'cases')))
        if (casesCancelled) return
        const nextCases = snapshot.docs.reduce<Record<string, DashboardCaseMeta>>((acc, item) => {
          acc[item.id] = mapCaseMeta(item.id, item.data())
          return acc
        }, {})
        setCasesById(nextCases)
        setStreamErrors((prev) => ({ ...prev, cases: '' }))
        setCasesReady(true)
        try {
          sessionStorage.setItem(
            CASES_META_CACHE_KEY,
            JSON.stringify({ ts: Date.now(), cases: nextCases }),
          )
        } catch {
          // Storage blocked/quota — cache simply won't help next time.
        }
      } catch (issue) {
        if (casesCancelled) return
        // A hydrated cache means the user still sees correct data — don't
        // banner the whole dashboard over a failed refresh.
        if (!hydrated) {
          setStreamErrors((prev) => ({
            ...prev,
            cases: friendlyStreamError('case catalogue', issue),
          }))
          setCasesReady(true)
        }
      }
    }
    void loadCaseMeta()

    const unsubscribes = [
      onSnapshot(
        doc(db, 'profiles', user.uid),
        (snapshot) => {
          const data = snapshot.data()
          // The account was soft-deleted (pendingDeletion flag set, e.g. via
          // support) while this session was still open. Sign out immediately
          // rather than waiting for the user's ID token to expire — the
          // Firestore security rules already block further reads/writes for
          // this profile, so this just gets the client out of a now-locked state.
          if (data?.pendingDeletion === true) {
            void signOut(auth)
            return
          }
          const fullName = typeof data?.fullName === 'string' ? data.fullName.trim() : ''
          const goalTarget =
            typeof data?.goalTargetCases === 'number' &&
            Number.isFinite(data.goalTargetCases) &&
            data.goalTargetCases >= 1
              ? Math.round(data.goalTargetCases)
              : 20

          setProfileName(fullName || user.email || 'Candidate')
          setGoalTargetCases(goalTarget)
          setStreamErrors((prev) => ({ ...prev, profile: '' }))
          setProfileReady(true)
        },
        (issue) => {
          setStreamErrors((prev) => ({
            ...prev,
            profile: friendlyStreamError('profile', issue),
          }))
          setProfileReady(true)
        }
      ),
      onSnapshot(
        query(collection(db, 'evaluations'), where('candidateId', '==', user.uid)),
        (snapshot) => {
          setEvaluationDocs(snapshot.docs.map((item) => ({ id: item.id, data: item.data() })))
          setStreamErrors((prev) => ({ ...prev, evaluations: '' }))
          setEvaluationsReady(true)
        },
        (issue) => {
          setStreamErrors((prev) => ({
            ...prev,
            evaluations: friendlyStreamError('practice history', issue),
          }))
          setEvaluationsReady(true)
        }
      ),
      onSnapshot(
        query(collection(db, 'sessions'), where('candidateId', '==', user.uid)),
        (snapshot) => {
          const nextSessions = snapshot.docs.reduce<Record<string, DashboardSessionMeta>>((acc, item) => {
            acc[item.id] = mapSessionMeta(item.id, item.data())
            return acc
          }, {})
          setSessionsByLobby(nextSessions)
          setStreamErrors((prev) => ({ ...prev, sessions: '' }))
          setSessionsReady(true)
        },
        (issue) => {
          setStreamErrors((prev) => ({
            ...prev,
            sessions: friendlyStreamError('session details', issue),
          }))
          setSessionsReady(true)
        }
      ),
    ]

    return () => {
      casesCancelled = true
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [authResolved, user])

  const { records, entries } = useMemo(
    () => buildDashboardEntries(evaluationDocs, casesById, sessionsByLobby),
    [casesById, evaluationDocs, sessionsByLobby]
  )

  const error = useMemo(
    () =>
      [streamErrors.profile, streamErrors.evaluations, streamErrors.sessions, streamErrors.cases]
        .filter(Boolean)
        .join(' '),
    [streamErrors]
  )

  const value = useMemo<DashboardContextValue>(
    () => ({
      authResolved,
      isPreview: !user,
      loading:
        !authResolved ||
        (Boolean(user) && !(profileReady && evaluationsReady && casesReady && sessionsReady)),
      error,
      user,
      fullName: user ? profileName : null,
      firstName: user ? firstNameOf(profileName, user?.email ?? null) : 'there',
      goalTargetCases: user ? goalTargetCases : 20,
      records: user ? records : [],
      entries: user ? entries : [],
    }),
    [
      authResolved,
      casesReady,
      entries,
      error,
      evaluationsReady,
      goalTargetCases,
      profileName,
      profileReady,
      records,
      sessionsReady,
      user,
    ]
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboard must be used within DashboardProvider')
  }
  return context
}

/** Safe variant — returns false when used outside DashboardProvider (e.g. Navbar on non-dashboard pages). */
export function useIsPreview(): boolean {
  const context = useContext(DashboardContext)
  return context ? context.isPreview : false
}

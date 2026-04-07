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
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import {
  buildDashboardEntries,
  mapCaseMeta,
  mapSessionMeta,
  type DashboardCaseEntry,
  type DashboardCaseMeta,
  type DashboardSessionMeta,
} from '@/lib/dashboard/live'
import { buildPreviewDashboardData } from '@/lib/dashboard/preview'
import type { EvaluationRecord } from '@/lib/dashboard/types'

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

function firstNameOf(value: string | null, fallbackEmail?: string | null) {
  const raw = value?.trim() || fallbackEmail?.trim() || 'Candidate'
  return raw.split(' ')[0] || 'Candidate'
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [authResolved, setAuthResolved] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [profileName, setProfileName] = useState<string | null>(null)
  const [goalTargetCases, setGoalTargetCases] = useState(20)
  const [evaluationDocs, setEvaluationDocs] = useState<Array<{ id: string; data: Record<string, unknown> }>>([])
  const [casesById, setCasesById] = useState<Record<string, DashboardCaseMeta>>({})
  const [sessionsByLobby, setSessionsByLobby] = useState<Record<string, DashboardSessionMeta>>({})
  const [profileReady, setProfileReady] = useState(false)
  const [evaluationsReady, setEvaluationsReady] = useState(false)
  const [casesReady, setCasesReady] = useState(false)
  const [sessionsReady, setSessionsReady] = useState(false)
  const previewData = useMemo(() => buildPreviewDashboardData(), [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setAuthResolved(true)
      setUser(nextUser)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!authResolved) return

    if (!user) {
      setError('')
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

    setError('')
    setProfileReady(false)
    setEvaluationsReady(false)
    setCasesReady(false)
    setSessionsReady(false)

    const unsubscribes = [
      onSnapshot(
        doc(db, 'profiles', user.uid),
        (snapshot) => {
          const data = snapshot.data()
          const fullName = typeof data?.fullName === 'string' ? data.fullName.trim() : ''
          const goalTarget =
            typeof data?.goalTargetCases === 'number' &&
            Number.isFinite(data.goalTargetCases) &&
            data.goalTargetCases >= 1
              ? Math.round(data.goalTargetCases)
              : 20

          setProfileName(fullName || user.email || 'Candidate')
          setGoalTargetCases(goalTarget)
          setProfileReady(true)
        },
        (issue) => {
          setError(issue instanceof Error ? issue.message : 'Unable to load dashboard profile data.')
          setProfileReady(true)
        }
      ),
      onSnapshot(
        collection(db, 'cases'),
        (snapshot) => {
          const nextCases = snapshot.docs.reduce<Record<string, DashboardCaseMeta>>((acc, item) => {
            acc[item.id] = mapCaseMeta(item.id, item.data())
            return acc
          }, {})
          setCasesById(nextCases)
          setCasesReady(true)
        },
        (issue) => {
          setError(issue instanceof Error ? issue.message : 'Unable to load case library data for dashboard.')
          setCasesReady(true)
        }
      ),
      onSnapshot(
        query(collection(db, 'evaluations'), where('candidateId', '==', user.uid)),
        (snapshot) => {
          setEvaluationDocs(snapshot.docs.map((item) => ({ id: item.id, data: item.data() })))
          setEvaluationsReady(true)
        },
        (issue) => {
          setError(issue instanceof Error ? issue.message : 'Unable to load evaluation data for dashboard.')
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
          setSessionsReady(true)
        },
        (issue) => {
          setError(issue instanceof Error ? issue.message : 'Unable to load session data for dashboard.')
          setSessionsReady(true)
        }
      ),
    ]

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [authResolved, user])

  const { records, entries } = useMemo(
    () => buildDashboardEntries(evaluationDocs, casesById, sessionsByLobby),
    [casesById, evaluationDocs, sessionsByLobby]
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
      fullName: user ? profileName : previewData.fullName,
      firstName: user
        ? firstNameOf(profileName, user?.email ?? null)
        : firstNameOf(previewData.fullName),
      goalTargetCases: user ? goalTargetCases : previewData.goalTargetCases,
      records: user ? records : previewData.records,
      entries: user ? entries : previewData.entries,
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
      previewData,
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

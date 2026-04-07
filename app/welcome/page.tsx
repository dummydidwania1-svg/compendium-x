'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut, type User } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { auth, db, waitForAuthUser } from '@/lib/firebase/config'
import { mapEvaluationDoc } from '@/lib/dashboard/mappers'
import { computeKpis, lastAttemptLabel, practiceStreakDays, recentRows, sortByNewest } from '@/lib/dashboard/selectors'
import type { EvaluationRecord } from '@/lib/dashboard/types'

function prettySkillName(value: ReturnType<typeof computeKpis>['strongestSkill']) {
  if (!value) return 'N/A'
  if (value === 'structure') return 'Structure'
  if (value === 'understanding') return 'Understanding'
  if (value === 'delivery') return 'Delivery'
  return 'Creativity'
}

function firstNameOf(value: string | null) {
  if (!value) return 'Candidate'
  const trimmed = value.trim()
  if (!trimmed) return 'Candidate'
  return trimmed.split(' ')[0]
}

export default function WelcomePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [records, setRecords] = useState<EvaluationRecord[]>([])
  const [goalTarget, setGoalTarget] = useState(20)
  const [goalDraft, setGoalDraft] = useState('20')
  const [editingGoal, setEditingGoal] = useState(false)
  const [savingGoal, setSavingGoal] = useState(false)

  useEffect(() => {
    let active = true

    const run = async () => {
      const currentUser = await waitForAuthUser()
      if (!active) return
      if (!currentUser) {
        router.replace('/login?redirect=/welcome')
        return
      }

      setUser(currentUser)
      setError('')

      try {
        const profileSnapshot = await getDoc(doc(db, 'profiles', currentUser.uid))
        if (profileSnapshot.exists()) {
          const profileData = profileSnapshot.data()
          const profileName = typeof profileData?.fullName === 'string' ? profileData.fullName.trim() : ''
          setFullName(profileName || currentUser.email || 'Candidate')

          const goalTargetRaw = profileData?.goalTargetCases
          if (typeof goalTargetRaw === 'number' && Number.isFinite(goalTargetRaw) && goalTargetRaw >= 1) {
            const parsedGoal = Math.round(goalTargetRaw)
            setGoalTarget(parsedGoal)
            setGoalDraft(String(parsedGoal))
          }
        } else {
          setFullName(currentUser.email || 'Candidate')
        }

        let docs
        try {
          docs = await getDocs(
            query(
              collection(db, 'evaluations'),
              where('candidateId', '==', currentUser.uid),
              orderBy('createdAt', 'desc')
            )
          )
        } catch {
          docs = await getDocs(query(collection(db, 'evaluations'), where('candidateId', '==', currentUser.uid)))
        }

        const mapped = docs.docs.map((item) => mapEvaluationDoc(item.id, item.data()))
        setRecords(sortByNewest(mapped))
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load your launchpad data.')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    run()
    return () => {
      active = false
    }
  }, [router])

  const kpis = useMemo(() => computeKpis(records), [records])
  const streakDays = useMemo(() => practiceStreakDays(records), [records])
  const lastAttempt = useMemo(() => lastAttemptLabel(records), [records])
  const recent = useMemo(() => recentRows(records, 4), [records])

  const safeGoal = goalTarget > 0 ? goalTarget : 1
  const goalProgress = Math.min(100, (records.length / safeGoal) * 100)
  const remainingCases = Math.max(0, safeGoal - records.length)

  const handleSignOut = async () => {
    await signOut(auth)
    router.push('/')
  }

  const handleGoalSave = async () => {
    if (!user) return
    const parsed = Number.parseInt(goalDraft, 10)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
      setError('Goal target must be between 1 and 500.')
      return
    }

    setSavingGoal(true)
    setError('')
    try {
      await setDoc(
        doc(db, 'profiles', user.uid),
        {
          goalTargetCases: parsed,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      setGoalTarget(parsed)
      setEditingGoal(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save goal target.')
    } finally {
      setSavingGoal(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020b17] text-slate-200 flex items-center justify-center">
        Preparing your launchpad...
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020b17] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(245,158,11,0.16),transparent_40%),radial-gradient(circle_at_82%_18%,rgba(59,130,246,0.2),transparent_36%),linear-gradient(180deg,#020b17_0%,#05162c_52%,#071b2f_100%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#f8fafc_1px,transparent_1px),linear-gradient(to_bottom,#f8fafc_1px,transparent_1px)] [background-size:36px_36px]" />
      </div>

      <header className="relative z-20 border-b border-slate-700/70 bg-[#020b17]/90 backdrop-blur sticky top-0">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6 md:px-8">
          <Link href="/" className="font-serif text-2xl tracking-[0.14em] text-slate-100">
            Compendium X
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/repository"
              className="rounded-md border border-transparent px-2.5 py-1.5 text-slate-300 transition hover:border-slate-600 hover:text-white"
            >
              Cases
            </Link>
            <Link
              href="/practice"
              className="rounded-md border border-transparent px-2.5 py-1.5 text-slate-300 transition hover:border-slate-600 hover:text-white"
            >
              Practice
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md border border-transparent px-2.5 py-1.5 text-slate-300 transition hover:border-slate-600 hover:text-white"
            >
              Dashboard
            </Link>
            <button
              onClick={handleSignOut}
              className="rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/65 p-6 backdrop-blur md:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-amber-200">Welcome Back</p>
          <h1 className="mt-3 font-serif text-4xl text-white md:text-5xl">
            Hello, {firstNameOf(fullName)}.
          </h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            Here is your current practice snapshot. Choose what you want to do next.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/practice"
              className="rounded-lg bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Start Practice
            </Link>
            <Link
              href="/repository"
              className="rounded-lg border border-cyan-400/50 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/80 hover:bg-cyan-300/20"
            >
              Browse Cases
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white"
            >
              Open Full Dashboard
            </Link>
          </div>
        </section>

        {error && (
          <section className="mt-6 rounded-xl border border-red-300/60 bg-red-900/35 p-4 text-sm text-red-200">
            {error}
          </section>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/65 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Cases Completed</p>
            <p className="mt-3 text-3xl font-semibold text-white">{kpis.totalCases}</p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/65 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Average Score</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {typeof kpis.averageScore === 'number' ? `${kpis.averageScore.toFixed(2)} / 5` : 'N/A'}
            </p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/65 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Strongest Area</p>
            <p className="mt-3 text-xl font-semibold text-emerald-300">{prettySkillName(kpis.strongestSkill)}</p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/65 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Focus Area</p>
            <p className="mt-3 text-xl font-semibold text-amber-300">{prettySkillName(kpis.weakestSkill)}</p>
          </article>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          <article className="xl:col-span-2 rounded-2xl border border-slate-700/70 bg-slate-900/65 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Goal Snapshot</p>
                <h2 className="mt-2 text-2xl font-serif text-white">Current Target</h2>
              </div>
              {!editingGoal ? (
                <button
                  onClick={() => {
                    setGoalDraft(String(safeGoal))
                    setEditingGoal(true)
                    setError('')
                  }}
                  className="rounded-md border border-cyan-400/40 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/80 hover:bg-cyan-300/20"
                >
                  Edit Target
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={goalDraft}
                    onChange={(event) => setGoalDraft(event.target.value)}
                    className="w-24 rounded-md border border-slate-600 bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none focus:border-amber-300/80"
                  />
                  <button
                    onClick={handleGoalSave}
                    disabled={savingGoal}
                    className="rounded-md bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-amber-200 disabled:opacity-60"
                  >
                    {savingGoal ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingGoal(false)
                      setGoalDraft(String(safeGoal))
                    }}
                    className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <p className="mt-4 text-sm text-slate-300">
              Target: <span className="font-semibold text-white">{safeGoal}</span> completed cases
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Remaining: <span className="font-semibold text-white">{remainingCases}</span>
            </p>

            <div className="mt-5">
              <div className="h-3 rounded-full bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full bg-amber-300" style={{ width: `${goalProgress}%` }} />
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500">
                {goalProgress.toFixed(1)}% complete
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-700/70 bg-slate-900/65 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Today At A Glance</p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5">
                Practice streak: <span className="font-semibold text-white">{streakDays} days</span>
              </p>
              <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5">
                Last attempt: <span className="font-semibold text-white">{lastAttempt}</span>
              </p>
              <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2.5">
                Suggested next step: complete 1 case and review feedback notes.
              </p>
            </div>
          </article>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-700/70 bg-slate-900/65 p-6">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent Feedback</p>
            <h2 className="mt-2 text-2xl font-serif text-white">Latest Attempts</h2>
          </div>

          {recent.length === 0 ? (
            <p className="text-sm text-slate-300">No completed cases yet. Start your first session from Practice mode.</p>
          ) : (
            <div className="space-y-3">
              {recent.map((row) => (
                <button
                  key={row.id}
                  onClick={() => router.push(`/dashboard/evaluations/${row.id}`)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/45 px-4 py-3 text-left transition hover:border-slate-500 hover:bg-slate-950/60"
                >
                  <p className="text-sm font-semibold text-white">{row.caseTitle}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {row.caseType ?? 'General'} • {row.industry ?? 'General'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

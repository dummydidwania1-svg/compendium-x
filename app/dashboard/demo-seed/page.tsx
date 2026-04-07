'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from 'firebase/auth'
import { waitForAuthUser } from '@/lib/firebase/config'
import {
  inspectDashboardDemoSeed,
  seedDashboardDemoForUser,
  type DemoSeedInspection,
} from '@/lib/dashboard/demoSeedClient'

export default function DashboardDemoSeedPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [summary, setSummary] = useState<DemoSeedInspection | null>(null)

  useEffect(() => {
    let active = true

    const run = async () => {
      try {
        const currentUser = await waitForAuthUser()
        if (!active) return
        if (!currentUser) {
          router.replace('/login?redirect=/dashboard/demo-seed')
          return
        }

        setUser(currentUser)
        setSummary(await inspectDashboardDemoSeed(currentUser))
      } catch (issue) {
        if (!active) return
        setError(issue instanceof Error ? issue.message : 'Unable to inspect demo seed state.')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [router])

  const isTargetAccount = useMemo(() => {
    return user?.email?.trim().toLowerCase() === 'test@test.com'
  }, [user?.email])

  const handleSeed = async () => {
    if (!user || seeding) return

    setSeeding(true)
    setError('')
    setSuccess('')

    try {
      const result = await seedDashboardDemoForUser(user, { goalTargetCases: 50 })
      setSummary(result)
      setSuccess(
        `Demo dashboard history seeded into ${result.userEmail ?? user.uid}. ${result.plannedEvaluationWrites} evaluation records and ${result.plannedSessionWrites} session records are now attached to this account.`
      )
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to seed demo history into this account.')
    } finally {
      setSeeding(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fff8f0] text-[#5C4033] flex items-center justify-center">
        Preparing demo account tools...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fff8f0] text-[#5C4033]">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-[#5C4033]/10 bg-[rgba(255,248,240,0.82)] px-8 py-10 shadow-[0_20px_80px_rgba(92,64,51,0.08)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/dashboard"
              className="text-[11px] uppercase tracking-[0.2em] text-[#3D5A35] transition hover:text-[#2f4a29]"
            >
              Back To Dashboard
            </Link>
            <span className="rounded-full border border-[#3D5A35]/15 bg-[#3D5A35]/6 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#3D5A35]">
              Hidden Tool
            </span>
          </div>

          <div className="mt-8">
            <p className="text-[10px] uppercase tracking-[0.26em] text-[#3D5A35]">Dashboard Demo Seed</p>
            <h1
              style={{ fontFamily: "'Newsreader', serif" }}
              className="mt-3 text-5xl font-light leading-none text-[#453a2a]"
            >
              Seed A Demo Persona
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#5C4033]/72">
              This tool writes the tailored mock dashboard journey into the currently signed-in Firebase account as real
              evaluation and session records. It only affects the account shown below.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#5C4033]/10 bg-white/55 p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#5C4033]/45">Signed In Account</p>
              <p className="mt-3 text-sm font-semibold text-[#3B2F2F]">{user?.email ?? user?.uid ?? 'Unknown user'}</p>
              <p className="mt-2 text-xs leading-6 text-[#5C4033]/62">
                {isTargetAccount
                  ? 'This matches the requested demo account.'
                  : 'This does not match test@test.com. Sign into the target account before running the seed.'}
              </p>
            </div>

            <div className="rounded-2xl border border-[#5C4033]/10 bg-white/55 p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#5C4033]/45">Planned Import</p>
              <p className="mt-3 text-sm font-semibold text-[#3B2F2F]">
                {summary?.plannedEvaluationWrites ?? 45} evaluations · {summary?.plannedSessionWrites ?? 45} sessions
              </p>
              <p className="mt-2 text-xs leading-6 text-[#5C4033]/62">
                The docs are deterministic, so rerunning this updates the same demo records instead of duplicating them.
              </p>
            </div>
          </div>

          {summary ? (
            <div className="mt-6 rounded-2xl border border-[#5C4033]/10 bg-[#fffdf9] p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#5C4033]/45">Existing History For This Account</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#5C4033]/8 bg-white/65 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#5C4033]/38">All Evaluations</p>
                  <p className="mt-2 text-2xl font-semibold text-[#3B2F2F]">{summary.existingEvaluations}</p>
                </div>
                <div className="rounded-xl border border-[#5C4033]/8 bg-white/65 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#5C4033]/38">Real History</p>
                  <p className="mt-2 text-2xl font-semibold text-[#3B2F2F]">{summary.existingRealEvaluations}</p>
                </div>
                <div className="rounded-xl border border-[#5C4033]/8 bg-white/65 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#5C4033]/38">Seeded Demo Docs</p>
                  <p className="mt-2 text-2xl font-semibold text-[#3B2F2F]">{summary.existingDemoEvaluations}</p>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-6 rounded-2xl border border-[#b4543e]/18 bg-[rgba(255,244,239,0.9)] px-5 py-4 text-[13px] leading-6 text-[#92400e]">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mt-6 rounded-2xl border border-[#3D5A35]/18 bg-[#f7fbf5] px-5 py-4 text-[13px] leading-6 text-[#35512f]">
              {success}
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSeed}
              disabled={!user || !isTargetAccount || seeding}
              className="rounded-full bg-[#3D5A35] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fff8f0] transition hover:bg-[#31492c] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {seeding ? 'Seeding Demo History...' : 'Seed Demo History'}
            </button>

            <Link
              href="/dashboard"
              className="rounded-full border border-[#5C4033]/14 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/72 transition hover:border-[#5C4033]/28 hover:text-[#3B2F2F]"
            >
              Open Dashboard
            </Link>
          </div>

          <p className="mt-6 text-xs leading-6 text-[#5C4033]/55">
            This page is intentionally unlinked. Use it only while signed in as the account that should receive the demo persona.
          </p>
        </div>
      </main>
    </div>
  )
}

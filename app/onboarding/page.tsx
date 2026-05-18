'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, waitForAuthUser } from '@/lib/firebase/config'

function OnboardingForm() {
  const [fullName, setFullName] = useState('')
  const [university, setUniversity] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [uid, setUid] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedRedirect = searchParams.get('redirect')
  const redirectTarget = requestedRedirect && requestedRedirect.startsWith('/') ? requestedRedirect : '/welcome'

  useEffect(() => {
    const checkUser = async () => {
      const user = await waitForAuthUser()
      if (!user) {
        router.push('/login')
        return
      }

      const profileSnapshot = await getDoc(doc(db, 'profiles', user.uid))
      if (profileSnapshot.exists()) {
        const profileData = profileSnapshot.data()
        const existingName = typeof profileData?.fullName === 'string' ? profileData.fullName : ''
        const existingUniversity =
          typeof profileData?.university === 'string' ? profileData.university : ''

        if (existingName.trim()) setFullName(existingName)
        if (existingUniversity.trim()) setUniversity(existingUniversity)

        if (existingName.trim() && existingUniversity.trim()) {
          router.replace(redirectTarget)
          return
        }
      }

      setUid(user.uid)
      setChecking(false)
      // Trigger entrance animation on the next frame so initial render is hidden.
      window.setTimeout(() => setMounted(true), 50)
    }
    checkUser()
  }, [redirectTarget, router])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uid) return
    setLoading(true)
    setError('')

    try {
      await setDoc(
        doc(db, 'profiles', uid),
        {
          fullName,
          university,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      // Microphone permission is requested in-context later (at the lobby).
      router.push(redirectTarget)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save your profile right now.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#fff8f0] p-4"
        style={{ fontFamily: "'Work Sans', sans-serif", color: '#5C4033' }}
      >
        Preparing onboarding...
      </div>
    )
  }

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative flex min-h-screen flex-col bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        @keyframes onboarding-fade-up {
          from { opacity: 0; transform: translateY(16px); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes onboarding-title-settle {
          from { opacity: 0; transform: translateY(20px); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes onboarding-card-in {
          from { opacity: 0; transform: translateY(24px) scale(0.985); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes onboarding-glow-drift {
          0%, 100% { transform: translate(0,0) scale(1); opacity: 0.6; }
          50% { transform: translate(14px,-10px) scale(1.04); opacity: 0.78; }
        }
        .onboarding-input-shell {
          background: linear-gradient(180deg, rgba(255,249,242,0.7) 0%, rgba(247,240,231,0.6) 100%);
          border: 1px solid rgba(92,64,51,0.1);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.55);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .onboarding-input-shell:focus-within {
          background: linear-gradient(180deg, rgba(255,249,242,0.88) 0%, rgba(248,241,233,0.7) 100%);
          border-color: rgba(61,90,53,0.32);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 3px rgba(61,90,53,0.08);
        }
        .onboarding-input {
          background: transparent;
          color: #1e1b15;
        }
        .onboarding-input::placeholder { color: rgba(92,64,51,0.4); }
        .onboarding-btn-primary {
          background: linear-gradient(180deg, #3D5A35 0%, #34502d 100%);
          color: #fff8f0;
          box-shadow: 0 6px 16px rgba(61,90,53,0.18), inset 0 1px 0 rgba(255,255,255,0.18);
          transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
        }
        .onboarding-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(61,90,53,0.22), inset 0 1px 0 rgba(255,255,255,0.22);
        }
        .onboarding-btn-primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>

      {/* Ambient gradient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(61,90,53,0.08),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(92,64,51,0.08),transparent_32%),linear-gradient(180deg,#fff8f0_0%,#fbf4ea_100%)]" />
        <div
          className="absolute left-[18%] top-[22%] h-[280px] w-[280px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(61,90,53,0.07) 0%, transparent 70%)',
            animation: 'onboarding-glow-drift 14s ease-in-out infinite',
          }}
        />
        <div
          className="absolute right-[18%] bottom-[18%] h-[240px] w-[240px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(92,64,51,0.06) 0%, transparent 70%)',
            animation: 'onboarding-glow-drift 16s ease-in-out infinite reverse',
          }}
        />
      </div>

      {/* Header */}
      <header
        className="relative z-10 w-full"
        style={{
          height: '70px',
          background: 'rgba(255,248,240,0.9)',
          backdropFilter: 'blur(28px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
          borderBottom: '1px solid rgba(92,64,51,0.06)',
        }}
      >
        <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4 md:px-12">
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
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 md:px-8 md:py-14">
        <div className="w-full max-w-[920px]">
          <div className="mb-7 max-w-[640px]">
            <span
              className="text-[10px] uppercase tracking-[0.32em] text-[#3D5A35]/55 font-semibold"
              style={{
                animation: mounted ? 'onboarding-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both' : 'none',
                opacity: mounted ? undefined : 0,
              }}
            >
              Compendium X · Onboarding
            </span>
            <h1
              style={{
                fontFamily: "'Newsreader', serif",
                animation: mounted ? 'onboarding-title-settle 0.75s cubic-bezier(0.22,1,0.36,1) 0.1s both' : 'none',
                opacity: mounted ? undefined : 0,
              }}
              className="mt-3 text-4xl font-light leading-[0.96] tracking-tight text-[#453a2a] md:text-5xl"
            >
              Final step. <span className="text-[#3D5A35]">Start practicing.</span>
            </h1>
            <p
              className="mt-4 max-w-[560px] text-[13px] leading-relaxed text-[#5c4033]/68"
              style={{
                animation: mounted ? 'onboarding-fade-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.18s both' : 'none',
                opacity: mounted ? undefined : 0,
              }}
            >
              Add your name and college so your dashboard and feedback history stay personalized. You can change either later from your profile.
            </p>
          </div>

          <section
            className="rounded-2xl border border-[#b48a57]/16 bg-[rgba(255,248,240,0.72)] px-6 py-7 backdrop-blur md:px-9 md:py-9"
            style={{
              animation: mounted ? 'onboarding-card-in 0.65s cubic-bezier(0.22,1,0.36,1) 0.22s both' : 'none',
              opacity: mounted ? undefined : 0,
              boxShadow: '0 6px 22px rgba(59,47,47,0.04)',
            }}
          >
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.2em] text-[#5c4033]/70">
                  Full Name
                </label>
                <div className="onboarding-input-shell rounded-xl px-3.5 py-2.5">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="onboarding-input w-full bg-transparent text-[14px] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.2em] text-[#5c4033]/70">
                  University / College
                </label>
                <div className="onboarding-input-shell rounded-xl px-3.5 py-2.5">
                  <input
                    type="text"
                    required
                    placeholder="e.g. SRCC, FMS, IIM Ahmedabad"
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    className="onboarding-input w-full bg-transparent text-[14px] outline-none"
                  />
                </div>
              </div>

              {error ? (
                <div className="rounded-xl border border-[#92400e]/24 bg-[rgba(255,245,233,0.92)] px-3.5 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#92400e]">
                    Could not save
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#5c4033]">{error}</p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || !fullName || !university}
                className="onboarding-btn-primary w-full rounded-full px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em]"
              >
                {loading ? 'Saving...' : 'Continue'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center bg-[#fff8f0] p-4"
          style={{ fontFamily: "'Work Sans', sans-serif", color: '#5C4033' }}
        >
          Loading...
        </div>
      }
    >
      <OnboardingForm />
    </Suspense>
  )
}

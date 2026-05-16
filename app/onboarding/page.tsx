'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, waitForAuthUser } from '@/lib/firebase/config'

type OnboardingStep = 'profile' | 'permission'
type MicState = 'unknown' | 'granted' | 'denied' | 'unsupported'

function OnboardingForm() {
  const [fullName, setFullName] = useState('')
  const [university, setUniversity] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [uid, setUid] = useState<string | null>(null)
  const [step, setStep] = useState<OnboardingStep>('profile')
  const [requestingMic, setRequestingMic] = useState(false)
  const [micState, setMicState] = useState<MicState>('unknown')
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedRedirect = searchParams.get('redirect')
  const redirectTarget = requestedRedirect && requestedRedirect.startsWith('/') ? requestedRedirect : '/welcome'

  // Verify they are actually logged in before showing this page
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

        if (existingName.trim()) {
          setFullName(existingName)
        }
        if (existingUniversity.trim()) {
          setUniversity(existingUniversity)
        }
        if (existingName.trim() && existingUniversity.trim()) {
          router.replace(redirectTarget)
          return
        }
      }

      setUid(user.uid)
      setChecking(false)
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
      // Profile saved. Now ask for microphone permission so the candidate
      // workspace never has to prompt mid-session — browsers persist this
      // permission per-origin, so a single grant here covers every future
      // case recording on casecompendiumx.in.
      setStep('permission')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save your profile right now.')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestMic = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicState('unsupported')
      // Move on anyway; workspace will fall back to its own prompt.
      window.setTimeout(() => router.push(redirectTarget), 900)
      return
    }
    setRequestingMic(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Release the mic immediately — the permission is what we wanted, not the live stream.
      stream.getTracks().forEach((track) => track.stop())
      setMicState('granted')
    } catch {
      setMicState('denied')
    } finally {
      setRequestingMic(false)
    }
    // Either way, move forward after a short beat.
    window.setTimeout(() => router.push(redirectTarget), 900)
  }

  const handleSkipMic = () => router.push(redirectTarget)

  if (checking) {
    return (
      <div className="min-h-screen bg-[#020b17] text-white flex items-center justify-center">
        Preparing onboarding...
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020b17] text-white p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(245,158,11,0.18),transparent_40%),radial-gradient(circle_at_88%_18%,rgba(59,130,246,0.2),transparent_36%),linear-gradient(180deg,#020b17_0%,#041427_46%,#071b2f_100%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,#f8fafc_1px,transparent_1px),linear-gradient(to_bottom,#f8fafc_1px,transparent_1px)] [background-size:36px_36px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <aside className="hidden rounded-2xl border border-slate-700/70 bg-slate-900/60 p-8 backdrop-blur lg:block">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-200">Compendium X</p>
            <h1 className="mt-4 font-serif text-4xl leading-tight text-white">
              {step === 'profile' ? (
                <>
                  Final step.
                  <br />
                  Start practicing.
                </>
              ) : (
                <>
                  One quick mic check.
                  <br />
                  Then you&apos;re in.
                </>
              )}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-300">
              {step === 'profile'
                ? 'We only need your basic profile to personalize your dashboard and feedback history.'
                : 'Every case session records audio so AI can transcribe and analyze the interview. Granting permission now means no mid-session prompt later.'}
            </p>
            <div className="mt-8 space-y-3 text-sm text-slate-300">
              <p className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3">
                Track your case reps
              </p>
              <p className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3">
                Save detailed feedback
              </p>
              <p className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3">
                Review progress over time
              </p>
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-6 shadow-2xl backdrop-blur md:p-8">
            {step === 'profile' && (
              <>
                <h2 className="font-serif text-4xl text-white">Complete Profile</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Add your details once. You can always update them later.
                </p>

                <form onSubmit={handleSaveProfile} className="mt-6 space-y-5">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-200">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jane Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-950/70 px-3 py-3 outline-none transition focus:border-amber-300/80"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-200">University / College</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. IIMA, FMS, Harvard"
                      value={university}
                      onChange={(e) => setUniversity(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-950/70 px-3 py-3 outline-none transition focus:border-amber-300/80"
                    />
                  </div>

                  {error && (
                    <div className="rounded-md border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !fullName || !university}
                    className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? 'Saving...' : 'Continue'}
                  </button>
                </form>
              </>
            )}

            {step === 'permission' && (
              <>
                <h2 className="font-serif text-4xl text-white">Enable Microphone</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Compendium X records audio so we can generate the transcript and AI feedback after each
                  case. Allowing access now means you won&apos;t see this prompt mid-session.
                </p>

                <div className="mt-6 rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                  <p className="font-semibold text-slate-100">What this allows</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
                    <li>Audio recording only during active case sessions</li>
                    <li>Automatic AI transcription of your interview</li>
                    <li>Personalised feedback based on what you said</li>
                  </ul>
                  <p className="mt-3 text-xs text-slate-400">
                    The mic is never on outside an active session. You can revoke this anytime from your
                    browser&apos;s site settings.
                  </p>
                </div>

                {micState === 'granted' && (
                  <p className="mt-4 rounded-md border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
                    ✓ Microphone access granted. Taking you to your dashboard…
                  </p>
                )}
                {micState === 'denied' && (
                  <p className="mt-4 rounded-md border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                    Permission was blocked. You can grant access later from the address bar or your
                    browser&apos;s site settings. Continuing anyway…
                  </p>
                )}
                {micState === 'unsupported' && (
                  <p className="mt-4 rounded-md border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                    This browser doesn&apos;t expose a mic permission API. You&apos;ll be prompted when you start a
                    session. Continuing…
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleRequestMic}
                    disabled={requestingMic || micState === 'granted'}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requestingMic
                      ? 'Requesting…'
                      : micState === 'granted'
                        ? 'Granted ✓'
                        : 'Allow Microphone Access'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipMic}
                    disabled={requestingMic || micState === 'granted'}
                    className="rounded-lg border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Skip for now
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#020b17] text-white flex items-center justify-center">Loading...</div>}>
      <OnboardingForm />
    </Suspense>
  )
}

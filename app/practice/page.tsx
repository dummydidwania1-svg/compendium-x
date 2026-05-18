'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/dashboard/Navbar'
import { waitForAuthUser } from '@/lib/firebase/config'
import PlatformLoader from '@/components/PlatformLoader'

export default function PracticeModeSelection() {
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  // Set when window.open() returns null because the browser blocked the
  // interviewer popup. We hold the user on this page (no navigation) so
  // they can unblock popups and retry without losing context.
  const [popupBlocked, setPopupBlocked] = useState(false)
  // Set while we're awaiting the browser's mic permission prompt before
  // opening the interviewer popup. Shows a transient "Setting up..." state
  // on the local card so the user knows their click registered.
  const [localPreparing, setLocalPreparing] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const user = await waitForAuthUser()
      if (!user) {
        router.push('/login?redirect=/practice')
        return
      }
      setLoading(false)
      setTimeout(() => setMounted(true), 50)
    }
    checkUser()
  }, [router])

  const startRemoteSession = () => {
    const lobbyId = Math.random().toString(36).substring(7)
    router.push(`/lobby/${lobbyId}?mode=remote`)
  }

  const startLocalSession = async () => {
    if (localPreparing) return
    setLocalPreparing(true)
    setPopupBlocked(false)

    const lobbyId = Math.random().toString(36).substring(7)
    const popupHost = window as Window & {
      __compendiumInterviewerWindow?: Window | null
    }

    // CRITICAL: ask for mic permission BEFORE opening the interviewer popup
    // and navigating. In local mode the device may be handed to the
    // interviewer the moment the popup pops; the candidate must answer the
    // browser prompt while they're still in front of the screen. We don't
    // hard-block on denial — the workspace's soft-warning handles that —
    // but we put the choice in front of them at the right moment.
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      } catch {
        // User denied or no mic. Continue anyway — the workspace banner will
        // surface the consequence and let them recover via address-bar lock.
      }
    }

    const popupWidth = 800
    const popupHeight = 800
    const left = Math.max(0, window.screenX + Math.round((window.outerWidth - popupWidth) / 2))
    const top = Math.max(0, window.screenY + Math.round((window.outerHeight - popupHeight) / 2))

    if (popupHost.__compendiumInterviewerWindow && !popupHost.__compendiumInterviewerWindow.closed) {
      popupHost.__compendiumInterviewerWindow.close()
    }

    const interviewerWindow = window.open(
      `/lobby/${lobbyId}?role=interviewer&mode=local`,
      'InterviewerControl',
      `popup=yes,resizable=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    )

    if (!interviewerWindow) {
      // Browser blocked the popup. Hold the user here so they can fix it
      // and retry — navigating to the lobby anyway would strand them.
      setPopupBlocked(true)
      setLocalPreparing(false)
      return
    }

    popupHost.__compendiumInterviewerWindow = interviewerWindow
    try {
      interviewerWindow.resizeTo(popupWidth, popupHeight)
    } catch {
      // Some browsers ignore programmatic resizing.
    }
    interviewerWindow.focus()

    router.push(`/lobby/${lobbyId}?mode=local`)
  }

  if (loading) return <PlatformLoader message="Getting things ready" />

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative flex min-h-screen flex-col bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        @keyframes practice-fade-up {
          from { opacity: 0; transform: translateY(16px); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes practice-title-settle {
          from { opacity: 0; transform: translateY(20px); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes practice-card-in {
          from { opacity: 0; transform: translateY(24px) scale(0.985); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes practice-glow-drift {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.45; }
          33% { transform: translate(30px, -20px) scale(1.1); opacity: 0.55; }
          66% { transform: translate(-20px, 15px) scale(0.95); opacity: 0.4; }
        }
        .practice-mode-card {
          isolation: isolate;
          background: rgba(255,248,240,0.6);
          backdrop-filter: blur(28px) saturate(1.5);
          -webkit-backdrop-filter: blur(28px) saturate(1.5);
          border: 1px solid rgba(92,64,51,0.08);
          box-shadow: 0 4px 14px rgba(59,47,47,0.035);
          transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s ease;
          cursor: pointer;
        }
        .practice-mode-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 50px rgba(0,0,0,0.07), 0 6px 20px rgba(0,0,0,0.04);
          border-color: rgba(61,90,53,0.18);
        }
        .practice-mode-card::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #3D5A35, #695c4d);
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .practice-mode-card:hover::after {
          opacity: 1;
        }
        .practice-mode-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 999px;
          border: 1px solid rgba(61,90,53,0.07);
          background: linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(61,90,53,0.045) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.85), 0 0 0 1px rgba(61,90,53,0.025), 0 6px 16px rgba(61,90,53,0.035);
          transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease, border-color 0.35s ease;
        }
        .practice-mode-icon svg {
          opacity: 0.48;
          transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1);
        }
        .practice-mode-card:hover .practice-mode-icon {
          transform: translateY(-1px);
          border-color: rgba(61,90,53,0.11);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.88), 0 0 0 1px rgba(61,90,53,0.035), 0 10px 20px rgba(61,90,53,0.045);
        }
        .practice-mode-card:hover .practice-mode-icon svg {
          opacity: 0.58;
          transform: scale(1.03);
        }
        .practice-mode-note {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-top: 14px;
        }
        .practice-mode-note::before {
          content: '';
          width: 6px;
          height: 6px;
          margin-top: 5px;
          border-radius: 999px;
          background: rgba(61,90,53,0.22);
          box-shadow: 0 0 0 3px rgba(61,90,53,0.05);
          flex-shrink: 0;
        }
        .practice-btn {
          background: rgba(255,248,240,0.84);
          border: 1px solid rgba(61,90,53,0.16);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72), 0 1px 2px rgba(61,90,53,0.04);
          transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .practice-btn:hover {
          background: rgba(61,90,53,0.08);
          border-color: rgba(61,90,53,0.28);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 6px 14px rgba(61,90,53,0.06);
          transform: translateY(-1px);
        }
        .practice-subtle-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: rgba(61,90,53,0.5);
          transition: color 0.25s ease;
        }
        .practice-subtle-link svg {
          opacity: 0.48;
          transform: translateX(0);
          transition: transform 0.25s cubic-bezier(0.22,1,0.36,1), opacity 0.25s ease;
        }
        .practice-subtle-link:hover {
          color: rgba(61,90,53,0.68);
        }
        .practice-subtle-link:hover svg {
          opacity: 0.72;
          transform: translateX(1px);
        }
      `}</style>

      <Navbar currentPage="practice" />

      <main className="relative flex min-h-[calc(100vh-70px)] flex-1 flex-col justify-center px-4 pb-20 pt-[90px] md:px-8 md:pb-24">
        <div className="mx-auto max-w-5xl">

          {/* Header - left aligned matching repository */}
          <div className="mb-7 max-w-[760px]">
            <div
              className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[2px]"
              style={{
                animation: mounted ? 'practice-fade-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.08s both' : 'none',
                opacity: mounted ? undefined : 0,
              }}
            >
              <span className="text-[10px] uppercase tracking-[0.28em] text-[#3D5A35]">
                Session Setup
              </span>
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight uppercase">
                Sample
              </span>
            </div>
            <h1
              style={{
                fontFamily: "'Newsreader', serif",
                animation: mounted ? 'practice-title-settle 0.75s cubic-bezier(0.22,1,0.36,1) 0.12s both' : 'none',
                opacity: mounted ? undefined : 0,
              }}
              className="text-4xl font-light leading-[0.94] tracking-tight text-[#453a2a] md:text-5xl"
            >
              Choose Practice Mode
            </h1>
            <p
              className="mt-4 max-w-[620px] pl-[2px] text-[13px] leading-relaxed text-[#5c4033]/62"
              style={{
                animation: mounted ? 'practice-fade-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.2s both' : 'none',
                opacity: mounted ? undefined : 0,
              }}
            >
              Pick how you connect with your interviewer. Both modes route into the same practice workflow.
            </p>
          </div>

          {/* Mode Cards */}
          <div className="relative grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -inset-12 -z-10">
              <div
                className="absolute top-1/2 left-1/4 w-[280px] h-[280px] rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(61,90,53,0.06) 0%, transparent 70%)',
                  animation: 'practice-glow-drift 12s ease-in-out infinite',
                }}
              />
              <div
                className="absolute top-1/3 right-1/4 w-[220px] h-[220px] rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(92,64,51,0.05) 0%, transparent 70%)',
                  animation: 'practice-glow-drift 15s ease-in-out infinite reverse',
                }}
              />
            </div>
            <div className="pointer-events-none absolute left-1/2 top-[64px] hidden h-px w-20 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#3D5A35]/12 to-transparent md:block" />
            <div className="pointer-events-none absolute left-1/2 top-[60px] hidden h-2 w-2 -translate-x-1/2 rounded-full border border-[#3D5A35]/14 bg-[#fff8f0] md:block" />

            {/* Remote */}
            <article
              className="practice-mode-card relative rounded-xl overflow-hidden"
              style={{
                animation: mounted ? 'practice-card-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s both' : 'none',
                opacity: mounted ? undefined : 0,
              }}
              onClick={startRemoteSession}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D5A35]/6">
                <div>
                  <span className="text-[9px] uppercase tracking-[0.25em] text-[#3D5A35]/50 font-semibold">01 / Remote</span>
                  <h2 style={{ fontFamily: "'Newsreader', serif" }} className="text-2xl text-[#3D5A35] leading-tight mt-0.5">
                    Remote Partner
                  </h2>
                </div>
                <div className="practice-mode-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
              </div>
              <div className="px-6 py-5">
                <p className="text-[12px] leading-relaxed text-[#434840]">
                  Share a lobby link with your interviewer. They join from their own device, no setup needed.
                </p>
                <p className="practice-mode-note text-[10px] leading-relaxed text-[#5C4033]/44">
                  Best for partners joining from separate devices.
                </p>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startRemoteSession() }}
                    className="practice-btn w-full rounded-full px-3 py-2 text-[9px] font-medium uppercase tracking-[0.16em]"
                  >
                    Create Link
                  </button>
                </div>
              </div>
            </article>

            {/* Local */}
            <article
              className="practice-mode-card relative rounded-xl overflow-hidden"
              style={{
                animation: mounted ? 'practice-card-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.25s both' : 'none',
                opacity: mounted ? undefined : 0,
              }}
              onClick={() => void startLocalSession()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D5A35]/6">
                <div>
                  <span className="text-[9px] uppercase tracking-[0.25em] text-[#3D5A35]/50 font-semibold">02 / Local</span>
                  <h2 style={{ fontFamily: "'Newsreader', serif" }} className="text-2xl text-[#3D5A35] leading-tight mt-0.5">
                    On This Device
                  </h2>
                </div>
                <div className="practice-mode-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="12" rx="2" />
                    <path d="M7 20h10M9 16v4M15 16v4" />
                  </svg>
                </div>
              </div>
              <div className="px-6 py-5">
                <p className="text-[12px] leading-relaxed text-[#434840]">
                  Interviewer controls open in a popup. Candidate stays in this tab. One laptop, both roles.
                </p>
                <p className="practice-mode-note text-[10px] leading-relaxed text-[#5C4033]/44">
                  Best for in-person reps or solo walkthroughs.
                </p>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void startLocalSession() }}
                    disabled={localPreparing}
                    className="practice-btn w-full rounded-full px-3 py-2 text-[9px] font-medium uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {localPreparing
                      ? 'Setting Up Microphone…'
                      : popupBlocked
                        ? 'Retry — Allow Popups & Try Again'
                        : 'Launch Split Screen'}
                  </button>
                </div>
                {localPreparing ? (
                  <p className="mt-3 text-[10px] leading-relaxed text-[#5c4033]/60">
                    Allow microphone in the browser prompt — the interviewer window opens once you decide.
                  </p>
                ) : null}
                {popupBlocked ? (
                  <div className="mt-3 rounded-lg border border-[#b48a57]/30 bg-[rgba(255,245,233,0.92)] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#92400e]">
                      Popup blocked
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#5c4033]">
                      Your browser blocked the interviewer popup. Click the popup-blocked icon in your
                      address bar to allow popups for this site, then click <strong className="font-semibold">Retry</strong> above.
                    </p>
                  </div>
                ) : null}
              </div>
            </article>

          </div>

          <div
            className="mt-5 flex justify-center"
            style={{
              animation: mounted ? 'practice-fade-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.34s both' : 'none',
              opacity: mounted ? undefined : 0,
            }}
          >
            <p className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[10px] tracking-[0.02em] text-[#5C4033]/34">
              <span>Prefer to preview cases first?</span>
              <span aria-hidden="true" className="text-[#5C4033]/22">
                ·
              </span>
              <Link
                href="/repository"
                className="practice-subtle-link"
              >
                <span>Browse case library</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2.5 9.5L9.5 2.5" />
                  <path d="M4.5 2.5H9.5V7.5" />
                </svg>
              </Link>
            </p>
          </div>
        </div>
      </main>

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
    </div>
  )
}

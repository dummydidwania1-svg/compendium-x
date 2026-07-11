'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const REDIRECT_DELAY_MS = 2500

/**
 * Shown when a case link is opened after the session it points to has
 * already been completed and rated — e.g. an old bookmark, a shared link,
 * or hitting Back into a finished interview. Auto-redirects home after a
 * beat; the manual link exists as an escape hatch if the timer is somehow
 * skipped (backgrounded tab, etc.), not as the primary affordance.
 */
export default function SessionEndedScreen({ destination = '/' }: { destination?: string }) {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(destination)
    }, REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [router, destination])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#fff8f0] px-6">
      <style>{`
        @keyframes ccx-ses-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ccx-ses-ring {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.06); }
        }
        .ccx-ses-card { animation: ccx-ses-in 0.36s cubic-bezier(0.22,1,0.36,1) both; }
        .ccx-ses-ring { animation: ccx-ses-ring 2s ease-in-out infinite; }
      `}</style>

      <div className="ccx-ses-card flex w-full max-w-[380px] flex-col items-center text-center">
        <div
          className="ccx-ses-ring mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ border: '1.5px solid rgba(61,90,53,0.35)', background: 'rgba(61,90,53,0.06)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#3D5A35' }}>
            check_circle
          </span>
        </div>

        <h1
          style={{ fontFamily: "'Newsreader', serif", color: '#3B2F2F' }}
          className="mb-2.5 text-[26px] font-medium leading-tight"
        >
          This Session Has Ended
        </h1>

        <p
          style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(92,64,51,0.7)' }}
          className="mb-7 text-[13.5px] leading-relaxed"
        >
          This case has already been completed and rated. Taking you home...
        </p>

        <button
          type="button"
          onClick={() => router.replace(destination)}
          style={{ fontFamily: "'Work Sans', sans-serif", color: '#3D5A35' }}
          className="text-[11px] font-semibold uppercase tracking-[0.16em] underline underline-offset-2 transition-opacity hover:opacity-70"
        >
          Home
        </button>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const check = () => setOffline(!navigator.onLine)
    check()
    window.addEventListener('online', check)
    window.addEventListener('offline', check)
    return () => {
      window.removeEventListener('online', check)
      window.removeEventListener('offline', check)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#fff8f0]"
      style={{ fontFamily: "'Work Sans', sans-serif" }}
    >
      <style>{`
        @keyframes ob-tie-swing {
          0%,100% { transform: rotate(-5deg); }
          50%      { transform: rotate(5deg); }
        }
        @keyframes ob-breathe {
          0%,100% { opacity: 0.4; }
          50%      { opacity: 0.8; }
        }
        @keyframes ob-rise {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="flex flex-col items-center gap-6 px-6"
        style={{ animation: 'ob-rise 0.5s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        {/* Tie logo */}
        <div style={{ transformOrigin: 'top center', animation: 'ob-tie-swing 2.8s cubic-bezier(0.37,0,0.63,1) infinite' }}>
          <svg viewBox="0 0 64 64" fill="none" width="34" height="34">
            <path d="M16 10h32l-8 14 5 8-13 22-13-22 5-8-8-14Z" fill="#5C4033" opacity="0.18" />
            <path
              d="M32 24 27 32h10l-5-8Z"
              fill="#3D5A35"
              style={{ animation: 'ob-breathe 2.8s ease-in-out infinite' }}
            />
          </svg>
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-2 text-center">
          <p
            className="text-[10px] uppercase tracking-[0.24em] text-[#3D5A35]"
            style={{ animation: 'ob-breathe 3.2s ease-in-out 0.4s infinite' }}
          >
            You&rsquo;re offline
          </p>
          <h2
            style={{ fontFamily: "'Newsreader', serif", fontWeight: 300 }}
            className="text-[28px] leading-snug tracking-tight text-[#3B2F2F]"
          >
            No connection right now
          </h2>
          <p className="mt-1 max-w-[300px] text-[13px] leading-relaxed text-[#5C4033]/55">
            That&rsquo;s okay — your case library is saved and ready to browse, even without wifi.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push('/repository')}
          className="mt-1 rounded-full border border-[#3D5A35]/25 bg-[#3D5A35] px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#fff8f0] transition-all hover:bg-[#4a6e40]"
        >
          Open the library
        </button>

        <p className="text-[11px] text-[#5C4033]/28">
          Practice, forum &amp; dashboard need a connection
        </p>
      </div>
    </div>
  )
}

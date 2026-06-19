'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const pathname = usePathname()

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

  // Repository handles its own offline state inline — don't cover it
  if (!offline || pathname === '/repository') return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-white"
      style={{ fontFamily: "'Work Sans', sans-serif" }}
    >
      <style>{`
        @keyframes ob-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.93); }
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo2.png"
          alt="Case CompendiumX"
          width={68}
          height={68}
          style={{
            objectFit: 'contain',
            animation: 'ob-pulse 2.4s ease-in-out infinite',
          }}
        />

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
          <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-[#5C4033]/55">
            Check your wifi or mobile data and we&apos;ll pick up right where you left off.
          </p>
        </div>

        <p className="text-[11px] text-[#5C4033]/28">
          We&apos;ll reconnect automatically once you&apos;re back online
        </p>
      </div>
    </div>
  )
}

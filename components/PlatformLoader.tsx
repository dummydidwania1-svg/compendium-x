'use client'

// Shared full-screen loading overlay used across all pages.
// Matches platform palette: cream bg, warm brown text, tie logo swing.

export default function PlatformLoader({ message = 'Getting things ready' }: { message?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#fff8f0]"
      style={{ fontFamily: "'Work Sans', sans-serif" }}
    >
      <style>{`
        @keyframes pl-tie-swing {
          0%,100% { transform: rotate(-5deg); }
          50%      { transform: rotate(5deg); }
        }
        @keyframes pl-breathe {
          0%,100% { opacity: 0.4; }
          50%      { opacity: 0.75; }
        }
      `}</style>
      <div className="flex flex-col items-center gap-5">
        <div style={{ transformOrigin: 'top center', animation: 'pl-tie-swing 2.4s cubic-bezier(0.37,0,0.63,1) infinite' }}>
          <svg viewBox="0 0 64 64" fill="none" width="30" height="30">
            <path d="M16 10h32l-8 14 5 8-13 22-13-22 5-8-8-14Z" fill="#5C4033" opacity="0.18" />
            <path d="M32 24 27 32h10l-5-8Z" fill="#3D5A35"
              style={{ animation: 'pl-breathe 2.4s ease-in-out infinite' }} />
          </svg>
        </div>
        <p style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'rgba(92,64,51,0.45)',
          letterSpacing: '0.01em',
          animation: 'pl-breathe 3s ease-in-out infinite',
        }}>
          {message}
        </p>
      </div>
    </div>
  )
}

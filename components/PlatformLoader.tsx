'use client'

export default function PlatformLoader({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#fff8f0]">
      <style>{`
        @keyframes pl-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.93); }
        }
      `}</style>
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        {/* logo.png has a real alpha channel (logo2.png's background is baked-in
            white), so it sits cleanly on any surface with no blend-mode hack. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Case CompendiumX"
          width={68}
          height={68}
          style={{
            objectFit: 'contain',
            animation: 'pl-pulse 2.4s ease-in-out infinite',
          }}
        />
        {message ? (
          <p
            className="text-[11px] uppercase tracking-[0.18em] text-[#5C4033]/55"
            style={{ fontFamily: "var(--font-work-sans), 'Work Sans', sans-serif" }}
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}

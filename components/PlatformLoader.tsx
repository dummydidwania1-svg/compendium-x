'use client'

export default function PlatformLoader({ message: _message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#fff8f0]">
      <style>{`
        @keyframes pl-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.93); }
        }
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo2.png"
        alt="Case CompendiumX"
        width={68}
        height={68}
        style={{
          objectFit: 'contain',
          mixBlendMode: 'multiply',
          animation: 'pl-pulse 2.4s ease-in-out infinite',
        }}
      />
    </div>
  )
}

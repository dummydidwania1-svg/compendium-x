'use client';

// Soft, dismissible "try a laptop for the best experience" toast — shown once
// per browser session on pages that are still perfectly usable on a phone
// (landing, case preview). NOT a block: unlike MobileBlockModal it never
// prevents interaction with the page underneath.
//
// Deliberately does NOT reuse LobbyOverlay's header-relative positioning
// (`document.querySelector('header')`) — neither the landing page nor the
// case-preview page render a semantic <header> element, so that measurement
// would silently fall through to an arbitrary default. This is bottom-fixed
// instead, which needs no knowledge of the page it's dropped into.
export default function MobileSoftNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        transform: 'translateX(-50%)',
        zIndex: 9997,
        width: 'min(360px, calc(100vw - 32px))',
        borderRadius: '14px',
        border: '1px solid rgba(61,90,53,0.18)',
        background: 'rgba(255,248,240,0.97)',
        backdropFilter: 'blur(20px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
        boxShadow: '0 12px 32px rgba(59,47,47,0.16), 0 2px 8px rgba(59,47,47,0.06)',
        fontFamily: "var(--font-work-sans), 'Work Sans', sans-serif",
        animation: 'msn-in 0.4s cubic-bezier(0.22,1,0.36,1) both',
      }}
    >
      <style>{`
        @keyframes msn-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .msn-row { animation: none !important; } }
      `}</style>
      <div className="msn-row" style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '13px 14px' }}>
        <span
          style={{
            flexShrink: 0, width: '26px', height: '26px', borderRadius: '999px',
            background: 'rgba(61,90,53,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: '1px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="13" rx="2" />
            <path d="M6 20h12M9 17v3M15 17v3" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 2px', fontSize: '12.5px', fontWeight: 600, color: '#3B2F2F', lineHeight: 1.35 }}>
            Best on a bigger screen
          </p>
          <p style={{ margin: 0, fontSize: '11.5px', color: 'rgba(92,64,51,0.68)', lineHeight: 1.5 }}>
            This site isn&apos;t optimized for phones yet. For the smoothest experience, try a laptop or desktop.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0, width: '22px', height: '22px', borderRadius: '999px',
            background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(92,64,51,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

'use client';

// Shown whenever "Do a Case" is about to activate on a phone. Same Device
// mode needs a split-screen popup window and Remote mode needs a dense
// multi-panel workspace (live transcript, framework tree, recording
// controls) — neither fits a phone screen, so we block the flow outright,
// before any mic prompt or popup attempt, rather than let someone get
// halfway into a layout that doesn't work.
export default function MobileBlockModal({
  onDismiss,
  closeTabOnDismiss,
}: {
  onDismiss: () => void;
  // True for the raw shared-link path — there's no page to go back to, so
  // the friendliest move is to close the tab itself.
  closeTabOnDismiss?: boolean;
}) {
  const handleDismiss = () => {
    onDismiss();
    if (closeTabOnDismiss) {
      // Browsers only let a script close a tab it opened itself (or one with
      // no navigation history) — this silently no-ops otherwise, with no
      // error or return value to detect. If close() worked, this tab is
      // gone and nothing below ever runs; if it didn't, send them home
      // immediately instead of leaving them stranded on a dead link.
      window.close();
      window.location.replace('/');
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Work Sans', sans-serif",
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(69,58,42,0.10)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          animation: 'mbb-scrim-in 0.4s ease forwards',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mbb-title"
        style={{
          position: 'relative', zIndex: 1,
          width: 'min(360px, calc(100vw - 48px))',
          borderRadius: '18px',
          border: '1px solid rgba(180,138,87,0.28)',
          background: 'rgba(255,248,240,0.94)',
          backdropFilter: 'blur(48px) saturate(2.2) brightness(1.04)',
          WebkitBackdropFilter: 'blur(48px) saturate(2.2) brightness(1.04)',
          boxShadow: '0 12px 48px rgba(59,47,47,0.16), 0 2px 8px rgba(59,47,47,0.07), inset 0 1px 0 rgba(255,255,255,0.82)',
          overflow: 'hidden',
          animation: 'mbb-card-in 0.38s cubic-bezier(0.22,1,0.36,1) forwards',
        }}
      >
        <div style={{ height: '2px', background: 'linear-gradient(90deg, #92400e 0%, rgba(146,64,14,0.12) 100%)' }} />
        <div style={{ padding: '24px 22px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div
              style={{
                width: '34px', height: '34px', flexShrink: 0, borderRadius: '999px',
                background: 'rgba(146,64,14,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'mbb-icon-breathe 3s ease-in-out infinite',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="2" width="10" height="20" rx="2" />
                <line x1="11" y1="18" x2="13" y2="18" />
                <line x1="2" y1="2" x2="22" y2="22" stroke="#92400e" />
              </svg>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <p id="mbb-title" style={{ fontSize: '14px', fontWeight: 600, color: '#3B2F2F', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
                Built for bigger screens
              </p>
              <p style={{ fontSize: '12px', color: 'rgba(92,64,51,0.68)', lineHeight: 1.55 }}>
                Case sessions run a split-screen interviewer view, live transcript,
                and recording controls side by side. None of that fits on a phone.
                Grab a laptop or desktop and you&apos;ll be good to go.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleDismiss}
              style={{
                fontSize: '11px', fontWeight: 600, letterSpacing: '0.02em',
                color: '#92400e',
                border: '1px solid rgba(146,64,14,0.22)',
                background: 'rgba(146,64,14,0.06)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
                borderRadius: '999px', padding: '7px 16px', cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes mbb-scrim-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes mbb-card-in { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes mbb-icon-breathe { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.08) } }
      `}</style>
    </div>
  );
}

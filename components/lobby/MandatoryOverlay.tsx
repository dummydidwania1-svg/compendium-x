'use client'

/**
 * MandatoryOverlay — full-screen, centered, non-dismissible overlay with NO
 * countdown. Same visual family as MandatoryTimedOverlay (blurred scrim +
 * rounded cream card, zIndex 9999), for moments that must stay up until the
 * user takes the one explicit action offered — there is no auto-expire and
 * no dismiss path, unlike MandatoryTimedOverlay (which always drains a timer)
 * or LobbyOverlay (which is always dismissible and sits at a much lower
 * z-index, so it would render invisibly underneath this one if both were
 * ever shown at once).
 */

export interface MandatoryOverlayProps {
  title: string
  body: string
  primaryLabel: string
  onPrimary: () => void
}

export function MandatoryOverlay({ title, body, primaryLabel, onPrimary }: MandatoryOverlayProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Work Sans', sans-serif" }}>
      {/* Scrim — no onClick. Not dismissible. */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(36,26,16,0.48)', backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', animation: 'mo-scrim-in 0.3s ease forwards' }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{ position: 'relative', zIndex: 1, width: 'min(420px, calc(100vw - 32px))', borderRadius: '22px', border: '1px solid rgba(61,90,53,0.18)', background: 'rgba(255,250,243,0.96)', backdropFilter: 'blur(40px) saturate(1.9)', WebkitBackdropFilter: 'blur(40px) saturate(1.9)', boxShadow: '0 12px 48px rgba(36,26,16,0.18), 0 2px 8px rgba(36,26,16,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', overflow: 'hidden', animation: 'mo-card-in 0.32s cubic-bezier(0.22,1,0.36,1) forwards' }}
      >
        <div style={{ padding: '20px 22px 22px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#2e2318', lineHeight: 1.3 }}>
            {title}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(92,64,51,0.62)', lineHeight: 1.6 }}>
            {body}
          </p>

          <div style={{ marginTop: '18px' }}>
            <button
              type="button"
              onClick={onPrimary}
              className="mo-btn mo-btn-primary"
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes mo-scrim-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes mo-card-in { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        .mo-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 9px 16px; font-size: 12px; font-weight: 600; letter-spacing: 0.01em; cursor: pointer; transition: opacity 0.15s ease; box-shadow: inset 0 1px 0 rgba(255,255,255,0.6); }
        .mo-btn:hover { opacity: 0.85; }
        .mo-btn-primary { color: #fff8f0; background: #3D5A35; border: 1px solid rgba(61,90,53,0.4); }
      `}</style>
    </div>
  )
}

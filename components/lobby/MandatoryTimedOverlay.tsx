'use client'

/**
 * MandatoryTimedOverlay — full-screen, centered, non-dismissible overlay with
 * a countdown running along the card's top accent bar. Visual family matches
 * showEvalOverlay / InterviewerMicGate (blurred scrim + rounded cream card),
 * not the small corner LobbyOverlay toast.
 *
 * Deliberately exposes no onDismiss, no scrim onClick, and no Escape handling
 * — there is no prop surface that could make this dismissible by accident.
 * The only ways out are the explicit CTA buttons (if provided) or onExpire
 * firing automatically once durationMs elapses.
 */

import { useEffect } from 'react'

export interface MandatoryTimedOverlayProps {
  /** Total duration in ms the top accent bar drains over before onExpire fires. */
  durationMs: number
  /** Called exactly once when durationMs elapses. */
  onExpire: () => void
  title: string
  body: string
  primaryLabel?: string
  onPrimary?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}

export function MandatoryTimedOverlay({
  durationMs,
  onExpire,
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: MandatoryTimedOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(onExpire, durationMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "var(--font-work-sans), 'Work Sans', sans-serif" }}>
      {/* Scrim — no onClick. Not dismissible. */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(36,26,16,0.48)', backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', animation: 'mto-scrim-in 0.3s ease forwards' }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{ position: 'relative', zIndex: 1, width: 'min(420px, calc(100vw - 32px))', borderRadius: '22px', border: '1px solid rgba(61,90,53,0.18)', background: 'rgba(255,250,243,0.96)', backdropFilter: 'blur(40px) saturate(1.9)', WebkitBackdropFilter: 'blur(40px) saturate(1.9)', boxShadow: '0 12px 48px rgba(36,26,16,0.18), 0 2px 8px rgba(36,26,16,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', overflow: 'hidden', animation: 'mto-card-in 0.32s cubic-bezier(0.22,1,0.36,1) forwards' }}
      >
        {/* Top accent bar — doubles as the countdown */}
        <div style={{ height: '3px', background: 'rgba(61,90,53,0.12)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #3D5A35 0%, rgba(61,90,53,0.6) 100%)',
              animation: `mto-progress ${durationMs}ms linear forwards`,
            }}
          />
        </div>

        <div style={{ padding: '20px 22px 22px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#2e2318', lineHeight: 1.3 }}>
            {title}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(92,64,51,0.62)', lineHeight: 1.6 }}>
            {body}
          </p>

          {(primaryLabel && onPrimary) || (secondaryLabel && onSecondary) ? (
            <div style={{ marginTop: '18px', display: 'flex', gap: '8px' }}>
              {secondaryLabel && onSecondary ? (
                <button
                  type="button"
                  onClick={onSecondary}
                  className="mto-btn mto-btn-secondary"
                >
                  {secondaryLabel}
                </button>
              ) : null}
              {primaryLabel && onPrimary ? (
                <button
                  type="button"
                  onClick={onPrimary}
                  className="mto-btn mto-btn-primary"
                >
                  {primaryLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes mto-scrim-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes mto-card-in { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes mto-progress { from { width: 100%; } to { width: 0%; } }
        .mto-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 9px 16px; font-size: 12px; font-weight: 600; letter-spacing: 0.01em; cursor: pointer; transition: opacity 0.15s ease; box-shadow: inset 0 1px 0 rgba(255,255,255,0.6); }
        .mto-btn:hover { opacity: 0.85; }
        .mto-btn-primary { color: #fff8f0; background: #3D5A35; border: 1px solid rgba(61,90,53,0.4); }
        .mto-btn-secondary { color: rgba(92,64,51,0.7); background: rgba(92,64,51,0.05); border: 1px solid rgba(92,64,51,0.18); }
      `}</style>
    </div>
  )
}

'use client'

/**
 * LobbyOverlay — bottom-right glass toast for candidate lobby status.
 *
 * - 'info'    : auto-dismisses after autoDismissMs (default 3500). No scrim.
 * - 'action'  : stays until dismissed or actionLabel clicked. Dims + blurs bg scrim.
 * - 'warning' : same as action but uses amber icon tint.
 * - 'error'   : same as action but uses red/rust icon tint.
 *
 * Animates in via lo-slide-in, out via lo-slide-out (defined in globals.css).
 * A thin progress bar at the card bottom shows auto-dismiss countdown for 'info'.
 * Background title pulse is handled externally by the parent.
 */

import { useEffect, useRef, useState, useCallback } from 'react'

export type OverlayType = 'info' | 'action' | 'warning' | 'error'

export interface LobbyOverlayProps {
  type: OverlayType
  icon: React.ReactNode
  title: string
  body?: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  autoDismissMs?: number
}

export function LobbyOverlay({
  type,
  icon,
  title,
  body,
  actionLabel,
  onAction,
  onDismiss,
  autoDismissMs = 3500,
}: LobbyOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [topOffset, setTopOffset] = useState(82)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Measure the header height dynamically so positioning survives zoom + resize
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('header')
      if (!header) return
      const { height } = header.getBoundingClientRect()
      // 12px gap below navbar
      setTopOffset(height + 12)
    }
    measure()
    const ro = new ResizeObserver(measure)
    const header = document.querySelector('header')
    if (header) ro.observe(header)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const dismiss = useCallback(() => {
    if (leaving) return
    setLeaving(true)
    timerRef.current && clearTimeout(timerRef.current)
    setTimeout(() => onDismiss(), 280)
  }, [leaving, onDismiss])

  // Slide in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Auto-dismiss for info type
  useEffect(() => {
    if (type !== 'info') return
    timerRef.current = setTimeout(dismiss, autoDismissMs)
    return () => { timerRef.current && clearTimeout(timerRef.current) }
  }, [type, autoDismissMs, dismiss])

  const needsScrim = type === 'action' || type === 'warning' || type === 'error'

  const iconColor =
    type === 'info'    ? '#3D5A35' :
    type === 'action'  ? '#3D5A35' :
    type === 'warning' ? '#92400e' :
                         '#7f1d1d'

  const accentBorder =
    type === 'info'    ? 'rgba(61,90,53,0.18)' :
    type === 'action'  ? 'rgba(61,90,53,0.18)' :
    type === 'warning' ? 'rgba(180,138,87,0.28)' :
                         'rgba(127,29,29,0.22)'

  const progressColor =
    type === 'info' ? 'rgba(61,90,53,0.35)' : 'transparent'

  return (
    <>
      {/* Scrim — only for mandatory states */}
      {needsScrim && (
        <div
          className="fixed inset-0 z-[190]"
          style={{
            background: 'rgba(69,58,42,0.08)',
            backdropFilter: 'blur(2.5px)',
            WebkitBackdropFilter: 'blur(2.5px)',
            animation: leaving
              ? 'lo-scrim-out 0.28s ease forwards'
              : 'lo-scrim-in 0.4s ease forwards',
          }}
        />
      )}

      {/* Toast card — sits above the footer (~136px from bottom) */}
      <div
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="fixed z-[200] flex flex-col overflow-hidden"
        style={{
          top: `${topOffset}px`,
          right: 'clamp(12px, 3vw, 24px)',
          width: 'min(256px, calc(100vw - clamp(24px, 6vw, 48px)))',
          borderRadius: '16px',
          border: `1px solid ${accentBorder}`,
          background: 'rgba(255,248,240,0.62)',
          backdropFilter: 'blur(48px) saturate(2.2) brightness(1.04)',
          WebkitBackdropFilter: 'blur(48px) saturate(2.2) brightness(1.04)',
          boxShadow: '0 4px 24px rgba(196,168,130,0.18), 0 1px 4px rgba(59,47,47,0.06), inset 0 1px 0 rgba(255,255,255,0.82), inset 0 0 0 0.5px rgba(255,248,240,0.6)',
          fontFamily: "'Work Sans', sans-serif",
          opacity: visible ? 1 : 0,
          animation: leaving
            ? 'lo-slide-out 0.28s cubic-bezier(0.4,0,1,1) forwards'
            : 'lo-slide-in 0.38s cubic-bezier(0.22,1,0.36,1) forwards',
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            height: '2px',
            background: type === 'info' || type === 'action'
              ? 'linear-gradient(90deg, #3D5A35 0%, rgba(61,90,53,0.12) 100%)'
              : type === 'warning'
                ? 'linear-gradient(90deg, #92400e 0%, rgba(146,64,14,0.12) 100%)'
                : 'linear-gradient(90deg, #7f1d1d 0%, rgba(127,29,29,0.12) 100%)',
          }}
        />

        <div className="flex flex-col gap-0 px-3.5 pt-3.5 pb-3">
          {/* Header row: icon + title + dismiss */}
          <div className="flex items-start gap-3">
            {/* Icon container */}
            <div
              className="mt-[1px] flex shrink-0 items-center justify-center rounded-full"
              style={{
                width: '26px',
                height: '26px',
                background: type === 'info' || type === 'action'
                  ? 'rgba(61,90,53,0.07)'
                  : type === 'warning'
                    ? 'rgba(146,64,14,0.07)'
                    : 'rgba(127,29,29,0.07)',
                animation: type === 'error'
                  ? 'lo-icon-shake 0.5s ease 0.4s both'
                  : 'lo-icon-breathe 3s ease-in-out infinite',
              }}
            >
              <span style={{ color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
              </span>
            </div>

            {/* Title + body */}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#3B2F2F',
                  lineHeight: 1.3,
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </p>
              {body ? (
                <p
                  style={{
                    fontSize: '11px',
                    color: 'rgba(92,64,51,0.62)',
                    lineHeight: 1.45,
                    fontWeight: 400,
                  }}
                >
                  {body}
                </p>
              ) : null}
            </div>

            {/* Dismiss X */}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="mt-[1px] shrink-0 rounded-full p-1 transition-all"
              style={{
                color: 'rgba(92,64,51,0.35)',
                background: 'transparent',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(92,64,51,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(92,64,51,0.7)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(92,64,51,0.35)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Action button */}
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={() => { onAction(); dismiss() }}
              className="mt-2.5 self-start rounded-full px-3 py-1 transition-all"
              style={{
                fontSize: '10.5px',
                fontWeight: 600,
                letterSpacing: '0.02em',
                color: type === 'warning' ? '#92400e' : type === 'error' ? '#7f1d1d' : '#3D5A35',
                border: type === 'warning'
                  ? '1px solid rgba(146,64,14,0.22)'
                  : type === 'error'
                    ? '1px solid rgba(127,29,29,0.22)'
                    : '1px solid rgba(61,90,53,0.22)',
                background: type === 'warning'
                  ? 'rgba(146,64,14,0.06)'
                  : type === 'error'
                    ? 'rgba(127,29,29,0.06)'
                    : 'rgba(61,90,53,0.06)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.8' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>

        {/* Auto-dismiss progress bar (info only) */}
        {type === 'info' && (
          <div
            style={{
              height: '2px',
              background: 'rgba(61,90,53,0.08)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                background: progressColor,
                animation: `lo-progress ${autoDismissMs}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>
    </>
  )
}

'use client'

import { useState, type CSSProperties } from 'react'

type PracticeFabProps = {
  /** Called when the user clicks the button. Typically routes to /practice. */
  onClick: () => void
  /** Optional extra classes for the outer wrapper. */
  className?: string
}

export default function PracticeFab({ onClick, className = '' }: PracticeFabProps) {
  const [hovered, setHovered] = useState(false)

  const rootStyle: CSSProperties = {
    position: 'fixed',
    bottom: '28px',
    right: '28px',
    zIndex: 50,
  }

  const labelStyle: CSSProperties = {
    position: 'absolute',
    bottom: 'calc(100% + 8px)',
    left: '50%',
    transform: hovered ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(3px)',
    opacity: hovered ? 0.5 : 0,
    transition: 'opacity 0.2s ease, transform 0.2s ease',
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: '#5C4033',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  }

  const pingStyle: CSSProperties = {
    position: 'absolute',
    inset: '-4px',
    borderRadius: '50%',
    border: '1.5px solid rgba(92,64,51,0.35)',
    pointerEvents: 'none',
  }

  const buttonStyle: CSSProperties = {
    position: 'relative',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: '#FFF8F0',
    border: hovered ? '1.5px solid #5C4033' : '1.5px solid rgba(92,64,51,0.25)',
    boxShadow: hovered ? '0 6px 20px rgba(92,64,51,0.25)' : '0 4px 14px rgba(92,64,51,0.18)',
    transform: hovered ? 'scale(1.04)' : 'scale(1)',
    transition: 'border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  }

  const triangleStyle: CSSProperties = {
    marginLeft: '2px',
    transform: hovered ? 'scale(1.05)' : 'scale(1)',
    transition: 'transform 220ms ease',
  }

  return (
    <div className={`practice-fab-root ${className}`} style={rootStyle}>
      <button
        type="button"
        aria-label="Practice now"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        style={buttonStyle}
      >
        <span aria-hidden="true" style={labelStyle}>Practice</span>
        {!hovered && <span aria-hidden="true" className="practice-fab-ping" style={pingStyle} />}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={triangleStyle}>
          <path d="M5 3.5L12 8L5 12.5V3.5Z" fill="#5C4033" />
        </svg>
      </button>
    </div>
  )
}

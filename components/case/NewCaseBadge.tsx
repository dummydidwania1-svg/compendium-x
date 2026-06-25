'use client'

import { slugifyCase } from '@/lib/slug'

// A case is "new" (third edition onward) iff its numeric id is >= this.
// Bump only if the edition boundary changes. Any future case with id >= 69
// gets the badge automatically; no list to maintain.
export const NEW_CASE_MIN_ID = 69

// Fallback slug set, used ONLY when a numeric id is unavailable (older docs
// or data paths that do not carry the numeric id). Safe to leave as-is.
export const NEW_CASE_SLUGS = new Set<string>([
  'schindlers-fit',
  'power-to-the-people',
  'parts-and-recreation',
  'dry-hard',
  'net-worth',
  'pound-for-pound',
  'up-in-the-air',
])

// Primary check: numeric id. Fallback: slug membership.
export function isNewCase(caseId?: number | null, fallbackKey?: string | null): boolean {
  if (typeof caseId === 'number' && Number.isFinite(caseId)) {
    return caseId >= NEW_CASE_MIN_ID
  }
  if (fallbackKey) {
    return NEW_CASE_SLUGS.has(slugifyCase(fallbackKey))
  }
  return false
}

type NewCaseBadgeProps = {
  // Preferred: the numeric case id (>= 69 gets the badge).
  caseId?: number | null
  // Optional fallback: case title or slug, used only if caseId is missing.
  caseKey?: string | null
  // 'sm' for repo rows/cards, 'md' for the case hero.
  size?: 'sm' | 'md'
  className?: string
}

export default function NewCaseBadge({ caseId, caseKey, size = 'sm', className = '' }: NewCaseBadgeProps) {
  if (!isNewCase(caseId, caseKey)) return null

  // Bigger than before so the inner disc has room for legible upright text.
  const dim = size === 'md' ? 38 : 22
  const fontSize = size === 'md' ? 9.4 : 6.1
  const ring = size === 'md' ? 1.6 : 1.2

  return (
    <span
      className={`ncx-new-badge ncx-new-badge-${size} ${className}`}
      role="img"
      aria-label="New case"
      title="New in this edition"
      style={{ width: dim, height: dim }}
    >
      <svg
        viewBox="0 0 40 40"
        width={dim}
        height={dim}
        aria-hidden="true"
        className="ncx-new-badge-svg"
      >
        <defs>
          <linearGradient id={`ncxNewGrad-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4C6B40" />
            <stop offset="55%" stopColor="#3D5A35" />
            <stop offset="100%" stopColor="#314A2B" />
          </linearGradient>
          {/* clip used to keep the shine glint inside the seal */}
          <clipPath id={`ncxNewClip-${size}`}>
            <path d="M20 1.5 L23.4 6.6 L29.1 4.0 L29.6 10.2 L35.8 9.6 L33.4 15.4 L38.7 18.1 L34.0 22.0 L37.9 26.8 L31.9 28.3 L33.0 34.4 L27.0 32.6 L25.2 38.6 L20 35.0 L14.8 38.6 L13.0 32.6 L7.0 34.4 L8.1 28.3 L2.1 26.8 L6.0 22.0 L1.3 18.1 L6.6 15.4 L4.2 9.6 L10.4 10.2 L10.9 4.0 L16.6 6.6 Z" />
          </clipPath>
        </defs>

        {/* 12-point starburst seal (no rotation) */}
        <path
          className="ncx-new-badge-star"
          fill={`url(#ncxNewGrad-${size})`}
          stroke="#A8C49A"
          strokeWidth={ring}
          strokeLinejoin="round"
          d="M20 1.5 L23.4 6.6 L29.1 4.0 L29.6 10.2 L35.8 9.6 L33.4 15.4 L38.7 18.1 L34.0 22.0 L37.9 26.8 L31.9 28.3 L33.0 34.4 L27.0 32.6 L25.2 38.6 L20 35.0 L14.8 38.6 L13.0 32.6 L7.0 34.4 L8.1 28.3 L2.1 26.8 L6.0 22.0 L1.3 18.1 L6.6 15.4 L4.2 9.6 L10.4 10.2 L10.9 4.0 L16.6 6.6 Z"
        />

        {/* clean inner disc: gives the text a flat round field so NEW is fully legible and contained */}
        <circle cx="20" cy="20" r="11.6" fill="#2E4427" />
        <circle cx="20" cy="20" r="11.6" fill="none" stroke="#B7D0A9" strokeOpacity="0.5" strokeWidth="0.8" />

        {/* modern shine glint: a soft diagonal light band that sweeps across, clipped to the seal */}
        <g clipPath={`url(#ncxNewClip-${size})`}>
          <rect className="ncx-new-badge-glint" x="-22" y="-6" width="14" height="52" fill="rgba(255,248,240,0.35)" transform="rotate(20 20 20)" />
        </g>
      </svg>

      {/* upright, centered, never rotated */}
      <span className="ncx-new-badge-text" style={{ fontSize }}>NEW</span>
    </span>
  )
}

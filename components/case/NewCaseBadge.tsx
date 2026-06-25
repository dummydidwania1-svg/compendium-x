'use client'

import { slugifyCase } from '@/lib/slug'

// Third-edition cases (ids 69 to 75). Keyed by slug so it works on both
// the repo page (has title/slug) and the case pages (load from Firestore,
// where only title is guaranteed). Mirrors the READY_CASE_SLUGS pattern.
export const NEW_CASE_SLUGS = new Set<string>([
  'schindlers-fit',
  'power-to-the-people',
  'parts-and-recreation',
  'dry-hard',
  'net-worth',
  'pound-for-pound',
  'up-in-the-air',
])

export function isNewCase(input?: string | null): boolean {
  if (!input) return false
  const slug = slugifyCase(input)
  return NEW_CASE_SLUGS.has(slug)
}

type NewCaseBadgeProps = {
  // Pass the case title OR slug; we normalise via slugifyCase.
  caseKey?: string | null
  // 'sm' for repo rows/cards, 'md' for the case hero.
  size?: 'sm' | 'md'
  className?: string
}

export default function NewCaseBadge({ caseKey, size = 'sm', className = '' }: NewCaseBadgeProps) {
  if (!isNewCase(caseKey)) return null

  const dim = size === 'md' ? 30 : 19
  const fontSize = size === 'md' ? 8.5 : 6
  const ring = size === 'md' ? 2 : 1.4

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
            <stop offset="0%" stopColor="#6E4B33" />
            <stop offset="55%" stopColor="#5C4033" />
            <stop offset="100%" stopColor="#7A5230" />
          </linearGradient>
        </defs>
        {/* 12-point starburst seal */}
        <path
          className="ncx-new-badge-star"
          fill={`url(#ncxNewGrad-${size})`}
          stroke="#C4A882"
          strokeWidth={ring}
          strokeLinejoin="round"
          d="M20 1.5 L23.4 6.6 L29.1 4.0 L29.6 10.2 L35.8 9.6 L33.4 15.4 L38.7 18.1 L34.0 22.0 L37.9 26.8 L31.9 28.3 L33.0 34.4 L27.0 32.6 L25.2 38.6 L20 35.0 L14.8 38.6 L13.0 32.6 L7.0 34.4 L8.1 28.3 L2.1 26.8 L6.0 22.0 L1.3 18.1 L6.6 15.4 L4.2 9.6 L10.4 10.2 L10.9 4.0 L16.6 6.6 Z"
        />
        {/* subtle inner sheen sweep */}
        <circle className="ncx-new-badge-sheen" cx="20" cy="20" r="13" fill="rgba(255,248,240,0.10)" />
      </svg>
      <span className="ncx-new-badge-text" style={{ fontSize }}>NEW</span>
    </span>
  )
}

'use client'

import { slugifyCase } from '@/lib/slug'

// A case is "new" (third edition onward) iff its numeric id is >= this.
// Ids 1-87 were reshuffled by a manual reorder and no longer reflect when a
// case was added, so this threshold only governs FUTURE cases (88+). Bump
// only if the edition boundary changes.
export const NEW_CASE_MIN_ID = 88

// Explicit set of third-edition cases from the 1-87 range, since their ids
// were reassigned by the manual reorder and no longer indicate recency.
// Add future editions' ids to NEW_CASE_MIN_ID instead of growing this list.
export const NEW_CASE_SLUGS = new Set<string>([
  'critical-condition',
  'death-by-chocolate',
  'dont-sweat-it',
  'dry-hard',
  'fields-of-gold',
  'house-of-cards',
  'jab-we-met',
  'net-worth',
  'padhega-india-badhega-india',
  'panel-discussion',
  'parts-and-recreation',
  'pound-for-pound',
  'sicko-mode',
  'testing-the-waters',
  'tip-tip-barsa-paani',
  'up-in-the-air',
  'variety-is-the-spice-of-life',
  'waddle-we-eat',
  'wired-differently',
])

// Primary check: explicit slug membership (for the reshuffled 1-87 range).
// Fallback: numeric id, for future cases (88+) added after this edition.
export function isNewCase(caseId?: number | null, fallbackKey?: string | null): boolean {
  if (fallbackKey && NEW_CASE_SLUGS.has(slugifyCase(fallbackKey))) {
    return true
  }
  if (typeof caseId === 'number' && Number.isFinite(caseId)) {
    return caseId >= NEW_CASE_MIN_ID
  }
  return false
}

type NewCaseBadgeProps = {
  // Preferred: the numeric case id (>= 69 gets the badge).
  caseId?: number | null
  // Optional fallback: case title or slug, used only if caseId is missing.
  caseKey?: string | null
  // 'sm' for repo rows/cards (26px), 'md' for the case hero (38px).
  size?: 'sm' | 'md'
  className?: string
}

// 8-point soft scalloped seal in a 40x40 viewBox.
// Outer points sit on radius 18 at angles 0/45/90/...; inner valleys on
// radius 14.5 at angles 22.5/67.5/... With stroke-linejoin: round this
// reads as the soft scalloped seal silhouette from the approved mockup.
const SEAL_PATH =
  'M 38,20 L 33.40,25.55 L 32.73,32.73 L 25.55,33.40 L 20,38 ' +
  'L 14.45,33.40 L 7.27,32.73 L 6.60,25.55 L 2,20 L 6.60,14.45 ' +
  'L 7.27,7.27 L 14.45,6.60 L 20,2 L 25.55,6.60 L 32.73,7.27 ' +
  'L 33.40,14.45 Z'

export default function NewCaseBadge({
  caseId,
  caseKey,
  size = 'sm',
  className = '',
}: NewCaseBadgeProps) {
  if (!isNewCase(caseId, caseKey)) return null

  // Repository rows = 26px (bumped from 22 for better legibility).
  // Case hero = 38px (unchanged).
  const dim = size === 'md' ? 38 : 26

  return (
    <span
      className={`ncx-new-badge ncx-new-badge-${size} ${className}`}
      role="img"
      aria-label="New case"
      title="New in this edition"
    >
      <svg
        viewBox="0 0 40 40"
        width={dim}
        height={dim}
        aria-hidden="true"
        className="ncx-new-badge-svg"
      >
        <defs>
          {/* clip used to keep the shine glint inside the seal silhouette */}
          <clipPath id={`ncxNewClip-${size}`}>
            <path d={SEAL_PATH} />
          </clipPath>
        </defs>

        {/* solid forest-green seal — matches the site accent green (#3D5A35) */}
        <path
          className="ncx-new-badge-star"
          fill="#3D5A35"
          strokeLinejoin="round"
          d={SEAL_PATH}
        />

        {/* NEW wordmark — SVG-native so it scales with the badge and never spills */}
        <text
          x="20"
          y="20.5"
          fontFamily="var(--font-work-sans), 'Work Sans', system-ui, -apple-system, sans-serif"
          fontSize="11"
          fontWeight="700"
          fill="#FFFCF7"
          textAnchor="middle"
          dominantBaseline="central"
          letterSpacing="-0.3"
        >
          NEW
        </text>

        {/* modern diagonal shine band, clipped to the seal silhouette */}
        <g clipPath={`url(#ncxNewClip-${size})`}>
          <rect
            className="ncx-new-badge-glint"
            x="-22"
            y="-6"
            width="14"
            height="52"
            fill="rgba(255,248,240,0.30)"
            transform="rotate(20 20 20)"
          />
        </g>
      </svg>
    </span>
  )
}

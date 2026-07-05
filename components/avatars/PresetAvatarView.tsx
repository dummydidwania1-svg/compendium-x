'use client'

import { PRESET_AVATARS } from '@/lib/avatars'

/**
 * Renders a curated preset avatar (see lib/avatars.ts) as an inline SVG.
 * Shared by the My Account overlay and the case forum so the same chosen
 * identity shows up identically everywhere a user appears.
 */
export default function PresetAvatarView({ id, className }: { id: string; className?: string }) {
  const a = PRESET_AVATARS.find((p) => p.id === id)
  if (!a) return null
  const svgHtml = { __html: a.svg }
  return <span className={className} aria-hidden dangerouslySetInnerHTML={svgHtml} />
}

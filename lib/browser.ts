// Safari (desktop and iOS) only allows one active getUserMedia stream across
// the whole browser process, so a mic already held by e.g. a Zoom/Meet tab
// silently kills ours. Remote mode depends on a live mic the whole session,
// so we block it outright on Safari rather than fail confusingly mid-call.
export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium') && !ua.includes('Android')
}

// "Do a Case" needs a split-screen popup window (Same Device) or a dense
// multi-panel workspace with live transcription and recording controls
// (Remote) — neither fits a phone screen, so we block the flow outright
// there rather than let someone get halfway into an unusable layout.
// Tablets intentionally pass: iPadOS Safari reports a desktop-class UA by
// default, and Android tablet UAs omit the "Mobile" token phones carry
// (checked explicitly below so an Android tablet isn't caught by "Android"
// alone).
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isAndroidPhone = /Android/i.test(ua) && /Mobile/i.test(ua)
  return isAndroidPhone || /iPhone|iPod|Windows Phone|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

// Shared sessionStorage key for the soft "try a laptop for the best
// experience" notice shown on mobile for pages that are still usable there
// (landing, case preview) — as opposed to MobileBlockModal, which hard-blocks
// pages that genuinely don't work on a phone (Do a Case, live sessions). One
// shared key across every page that shows this notice, so a visitor sees it
// once per browser session rather than once per page they happen to land on.
export const MOBILE_NOTICE_SEEN_KEY = 'compendium-mobile-notice-seen'

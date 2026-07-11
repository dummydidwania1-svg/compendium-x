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

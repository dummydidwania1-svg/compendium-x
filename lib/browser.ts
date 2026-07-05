// Safari (desktop and iOS) only allows one active getUserMedia stream across
// the whole browser process, so a mic already held by e.g. a Zoom/Meet tab
// silently kills ours. Remote mode depends on a live mic the whole session,
// so we block it outright on Safari rather than fail confusingly mid-call.
export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium') && !ua.includes('Android')
}

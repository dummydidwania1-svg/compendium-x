'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/* "How to use" demo videos. Replace these TODO placeholders with the real
   MP4 URLs (Firebase Storage or /public) — the only follow-up left. The player
   renders the poster beacon and never crashes while these are empty. */
const HOW_TO_USE_VIDEOS: Record<'local' | 'remote', string> = {
  local: '', // TODO_SAME_DEVICE_MP4_URL — "Same Device" demo
  remote: '', // TODO_REMOTE_PARTNER_MP4_URL — "Remote Partner" demo
}

const PR_SPEEDS = [1, 1.25, 1.5, 2] as const
const PR_MODE_NAMES: Record<'local' | 'remote', string> = {
  local: 'Same Device',
  remote: 'Remote Partner',
}

type PrMode = 'local' | 'remote'
type PrPhase = 'poster' | 'playing' | 'paused' | 'ended'

const prFmtTime = (s: number): string => {
  const t = Math.max(0, Math.floor(s || 0))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/* ═══════════════════════════════════════════════════
   THE PROJECTION ROOM — "How to use" video overlay
   Render this component as a sibling of the page root, NOT inside any
   container that applies a global `border-radius: 0 !important` reset
   (the landing page's `.ccx-page` does exactly that) — otherwise the
   switcher pills, control pill and beacon would be clipped square. The
   practice page uses rounded-* freely and has no such reset.
   ═══════════════════════════════════════════════════ */
const OVERLAY_CSS = `
.pr-overlay {
  position: fixed; inset: 0; z-index: 99998;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(28,24,18,.58);
  backdrop-filter: blur(0px) saturate(1);
  -webkit-backdrop-filter: blur(0px) saturate(1);
  opacity: 0; pointer-events: none;
  transition: opacity .45s ease, backdrop-filter .55s ease, -webkit-backdrop-filter .55s ease;
}
.pr-overlay.open {
  opacity: 1; pointer-events: all;
  backdrop-filter: blur(22px) saturate(.72);
  -webkit-backdrop-filter: blur(22px) saturate(.72);
}

/* chrome above the stage */
.pr-chrome {
  text-align: center; margin-bottom: 22px; opacity: 0; transform: translateY(14px);
  transition: opacity .5s cubic-bezier(.22,1,.36,1) .12s, transform .5s cubic-bezier(.22,1,.36,1) .12s;
}
.pr-overlay.open .pr-chrome { opacity: 1; transform: translateY(0); }
.pr-title {
  font-family: 'Newsreader', serif; font-style: italic; font-weight: 400; font-size: 14px;
  color: rgba(255,248,240,.6); margin-bottom: 14px; letter-spacing: .01em;
}

/* segmented switcher */
.pr-switch {
  position: relative; display: inline-flex; padding: 4px; border-radius: 999px;
  background: rgba(255,248,240,.08); border: 1px solid rgba(255,248,240,.14);
}
.pr-switch-ind {
  position: absolute; top: 4px; bottom: 4px; border-radius: 999px; background: #fff8f0;
  transition: left .38s cubic-bezier(.22,1,.36,1), width .38s cubic-bezier(.22,1,.36,1);
  box-shadow: 0 2px 10px rgba(0,0,0,.18);
}
.pr-switch-btn {
  position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 20px; border: none; background: none; border-radius: 999px; cursor: pointer;
  font-family: 'Work Sans', sans-serif; font-size: 11px; font-weight: 600;
  letter-spacing: .14em; text-transform: uppercase;
  color: rgba(255,248,240,.72); transition: color .3s ease;
}
.pr-switch-btn svg { transition: stroke .3s ease; }
.pr-switch-btn.active { color: #3B2F2F; }

/* stage */
.pr-stage {
  position: relative; width: min(920px, 92vw);
  opacity: 0; transform: translateY(24px) scale(.975);
  transition: opacity .55s cubic-bezier(.22,1,.36,1) .05s, transform .55s cubic-bezier(.22,1,.36,1) .05s;
}
.pr-overlay.open .pr-stage { opacity: 1; transform: translateY(0) scale(1); }
.pr-canvas {
  position: relative; aspect-ratio: 16 / 9; background: #14110d;
  border: 1px solid rgba(255,248,240,.14); border-radius: 0;
  box-shadow: 0 40px 110px rgba(0,0,0,.5), 0 12px 32px rgba(0,0,0,.28);
  overflow: hidden;
}
.pr-canvas:fullscreen {
  width: 100vw; height: 100vh; aspect-ratio: auto; border: none;
}
.pr-canvas:fullscreen .pr-video-wrap video { object-fit: contain; }
.pr-video-wrap { position: absolute; inset: 0; transition: opacity .32s ease, transform .32s cubic-bezier(.22,1,.36,1); }
.pr-video-wrap.switching-out { opacity: 0; transform: translateX(-12px); }
.pr-video-wrap.switching-in { opacity: 0; transform: translateX(12px); transition: none; }
.pr-video-wrap video { width: 100%; height: 100%; display: block; object-fit: cover; background: #14110d; }

/* close */
.pr-close {
  position: absolute; top: -18px; right: -18px; width: 44px; height: 44px; border-radius: 50%; z-index: 5;
  background: #fff8f0; border: 1px solid rgba(92,64,51,.15); cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: #3B2F2F;
  box-shadow: 0 8px 24px rgba(0,0,0,.25);
  transition: transform .3s cubic-bezier(.22,1,.36,1), background .2s ease;
}
.pr-close:hover { transform: rotate(90deg); background: #f4ede3; }
@media (max-width: 1020px) { .pr-close { top: -54px; right: 0; } }

/* ── play beacon (poster state) ── */
.pr-beacon {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, rgba(20,17,13,.12), rgba(20,17,13,.38));
  cursor: pointer; border: none; padding: 0; width: 100%;
  opacity: 1; transition: opacity .35s ease;
}
.pr-beacon.hidden { opacity: 0; pointer-events: none; }
.pr-beacon-btn {
  position: relative; width: 76px; height: 76px; border-radius: 50%;
  background: rgba(255,248,240,.96); display: flex; align-items: center; justify-content: center;
  color: #3B2F2F;
  animation: prBeaconBreathe 2.6s ease-in-out infinite;
  transition: transform .3s cubic-bezier(.22,1,.36,1);
}
.pr-beacon:hover .pr-beacon-btn { transform: scale(1.07); animation-play-state: paused; }
.pr-beacon-btn::before, .pr-beacon-btn::after {
  content: ''; position: absolute; inset: 0; border-radius: 50%;
  border: 1px solid rgba(255,248,240,.55);
  animation: prBeaconRipple 2.6s cubic-bezier(.22,1,.36,1) infinite;
}
.pr-beacon-btn::after { animation-delay: 1.3s; }
@keyframes prBeaconBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
@keyframes prBeaconRipple {
  0% { transform: scale(1); opacity: .8; }
  100% { transform: scale(1.85); opacity: 0; }
}
.pr-beacon-btn svg { margin-left: 4px; }

/* ── control pill ── */
.pr-controls {
  position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%) translateY(0);
  display: flex; align-items: center; gap: 14px;
  width: min(640px, calc(100% - 40px)); padding: 10px 16px; border-radius: 999px;
  background: rgba(255,248,240,.88);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(61,90,53,.10);
  box-shadow: 0 4px 12px rgba(59,47,47,.10);
  opacity: 1; transition: opacity .35s ease, transform .35s cubic-bezier(.22,1,.36,1);
}
.pr-controls.hidden { opacity: 0; transform: translateX(-50%) translateY(8px); pointer-events: none; }
.pr-ctl-btn {
  background: none; border: none; cursor: pointer; color: #3B2F2F;
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; flex-shrink: 0; transition: background .2s ease;
}
.pr-ctl-btn:hover { background: rgba(92,64,51,.08); }
.pr-time { font-size: 11px; font-weight: 500; color: #5C4033; font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
.pr-time .total { color: rgba(92,64,51,.5); }

.pr-scrub { position: relative; flex: 1; height: 20px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.pr-scrub-track { position: relative; width: 100%; height: 2px; border-radius: 2px; background: rgba(92,64,51,.18); transition: height .18s ease; }
.pr-scrub:hover .pr-scrub-track { height: 5px; }
.pr-scrub-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: #5C4033; width: 0%; }
.pr-scrub-head {
  position: absolute; top: 50%; width: 9px; height: 9px; border-radius: 50%;
  background: #3D5A35; transform: translate(-50%, -50%) scale(0);
  transition: transform .18s ease; left: 0%;
}
.pr-scrub:hover .pr-scrub-head { transform: translate(-50%, -50%) scale(1); }

.pr-speed {
  background: none; border: 1px solid rgba(92,64,51,.18); border-radius: 999px;
  padding: 4px 10px; font-family: 'Work Sans', sans-serif; font-size: 10px; font-weight: 600;
  letter-spacing: .08em; color: #5C4033; cursor: pointer; flex-shrink: 0;
  font-variant-numeric: tabular-nums; transition: background .2s ease, border-color .2s ease;
  min-width: 44px;
}
.pr-speed:hover { background: rgba(92,64,51,.08); border-color: rgba(92,64,51,.32); }

/* ── end state ── */
.pr-endstate {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; background: rgba(43,35,28,.68);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  opacity: 0; pointer-events: none; transition: opacity .45s ease;
}
.pr-endstate.show { opacity: 1; pointer-events: all; }
.pr-replay {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  background: none; border: none; cursor: pointer; color: #fff8f0;
}
.pr-replay-circle {
  width: 64px; height: 64px; border-radius: 50%; border: 1px solid rgba(255,248,240,.4);
  display: flex; align-items: center; justify-content: center;
  transition: background .25s ease, transform .3s cubic-bezier(.22,1,.36,1);
}
.pr-replay:hover .pr-replay-circle { background: rgba(255,248,240,.12); transform: rotate(-45deg); }
.pr-replay-lbl { font-size: 10px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: rgba(255,248,240,.85); }
.pr-next {
  background: none; border: none; cursor: pointer;
  font-family: 'Newsreader', serif; font-style: italic; font-size: 14px;
  color: rgba(255,248,240,.55); transition: color .25s ease;
}
.pr-next:hover { color: rgba(255,248,240,.9); }

/* mobile refinements */
@media (max-width: 640px) {
  .pr-controls { gap: 10px; width: min(640px, calc(100% - 24px)); padding: 8px 12px; }
  .pr-speed { min-width: 0; padding: 4px 8px; }
}

@media (prefers-reduced-motion: reduce) {
  .pr-overlay, .pr-stage, .pr-chrome, .pr-video-wrap, .pr-controls, .pr-switch-ind,
  .pr-close, .pr-beacon, .pr-beacon-btn, .pr-endstate, .pr-replay-circle {
    transition: none !important;
  }
  .pr-beacon-btn { animation: none !important; }
  .pr-beacon-btn::before, .pr-beacon-btn::after { animation: none !important; opacity: 0 !important; }
}
`

interface HowToUseOverlayProps {
  open: boolean
  onClose: () => void
  /* When set, the overlay is single-mode: no switcher pill, no cross-mode
     nudge, and only this mode's video ever loads. When undefined, the overlay
     is the full landing-page variant (switcher + nudge). */
  lockedMode?: 'local' | 'remote'
}

export default function HowToUseOverlay({ open, onClose, lockedMode }: HowToUseOverlayProps) {
  const locked = lockedMode !== undefined

  // The switcher (unlocked variant) drives modeState; when locked, the mode is
  // pinned to lockedMode and modeState is ignored.
  const [modeState, setModeState] = useState<PrMode>('local')
  const mode: PrMode = lockedMode ?? modeState
  const [phase, setPhase] = useState<PrPhase>('poster')
  const [speedIdx, setSpeedIdx] = useState(0)
  const [muted, setMuted] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [duration, setDuration] = useState(0)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const scrubRef = useRef<HTMLDivElement | null>(null)
  const fillRef = useRef<HTMLDivElement | null>(null)
  const headRef = useRef<HTMLDivElement | null>(null)
  const curTimeRef = useRef<HTMLSpanElement | null>(null)
  const indRef = useRef<HTMLSpanElement | null>(null)
  const localBtnRef = useRef<HTMLButtonElement | null>(null)
  const remoteBtnRef = useRef<HTMLButtonElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  const hideTimerRef = useRef<number | null>(null)
  const scrubbingRef = useRef(false)
  const phaseRef = useRef<PrPhase>('poster')
  const modeRef = useRef<PrMode>(lockedMode ?? 'local')
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { modeRef.current = mode }, [mode])

  // Reset the player to a fresh poster state whenever the overlay opens in the
  // locked (single-mode) variant, so reopening a card's demo never lands on a
  // stale ended/paused frame. Render-time state adjustment (React's sanctioned
  // pattern for reacting to prop changes) — not an effect. The unlocked landing
  // overlay intentionally preserves its state across open/close.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open && locked) {
      setPhase('poster')
      setSpeedIdx(0)
      setControlsVisible(false)
    }
  }

  const armHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      if (phaseRef.current === 'playing') setControlsVisible(false)
    }, 2500)
  }, [])

  const showControls = useCallback((sticky = false) => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (!sticky && phaseRef.current === 'playing') armHide()
  }, [armHide])

  /* start playback from the poster beacon (tolerates a missing src) */
  const startPlayback = useCallback(() => {
    const v = videoRef.current
    setPhase('playing')
    showControls()
    v?.play().catch(() => {})
  }, [showControls])

  const replay = useCallback(() => {
    const v = videoRef.current
    setPhase('playing')
    if (v) { v.currentTime = 0; v.play().catch(() => {}) }
    showControls()
  }, [showControls])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (phaseRef.current === 'ended') { replay(); return }
    if (phaseRef.current === 'poster') { startPlayback(); return }
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [replay, startPlayback])

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    v.currentTime = Math.min(Math.max(v.currentTime + delta, 0), v.duration)
    showControls()
  }, [showControls])

  const seekToClientX = useCallback((clientX: number) => {
    const el = scrubRef.current
    const v = videoRef.current
    if (!el || !v || !v.duration) return
    const r = el.getBoundingClientRect()
    const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
    v.currentTime = ratio * v.duration
  }, [])

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((prev) => {
      const next = (prev + 1) % PR_SPEEDS.length
      if (videoRef.current) videoRef.current.playbackRate = PR_SPEEDS[next]
      return next
    })
  }, [])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    if (!document.fullscreenElement) c.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.()
  }, [])

  const switchMode = useCallback((next: PrMode) => {
    if (modeRef.current === next) return
    modeRef.current = next
    setModeState(next)
    const wrap = wrapRef.current
    const v = videoRef.current
    if (wrap) wrap.classList.add('switching-out')
    window.setTimeout(() => {
      if (v) {
        const url = HOW_TO_USE_VIDEOS[next]
        if (url) { v.src = url } else { v.removeAttribute('src') }
        v.playbackRate = 1
        v.load()
      }
      setSpeedIdx(0)
      setPhase('poster')
      setControlsVisible(false)
      if (wrap) {
        wrap.classList.remove('switching-out')
        wrap.classList.add('switching-in')
        requestAnimationFrame(() =>
          requestAnimationFrame(() => wrap.classList.remove('switching-in')),
        )
      }
    }, 320)
  }, [])

  const closeOverlay = useCallback(() => {
    videoRef.current?.pause()
    onClose()
  }, [onClose])

  const placeIndicator = useCallback(() => {
    const btn = mode === 'local' ? localBtnRef.current : remoteBtnRef.current
    const ind = indRef.current
    if (btn && ind) {
      ind.style.left = `${btn.offsetLeft}px`
      ind.style.width = `${btn.offsetWidth}px`
    }
  }, [mode])

  /* set the initial source once (no-op while the URL is an empty placeholder) */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const url = HOW_TO_USE_VIDEOS[modeRef.current]
    if (url) v.src = url
  }, [])

  /* Locked (single-mode) variant: load only lockedMode's video into the player
     element each time the overlay opens. DOM-only (the player state reset lives
     in the render-time adjustment above). */
  useEffect(() => {
    if (lockedMode === undefined || !open) return
    const v = videoRef.current
    if (!v) return
    const url = HOW_TO_USE_VIDEOS[lockedMode]
    if (url) { v.src = url } else { v.removeAttribute('src') }
    v.playbackRate = 1
    v.load()
  }, [lockedMode, open])

  /* video element event wiring */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => { setPhase('playing'); setControlsVisible(true); armHide() }
    const onPause = () => {
      if (v.ended || phaseRef.current !== 'playing') return
      setPhase('paused')
      setControlsVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    const onEnded = () => { setPhase('ended'); setControlsVisible(false) }
    const onLoaded = () => setDuration(v.duration || 0)
    const onTime = () => {
      if (curTimeRef.current) curTimeRef.current.textContent = prFmtTime(v.currentTime)
      const p = v.duration ? (v.currentTime / v.duration) * 100 : 0
      if (fillRef.current) fillRef.current.style.width = `${p}%`
      if (headRef.current) headRef.current.style.left = `${p}%`
    }
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)
    v.addEventListener('loadedmetadata', onLoaded)
    v.addEventListener('timeupdate', onTime)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
      v.removeEventListener('loadedmetadata', onLoaded)
      v.removeEventListener('timeupdate', onTime)
    }
  }, [armHide])

  /* position the switcher indicator on open / mode change / resize */
  useEffect(() => { placeIndicator() }, [placeIndicator, open])
  useEffect(() => {
    const onResize = () => placeIndicator()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [placeIndicator])

  /* lock body scroll (compensating scrollbar width) + move focus into the
     dialog, restoring focus to the trigger element on close */
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement as HTMLElement | null
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = document.body.style.overflow
    const prevPad = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`
    const focusTimer = window.setTimeout(() => overlayRef.current?.focus(), 60)
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPad
      clearTimeout(focusTimer)
      prevFocusRef.current?.focus?.()
    }
  }, [open])

  /* keyboard map + focus trap (active only while open) */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); return }
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Tab') {
        const root = overlayRef.current
        if (!root) return
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement
        if (e.shiftKey && (active === first || active === root)) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault(); first.focus()
        }
        return
      }
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k': e.preventDefault(); togglePlay(); break
        case 'arrowleft': seekBy(-5); break
        case 'arrowright': seekBy(5); break
        case 'm': toggleMute(); break
        case 'f': toggleFullscreen(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeOverlay, togglePlay, seekBy, toggleMute, toggleFullscreen])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: OVERLAY_CSS }} />
      <div
        ref={overlayRef}
        className={`pr-overlay${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="How to use"
        tabIndex={-1}
        onClick={(e) => { if (e.target === e.currentTarget) closeOverlay() }}
      >
        <div className="pr-chrome">
          <p className="pr-title">How to use</p>
          {!locked && (
            <div className="pr-switch" role="tablist" aria-label="Demo mode">
              <span ref={indRef} className="pr-switch-ind" aria-hidden="true" />
              <button
                ref={localBtnRef}
                className={`pr-switch-btn${mode === 'local' ? ' active' : ''}`}
                data-mode="local"
                role="tab"
                aria-selected={mode === 'local'}
                onClick={() => switchMode('local')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 20h10M9 16v4M15 16v4" /></svg>
                Same Device
              </button>
              <button
                ref={remoteBtnRef}
                className={`pr-switch-btn${mode === 'remote' ? ' active' : ''}`}
                data-mode="remote"
                role="tab"
                aria-selected={mode === 'remote'}
                onClick={() => switchMode('remote')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                Remote Partner
              </button>
            </div>
          )}
        </div>

        <div className="pr-stage">
          <button className="pr-close" onClick={closeOverlay} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>

          <div
            ref={canvasRef}
            className="pr-canvas"
            onClick={(e) => { if (e.target === canvasRef.current || e.target === wrapRef.current || (e.target as HTMLElement).tagName === 'VIDEO') togglePlay() }}
            onMouseMove={() => { if (phase === 'playing' || phase === 'paused') showControls() }}
          >
            <div ref={wrapRef} className="pr-video-wrap">
              <video ref={videoRef} preload="metadata" playsInline controlsList="nodownload" disablePictureInPicture />
            </div>

            {/* poster beacon */}
            <button
              className={`pr-beacon${phase !== 'poster' ? ' hidden' : ''}`}
              aria-label="Play video"
              tabIndex={phase === 'poster' ? 0 : -1}
              onClick={startPlayback}
            >
              <span className="pr-beacon-btn">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </button>

            {/* control pill */}
            <div className={`pr-controls${controlsVisible && (phase === 'playing' || phase === 'paused') ? '' : ' hidden'}`}>
              <button className="pr-ctl-btn" onClick={togglePlay} aria-label="Play or pause" title="Play / Pause — Space">
                {phase === 'playing'
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <span className="pr-time">
                <span ref={curTimeRef}>0:00</span>{' '}
                <span className="total">/ {prFmtTime(duration)}</span>
              </span>
              <div
                ref={scrubRef}
                className="pr-scrub"
                title="Seek — ← →"
                onPointerDown={(e) => { scrubbingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekToClientX(e.clientX) }}
                onPointerMove={(e) => { if (scrubbingRef.current) seekToClientX(e.clientX) }}
                onPointerUp={(e) => { scrubbingRef.current = false; e.currentTarget.releasePointerCapture(e.pointerId) }}
              >
                <div className="pr-scrub-track">
                  <div ref={fillRef} className="pr-scrub-fill" />
                  <div ref={headRef} className="pr-scrub-head" />
                </div>
              </div>
              <button className="pr-speed" onClick={cycleSpeed} title="Playback speed">
                {PR_SPEEDS[speedIdx]}&times;
              </button>
              <button className="pr-ctl-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title="Mute — M">
                {muted
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M22 9l-6 6M16 9l6 6" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>}
              </button>
              <button className="pr-ctl-btn" onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen — F">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
              </button>
            </div>

            {/* end state */}
            <div className={`pr-endstate${phase === 'ended' ? ' show' : ''}`}>
              <button className="pr-replay" onClick={replay} tabIndex={phase === 'ended' ? 0 : -1}>
                <span className="pr-replay-circle">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                </span>
                <span className="pr-replay-lbl">Watch again</span>
              </button>
              {!locked && (
                <button
                  className="pr-next"
                  tabIndex={phase === 'ended' ? 0 : -1}
                  onClick={() => switchMode(mode === 'local' ? 'remote' : 'local')}
                >
                  or see {PR_MODE_NAMES[mode === 'local' ? 'remote' : 'local']} &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

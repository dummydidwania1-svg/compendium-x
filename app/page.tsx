'use client'

import { useEffect, useState } from 'react'
import Navbar from '@/components/dashboard/Navbar'
import Footer from '@/components/dashboard/Footer'
import HowToUseOverlay from '@/components/HowToUseOverlay'
import MobileSoftNotice from '@/components/permissions/MobileSoftNotice'
import { isMobileDevice, MOBILE_NOTICE_SEEN_KEY } from '@/lib/browser'


const PAGE_CSS = `
/* ═══════════════════════════════════════════════════
   COLOUR TOKENS — Case CompendiumX design system
   ═══════════════════════════════════════════════════ */
:root {
  --cream:        #FFF8F0;
  --parchment:    #F4EDE3;
  --toasty:       #EEE7DD;
  --footer-bg:    #453A2A;
  --text-primary: #3B2F2F;
  --text-heading: #453A2A;
--accent:       #3D5A35;
  --muted:        #695C4D;
}


html, body { background: var(--cream) !important; color: var(--text-primary); }
body { font-family: var(--font-work-sans), 'Work Sans', sans-serif; }

/* Zero rounding everywhere on this page — design-system requirement */
.ccx-page * { border-radius: 0 !important; }

/* Landing page starts invisible so JS can fade it in as the intro lifts away.
   When JS is disabled, default to fully visible (no FOUC). */
.ccx-page {
  opacity: 0;
  transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.ccx-page.ccx-revealed { opacity: 1; }
@media (scripting: none) {
  .ccx-page { opacity: 1; transition: none; }
}

/* ─── HERO ─── */
header.ccx-hero {
  position: relative;
  min-height: calc(100vh - 70px);
  display: flex; align-items: center;
  /* overflow intentionally NOT hidden so the image panel bleeds up behind the glass navbar */
}
header.ccx-hero .hero-inner {
  position: relative;
  z-index: 10;
  width: 100%;
  padding: 0 48px 0 calc(48px + 50%);
}
header.ccx-hero h1 {
  font-family: var(--font-newsreader), 'Newsreader', serif;
  margin: 0;
}
header.ccx-hero .ctas {
  margin-top: 44px;
  display: flex; gap: 16px; flex-wrap: wrap;
}
header.ccx-hero .ctas a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 16px 32px;
  min-width: 210px;
  white-space: nowrap;
  text-align: center;
  font-family: var(--font-work-sans), 'Work Sans', sans-serif;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  text-decoration: none;
  transition: background 0.3s ease, color 0.3s ease, opacity 0.3s ease;
}
header.ccx-hero .ctas a.primary {
  background: var(--accent);
  color: #fff;
  border: 1px solid var(--accent);
}
header.ccx-hero .ctas a.primary:hover { opacity: 0.88; }
header.ccx-hero .ctas a.secondary {
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
}
header.ccx-hero .ctas a.secondary:hover { background: var(--accent); color: #fff; }

/* Word carousel — italic brown accent */
.word-carousel {
  position: relative;
  display: inline-block;
  height: 1.1em;
  min-width: 320px;
  vertical-align: top;
}
.word-carousel .word-item {
  position: absolute;
  left: 0; top: 0;
  opacity: 0;
  transform: translateY(8px);
  animation: wordCycle 9s infinite;
  white-space: nowrap;
}
.word-carousel .word-item:nth-child(1) { animation-delay: 0s; }
.word-carousel .word-item:nth-child(2) { animation-delay: 3s; }
.word-carousel .word-item:nth-child(3) { animation-delay: 6s; }
@keyframes wordCycle {
  0%, 33.33%, 100% { opacity: 0; transform: translateY(8px); }
  4%, 30%          { opacity: 1; transform: translateY(0); }
}

/* ═══════════════════════════════════════════════════
   HERO TITLE LAYOUT
   ═══════════════════════════════════════════════════ */
#ccx-edition {
  display: flex;
  align-items: center;
  gap: 14px;
  font-family: var(--font-newsreader), 'Newsreader', serif;
  font-style: italic;
  font-size: 28px;
  font-weight: 400;
  color: var(--text-heading);
  letter-spacing: -0.005em;
  margin-bottom: 18px;
}
#ccx-edition::before {
  content: '';
  display: inline-block;
  width: 24px;
  height: 1px;
  background: #6B4A1E;
  flex-shrink: 0;
}
#ccx-main-title {
  font-family: var(--font-newsreader), 'Newsreader', serif;
  font-size: 96px;
  font-weight: 400;
  color: var(--text-heading);
  line-height: 100.8px;
  margin-bottom: 6px;
  letter-spacing: -2.4px;
  cursor: default;
}
#ccx-main-title .title-nowrap { white-space: nowrap; }
#ccx-main-title .title-x {
  color: var(--accent);
  display: inline-block;
  margin-left: 3px;
  transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), color 0.8s ease;
  transform-origin: center center;
}
#ccx-main-title:hover .title-x {
  transform: scale(1.08);
}
@media (max-width: 1280px) {
  header.ccx-hero .hero-inner { padding: 0 32px 0 calc(32px + 50%); }
  #ccx-main-title { font-size: 80px; line-height: 86px; letter-spacing: -2px; }
  #ccx-edition { font-size: 24px; }
  #ccx-where-line { font-size: 30px !important; }
  #ccx-animated-line, #ccx-animated-line .word-item { font-size: 30px !important; }
}
@media (max-width: 1200px) {
  header.ccx-hero .hero-inner { padding: 0 28px 0 calc(28px + 50%); }
  #ccx-main-title { font-size: 72px; line-height: 78px; letter-spacing: -1.8px; }
  #ccx-edition { font-size: 22px; }
  #ccx-where-line { font-size: 28px !important; }
  #ccx-animated-line, #ccx-animated-line .word-item { font-size: 28px !important; }
}
@media (max-width: 1100px) {
  header.ccx-hero .hero-inner { padding: 0 24px 0 calc(24px + 50%); }
  #ccx-main-title { font-size: 64px; line-height: 70px; letter-spacing: -1.6px; }
  #ccx-edition { font-size: 20px; }
  #ccx-where-line { font-size: 26px !important; }
  #ccx-animated-line, #ccx-animated-line .word-item { font-size: 26px !important; }
  header.ccx-hero .ctas a { width: auto; min-width: 160px; padding: 14px 24px; }
}
#ccx-where-line {
  display: inline !important;
  color: var(--text-heading) !important;
  font-weight: 300 !important;
  font-style: normal !important;
  font-family: var(--font-newsreader), 'Newsreader', serif !important;
  font-size: 36px !important;
  letter-spacing: -0.6px !important;
}
#ccx-where-line::after {
  content: ' ';
}
#ccx-animated-line {
  display: inline-block !important;
  color: var(--accent) !important;
  font-weight: 400 !important;
  font-style: italic !important;
  font-family: var(--font-newsreader), 'Newsreader', serif !important;
  font-size: 36px !important;
  width: auto !important;
  vertical-align: top;
}
#ccx-animated-line .word-item {
  color: var(--accent) !important;
  font-size: 36px !important;
  font-style: italic !important;
  font-family: var(--font-newsreader), 'Newsreader', serif !important;
}
.ccx-hidden { display: none !important; }


/* ═══════════════════════════════════════════════════
   SPLIT HERO — SRCC IMAGE (fades on scroll)
   ═══════════════════════════════════════════════════ */
#ccx-split-left {
  position: absolute;
  top: -70px; left: 0;
  width: 48%;
  height: calc(100% + 70px);
  background-color: var(--toasty);
  background-image: url('/srcc2.jpg');
  background-size: cover;
  background-position: center 35%;
  background-repeat: no-repeat;
  filter: saturate(0.92) brightness(1.06) sepia(0.12) hue-rotate(-14deg) contrast(1.05);
  z-index: 1;
  pointer-events: none;
  /* Fade starts just before the text column (~80% of panel), reaching ~55%
     opacity right at the text start (~84%), then quickly dissolving to zero.
     Text and fade begin simultaneously for a seamless editorial look. */
  -webkit-mask-image:
    linear-gradient(to right,
      rgba(0,0,0,1)    0%,
      rgba(0,0,0,1)    87%,
      rgba(0,0,0,0.82) 89%,
      rgba(0,0,0,0.55) 91%,
      rgba(0,0,0,0.28) 94%,
      rgba(0,0,0,0.10) 97%,
      rgba(0,0,0,0.02) 99%,
      rgba(0,0,0,0)    100%),
    linear-gradient(to bottom,
      rgba(0,0,0,1)    0%,
      rgba(0,0,0,1)    62%,
      rgba(0,0,0,0.88) 74%,
      rgba(0,0,0,0.58) 84%,
      rgba(0,0,0,0.24) 93%,
      rgba(0,0,0,0)    100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right,
      rgba(0,0,0,1)    0%,
      rgba(0,0,0,1)    87%,
      rgba(0,0,0,0.82) 89%,
      rgba(0,0,0,0.55) 91%,
      rgba(0,0,0,0.28) 94%,
      rgba(0,0,0,0.10) 97%,
      rgba(0,0,0,0.02) 99%,
      rgba(0,0,0,0)    100%),
    linear-gradient(to bottom,
      rgba(0,0,0,1)    0%,
      rgba(0,0,0,1)    62%,
      rgba(0,0,0,0.88) 74%,
      rgba(0,0,0,0.58) 84%,
      rgba(0,0,0,0.24) 93%,
      rgba(0,0,0,0)    100%);
  mask-composite: intersect;
}

/* ═══════════════════════════════════════════════════
   HERO GRANTS — top-right corner of hero
   ═══════════════════════════════════════════════════ */
#ccx-hero-grants {
  position: absolute;
  top: 28px;
  right: 48px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 9px;
}
#ccx-hero-grants__label {
  font-family: var(--font-work-sans), 'Work Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.32em;
  color: #b8ad9f;
}
#ccx-hero-grants__credits {
  margin: 0;
  font-family: var(--font-work-sans), 'Work Sans', sans-serif;
  font-size: 13px;
  font-weight: 400;
  color: #c0b4a8;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
#ccx-hero-grants__credits a {
  color: inherit;
  text-decoration: none;
  transition: color 0.3s ease;
}
#ccx-hero-grants__credits a:hover {
  color: #8a7a6a;
}
.ccx-grants-dot {
  margin: 0 7px;
  color: #d0c4b8;
}

/* ═══════════════════════════════════════════════════
   CURSOR GLOW
   ═══════════════════════════════════════════════════ */
#ccx-cursor-glow {
  position: fixed;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(107,74,30,0.30) 0%, rgba(107,74,30,0) 70%);
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  transition: opacity 0.3s ease;
  opacity: 0;
}
#ccx-cursor-glow.active { opacity: 1; }

/* ═══════════════════════════════════════════════════
   ENTRANCE OVERLAY
   ═══════════════════════════════════════════════════ */
#ccx-entrance-overlay {
  position: fixed; inset: 0;
  z-index: 99999;
  background: var(--cream);
  display: flex; align-items: center; justify-content: center;
  flex-direction: column;
  gap: 28px;
  pointer-events: all;
  transition: opacity 0.7s cubic-bezier(0.65, 0, 0.35, 1),
            transform 0.7s cubic-bezier(0.65, 0, 0.35, 1);
  will-change: opacity, transform;
}
#ccx-entrance-overlay.fade-out {
  opacity: 0;
  transform: translateY(-12vh);
  pointer-events: none;
}
#ccx-intro-logo {
  width: 200px;
  height: auto;
  max-height: 200px;
  object-fit: contain;
  mix-blend-mode: multiply;
  opacity: 0;
  transform: scale(0.94);
animation: introLogoIn 0.58s cubic-bezier(0.16, 1, 0.3, 1) 0.12s forwards;
}
@keyframes introLogoIn {
  to { opacity: 1; transform: scale(1); }
}
#ccx-edition-reveal {
  font-family: var(--font-newsreader), 'Newsreader', serif;
  font-style: italic;
  font-size: 18px;
  font-weight: 400;
  color: var(--muted);
  letter-spacing: 0.08em;
  opacity: 0;
  transform: translateY(10px);
  animation: editionRise 0.58s cubic-bezier(0.16, 1, 0.3, 1) 0.4s forwards;
}
@keyframes editionRise {
  to { opacity: 1; transform: translateY(0); }
}

/* ═══════════════════════════════════════════════════
   CONTRIBUTORS
   ═══════════════════════════════════════════════════ */
.ccx-contributors {
  padding: 24px 32px 96px;
  overflow: hidden;
  background: transparent;
}
.ccx-contributors__inner {
  max-width: 1280px;
  margin: 0 auto 48px;
  text-align: center;
}
.ccx-contributors__heading {
  font-family: Newsreader, serif;
  font-size: clamp(44px, 6vw, 60px);
  font-weight: 300;
  color: var(--text-heading);
  letter-spacing: -0.025em;
  line-height: 1.05;
  margin: 0;
}
.ccx-carousel-mask {
  width: 100%;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
  mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
}
.ccx-carousel-track {
  display: flex;
  gap: 32px;
  width: max-content;
  animation: ccx-scroll-left 25s linear infinite;
  will-change: transform;
}
.ccx-carousel-mask:hover .ccx-carousel-track {
  animation-play-state: paused;
}
.ccx-carousel-item { flex-shrink: 0; }
.ccx-carousel-item__img-wrap {
  width: 110px;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ccx-carousel-item__img-wrap img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: grayscale(1) opacity(0.55);
  transition: filter 0.3s ease;
}
.ccx-carousel-item__img-wrap:hover img {
  filter: grayscale(0.3) opacity(0.85);
}
@keyframes ccx-scroll-left {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

/* ═══════════════════════════════════════════════════
   MOBILE / RESPONSIVE  (phones + small tablets)
   ═══════════════════════════════════════════════════ */
@media (max-width: 768px) {
  header.ccx-hero {
    min-height: 0;
    overflow: visible;
    align-items: stretch;
    padding: 0 0 40px;
    display: block;
  }

  /* True split, stacked: photo becomes its own top panel (not a background
     behind the text) — same two ingredients as the desktop split (image
     block + cream text block), just rotated to top/bottom instead of
     left/right, so mobile reads as the same design instead of a different one. */
  #ccx-split-left {
    position: relative !important;
    top: 0; left: 0;
    width: 100% !important;
    height: 42vh !important;
    min-height: 260px;
    max-height: 380px;
    background-position: center 40%;
    filter: saturate(1.08) brightness(0.98);
    -webkit-mask-image: none;
    mask-image: none;
    -webkit-mask-composite: unset;
    mask-composite: unset;
  }
  /* Dissolve into the cream panel below instead of a hard cut — the photo's
     bottom quarter fades to cream so it reads as one continuous surface. */
  #ccx-split-left::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg,
      rgba(255,248,240,0) 62%,
      rgba(255,248,240,0.55) 82%,
      rgba(255,248,240,0.92) 94%,
      var(--cream) 100%);
  }

  /* Cream text panel below the photo — mirrors desktop's right-hand panel */
  header.ccx-hero .hero-inner {
    position: relative;
    padding: 32px 24px 0 !important;
    max-width: 100%;
    background: var(--cream);
  }

  /* No photo behind the text anymore — halo no longer needed */
  #ccx-edition,
  #ccx-main-title,
  #ccx-where-line,
  #ccx-animated-line,
  #ccx-animated-line .word-item {
    text-shadow: none;
  }

  #ccx-edition { font-size: 16px; gap: 10px; margin-bottom: 14px; }
  #ccx-edition::before { width: 18px; }

  #ccx-main-title {
    font-size: clamp(38px, 12vw, 58px) !important;
    line-height: 1.05 !important;
    letter-spacing: -1px !important;
    margin-bottom: 10px;
  }
  #ccx-main-title .title-nowrap { white-space: normal; }

  header.ccx-hero h1 { font-size: 22px !important; margin-top: 10px !important; }
  #ccx-where-line {
    display: block !important;
    font-size: clamp(22px, 6.4vw, 30px) !important;
  }
  #ccx-animated-line,
  #ccx-animated-line .word-item { font-size: clamp(22px, 6.4vw, 30px) !important; }
  #ccx-animated-line { display: block !important; }
  .word-carousel { min-width: 200px; height: 1.2em; }

  /* CTAs stack full-width */
  header.ccx-hero .ctas {
    margin-top: 28px;
    gap: 12px;
    flex-direction: column;
    align-items: stretch;
  }
  header.ccx-hero .ctas a { text-align: center; padding: 16px 24px; font-size: 12px; min-width: 0; }

  /* Restore "Supported by" below the photo panel, echoing the desktop
     credibility strip instead of disappearing on mobile. #ccx-hero-grants is
     a sibling of .hero-inner (not nested inside it), so it needs its own
     horizontal padding here to line up with the text column below — without
     it, the leftover desktop right:48px offset has nothing to anchor to
     and the text clips flush against the viewport edge. */
  #ccx-hero-grants {
    position: static;
    top: auto; right: auto;
    display: flex !important;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 20px 24px 0;
    margin-top: 0;
  }
  #ccx-hero-grants__label { font-size: 10px; }
  #ccx-hero-grants__credits { font-size: 11px; white-space: normal; }
}

/* Extra squeeze for very small phones (SE / mini, older Androids) */
@media (max-width: 380px) {
  #ccx-main-title { font-size: clamp(32px, 11vw, 44px) !important; }
  header.ccx-hero .hero-inner { padding: 32px 18px 0 !important; }
  #ccx-hero-grants { padding: 20px 18px 0; }
}

/* ─── HOW TO USE LINK ─── */
.ccx-how-to-use {
  display: inline-block;
  margin-top: 20px;
  font-family: var(--font-newsreader), 'Newsreader', serif;
  font-style: italic;
  font-size: 15px;
  font-weight: 400;
  color: rgba(69, 58, 42, 0.55);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgba(69, 58, 42, 0.3);
  transition: color 0.25s ease, text-decoration-color 0.25s ease;
}
.ccx-how-to-use:hover {
  color: rgba(69, 58, 42, 0.85);
  text-decoration-color: rgba(69, 58, 42, 0.6);
}
`


export default function LandingPage() {
  /* ── "How to use" overlay (Projection Room) trigger state ── */
  const [howToOpen, setHowToOpen] = useState(false)

  /* ── Soft "try a laptop" notice for mobile visitors (dismissible, non-blocking) ── */
  const [showMobileNotice, setShowMobileNotice] = useState(false)

  useEffect(() => {
    if (isMobileDevice() && !sessionStorage.getItem(MOBILE_NOTICE_SEEN_KEY)) {
      setShowMobileNotice(true)
    }
  }, [])

  useEffect(() => {
    const cleanups: Array<() => void> = []

    /* 1. ENTRANCE OVERLAY
       Plays once per session; force replay with `?intro=1`, skip with `?intro=skip`. */
    const introParam = new URLSearchParams(window.location.search).get('intro')
    const skipIntro =
      introParam === 'skip' || (introParam !== '1' && sessionStorage.getItem('ccx-entrance-done'))
    const pageEl = document.querySelector<HTMLElement>('.ccx-page')

    // If the intro is skipped, reveal the page immediately (no fade).
    // Otherwise, leave it hidden until the overlay starts lifting away.
    if (skipIntro && pageEl) {
      pageEl.style.transition = 'none'
      pageEl.classList.add('ccx-revealed')
      // Restore the transition next frame so future state changes animate normally
      requestAnimationFrame(() => {
        pageEl.style.transition = ''
      })
    }

    if (!skipIntro) {
      const overlay = document.createElement('div')
      overlay.id = 'ccx-entrance-overlay'
      overlay.innerHTML = `
        <img id="ccx-intro-logo" src="/logo2.png" alt="Case CompendiumX" onerror="this.style.display='none'"/>
        <div id="ccx-edition-reveal">3rd Edition of Case Compendium</div>
      `
      document.body.appendChild(overlay)

const tFade = setTimeout(() => {
  document.getElementById('ccx-entrance-overlay')?.classList.add('fade-out')
  pageEl?.classList.add('ccx-revealed')
}, 1265)
const tRemove = setTimeout(() => {
  document.getElementById('ccx-entrance-overlay')?.remove()
  sessionStorage.setItem('ccx-entrance-done', '1')
}, 2300)
      cleanups.push(() => {
        clearTimeout(tFade)
        clearTimeout(tRemove)
        document.getElementById('ccx-entrance-overlay')?.remove()
        pageEl?.classList.remove('ccx-revealed')
      })
    }

    /* 2. HERO RESTRUCTURE */
    const h1 = document.querySelector<HTMLElement>('header.ccx-hero h1')
    if (h1) {
      const heroDiv = h1.parentElement!

      if (!document.getElementById('ccx-edition')) {
        const ed = document.createElement('div')
        ed.id = 'ccx-edition'
        ed.innerHTML = '<span>3rd Edition of Case Compendium</span>'
        heroDiv.insertBefore(ed, h1)
      }

      if (!document.getElementById('ccx-main-title')) {
        const title = document.createElement('div')
        title.id = 'ccx-main-title'
        title.innerHTML =
          'Case <span class="title-nowrap">Compendium<span class="title-x">X</span></span>'
        heroDiv.insertBefore(title, h1)
      }

      h1.style.fontSize = '36px'
      h1.style.lineHeight = '1.18'
      h1.style.marginTop = '14px'
      h1.style.marginBottom = '8px'
      h1.style.fontWeight = '300'
      h1.style.fontFamily = "var(--font-newsreader), 'Newsreader', serif"

      const firstText = Array.from(h1.childNodes).find(
        (n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0,
      )
      if (firstText && !document.getElementById('ccx-where-line')) {
        const whereSpan = document.createElement('span')
        whereSpan.id = 'ccx-where-line'
        whereSpan.textContent = 'Where case prep gets'
        h1.replaceChild(whereSpan, firstText)
      }

      const br = h1.querySelector('br')
      if (br) br.remove()

      const carousel = h1.querySelector<HTMLElement>('.word-carousel')
      if (carousel && !carousel.id) carousel.id = 'ccx-animated-line'
    }

    /* 3. SPLIT HERO IMAGE PANEL */
    const header = document.querySelector<HTMLElement>('header.ccx-hero')
    if (header && !document.getElementById('ccx-split-left')) {
      const panel = document.createElement('div')
      panel.id = 'ccx-split-left'
      panel.innerHTML = ''
      header.insertBefore(panel, header.firstChild)
      const heroInner = header.querySelector<HTMLElement>('.hero-inner')
      if (heroInner) {
        heroInner.style.position = 'relative'
        heroInner.style.zIndex = '10'
      }
    }

    /* 4. SCROLL: fade image + expand hero content — raf-lerped for smoothness */
    const heroInner = document.querySelector<HTMLElement>('.hero-inner')
    const splitPanel = document.getElementById('ccx-split-left')
    const FADE_END = 1150
    const SMOOTH = 0.028
    let currentT = 0
    let targetT = 0
    let rafId: number | null = null
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const tick = () => {
      currentT += (targetT - currentT) * SMOOTH
      const eased = easeInOutCubic(Math.max(0, Math.min(1, currentT)))
      if (splitPanel) splitPanel.style.opacity = String(1 - eased)
      if (heroInner) {
        const pct = 50 * (1 - eased)
        heroInner.style.paddingLeft = `calc(48px + ${pct}%)`
      }
      if (Math.abs(targetT - currentT) > 0.0005) {
        rafId = requestAnimationFrame(tick)
      } else {
        rafId = null
      }
    }
    // This scroll-fade (opacity + growing left padding) is built for the
    // desktop left/right split. Below 768px the layout is a stacked photo
    // panel + cream text panel instead, so the effect is skipped there —
    // otherwise its inline styles would fight the mobile CSS and fade the
    // photo panel out / shove the text panel over on scroll.
    const isMobileHero = () => window.innerWidth <= 768
    const onScroll = () => {
      if (isMobileHero()) return
      targetT = Math.min(1, window.scrollY / FADE_END)
      if (rafId === null) rafId = requestAnimationFrame(tick)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    cleanups.push(() => {
      window.removeEventListener('scroll', onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
    })

    /* 5. CURSOR GLOW (small + subtle) */
    let glow = document.getElementById('ccx-cursor-glow')
    if (!glow) {
      glow = document.createElement('div')
      glow.id = 'ccx-cursor-glow'
      document.body.appendChild(glow)
    }
    const onMove = (e: MouseEvent) => {
      glow!.style.left = e.clientX + 'px'
      glow!.style.top = e.clientY + 'px'
      glow!.classList.add('active')
    }
    const onLeaveDoc = () => glow!.classList.remove('active')
    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeaveDoc)
    cleanups.push(() => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeaveDoc)
      glow?.remove()
    })

    /* 6. INTERSECTION OBSERVER for reveal animations */
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible')
              observer.unobserve(entry.target)
            }
          })
        },
        { threshold: 0.15 },
      )
      document
        .querySelectorAll('[data-ccx-reveal]')
        .forEach((el) => observer.observe(el))
      cleanups.push(() => observer.disconnect())
    } else {
      document
        .querySelectorAll('[data-ccx-reveal]')
        .forEach((el) => el.classList.add('visible'))
    }

    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [])

  return (
    <>
    <div className="ccx-page">
      {/* Organization + WebSite JSON-LD now render site-wide from the root layout
          (SiteStructuredData), so no per-homepage render is needed here. */}
      {/* Fonts are self-hosted site-wide via next/font (see app/layout.tsx);
          the literal 'Work Sans'/'Newsreader' names resolve through the
          --font-* CSS variables, so the Google-CDN stylesheet is no longer
          needed here (it duplicated every face and blocked first paint). */}
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      <Navbar currentPage="home" />

<main className="pt-[70px]" style={{ overflowX: 'clip' }}>
        <header className="ccx-hero">
          {/* Sponsor logos — top-right of hero, above 3rd edition text */}
          <div id="ccx-hero-grants">
            <span id="ccx-hero-grants__label">Supported by</span>
            <p id="ccx-hero-grants__credits">
              <a href="https://www.cartesia.ai/startups/" target="_blank" rel="noopener noreferrer">Cartesia</a>
              <span className="ccx-grants-dot">·</span>
              <a href="https://elevenlabs.io/startup-grants" target="_blank" rel="noopener noreferrer">ElevenLabs</a>
              <span className="ccx-grants-dot">·</span>
              <a href="https://cloud.google.com/startup" target="_blank" rel="noopener noreferrer">Google for Startups</a>
            </p>
          </div>

          <div className="hero-inner">
            <h1>
              Where case prep gets
              <br />
              <span className="word-carousel">
                <span className="word-item">sharper.</span>
                <span className="word-item">smarter.</span>
                <span className="word-item">precise.</span>
              </span>
            </h1>
            <div className="ctas">
              <a className="primary" href="/repository">
                BROWSE REPOSITORY
              </a>
              <a className="secondary" href="/practice">
                DO A CASE
              </a>
            </div>
            <button className="ccx-how-to-use" onClick={() => setHowToOpen(true)}>
              How to use
            </button>
          </div>
        </header>
      </main>

      <Footer />
    </div>

    {/* ══ The Projection Room — "How to use" overlay ══
        Rendered as a sibling of .ccx-page so the page-wide
        `border-radius: 0 !important` reset never clips its pills. ══ */}
    <HowToUseOverlay open={howToOpen} onClose={() => setHowToOpen(false)} />

    {showMobileNotice && (
      <MobileSoftNotice
        onDismiss={() => {
          sessionStorage.setItem(MOBILE_NOTICE_SEEN_KEY, '1')
          setShowMobileNotice(false)
        }}
      />
    )}
    </>
  )
}

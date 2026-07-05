'use client'

import { useEffect } from 'react'
import Navbar from '@/components/dashboard/Navbar'
import Footer from '@/components/dashboard/Footer'


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
body { font-family: 'Work Sans', sans-serif; }

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
  font-family: 'Newsreader', serif;
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
  font-family: 'Work Sans', sans-serif;
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
  font-family: 'Newsreader', serif;
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
  font-family: 'Newsreader', serif;
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
  font-family: 'Newsreader', serif !important;
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
  font-family: 'Newsreader', serif !important;
  font-size: 36px !important;
  width: auto !important;
  vertical-align: top;
}
#ccx-animated-line .word-item {
  color: var(--accent) !important;
  font-size: 36px !important;
  font-style: italic !important;
  font-family: 'Newsreader', serif !important;
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
  font-family: 'Work Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.32em;
  color: #b8ad9f;
}
#ccx-hero-grants__credits {
  margin: 0;
  font-family: 'Work Sans', sans-serif;
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
  font-family: 'Newsreader', serif;
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
    min-height: calc(100vh - 70px);
    min-height: calc(100svh - 70px);
    overflow: visible;
    align-items: center;
    padding: 32px 0 48px;
  }

  /* Full-width college backdrop, dimmed a touch for contrast */
  #ccx-split-left {
    top: 0;
    left: 0;
    width: 100% !important;
    height: 100% !important;
    background-position: center center;
    filter: saturate(1.15) brightness(0.92);
    -webkit-mask-image: linear-gradient(to bottom,
      rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%,
      rgba(0,0,0,0.6) 82%, rgba(0,0,0,0) 100%);
    mask-image: linear-gradient(to bottom,
      rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%,
      rgba(0,0,0,0.6) 82%, rgba(0,0,0,0) 100%);
    -webkit-mask-composite: source-over;
    mask-composite: add;
  }
  #ccx-split-left::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg,
      rgba(255,248,240,0.55) 0%,
      rgba(255,248,240,0.68) 42%,
      rgba(255,248,240,0.80) 68%,
      rgba(255,248,240,0.95) 100%);
  }

  /* Full-width text column (beats desktop calc() + the scroll script's inline padding) */
  header.ccx-hero .hero-inner {
    padding: 0 24px !important;
    max-width: 100%;
  }

  /* Cream halo crisps every line against the photo behind it */
  #ccx-edition,
  #ccx-main-title,
  #ccx-where-line,
  #ccx-animated-line,
  #ccx-animated-line .word-item {
    text-shadow: 0 1px 10px rgba(255,248,240,0.9), 0 1px 2px rgba(255,248,240,0.75);
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

  /* Hide hero grants on mobile — no space */
  #ccx-hero-grants { display: none; }
}

/* Extra squeeze for very small phones (SE / mini, older Androids) */
@media (max-width: 380px) {
  #ccx-main-title { font-size: clamp(32px, 11vw, 44px) !important; }
  header.ccx-hero .hero-inner { padding: 0 18px !important; }
}
`


export default function LandingPage() {
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
      h1.style.fontFamily = "'Newsreader', serif"

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
    const onScroll = () => {
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
    <div className="ccx-page">
      {/* Organization + WebSite JSON-LD now render site-wide from the root layout
          (SiteStructuredData), so no per-homepage render is needed here. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,300;1,6..72,400;1,6..72,500&family=Work+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
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
          </div>
        </header>
      </main>

      <Footer />
    </div>
  )
}

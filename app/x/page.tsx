'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const ACCENT = '#6B4A1E'

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
  --accent:       #6B4A1E;
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
  transition: opacity 2.2s cubic-bezier(0.65, 0, 0.35, 1);
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
  overflow: hidden;
}
header.ccx-hero .hero-inner {
  position: relative;
  z-index: 10;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 0 48px 0 calc(48px + 42%);
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
  display: inline-block;
  padding: 16px 32px;
  white-space: nowrap;
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
  gap: 16px;
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
  width: 42px;
  height: 1.5px;
  background: var(--accent);
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
  transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), color 0.8s ease;
  transform-origin: center center;
}
#ccx-main-title:hover .title-x {
  transform: scale(1.08);
}
@media (max-width: 1100px) {
  #ccx-main-title { font-size: 72px; line-height: 78px; letter-spacing: -1.8px; }
  #ccx-edition { font-size: 22px; }
}
#ccx-where-line {
  display: block !important;
  color: var(--text-heading) !important;
  font-weight: 300 !important;
  font-style: normal !important;
  font-family: var(--font-newsreader), 'Newsreader', serif !important;
  font-size: 36px !important;
  letter-spacing: -0.6px !important;
  margin-top: 8px;
}
#ccx-animated-line {
  display: block !important;
  color: var(--accent) !important;
  font-weight: 400 !important;
  font-style: italic !important;
  font-family: var(--font-newsreader), 'Newsreader', serif !important;
  font-size: 36px !important;
  width: auto !important;
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
  top: 0; left: 0;
  width: 42%;
  height: 100%;
  background-color: var(--toasty);
  background-image:
    url('/srcc.jpg'),
    linear-gradient(135deg, rgba(107,74,30,0.18), rgba(69,58,42,0.4)),
    radial-gradient(ellipse at 30% 40%, rgba(200,169,110,0.6), transparent 65%),
    radial-gradient(ellipse at 70% 80%, rgba(107,74,30,0.5), transparent 60%);
  background-size: cover, auto, auto, auto;
  background-position: center center;
  background-repeat: no-repeat;
  filter: grayscale(0.15) sepia(0.08) brightness(0.94);
  z-index: 1;
  pointer-events: none;
  /* Two-axis mask feathers BOTH the right and bottom edges into true
     transparency so the panel dissolves into the page rather than
     presenting a hard-clipped border. */
  -webkit-mask-image:
    linear-gradient(to right,
      rgba(0,0,0,1)    0%,
      rgba(0,0,0,1)    20%,
      rgba(0,0,0,0.88) 38%,
      rgba(0,0,0,0.62) 55%,
      rgba(0,0,0,0.30) 72%,
      rgba(0,0,0,0.08) 88%,
      rgba(0,0,0,0)    100%),
    linear-gradient(to bottom,
      rgba(0,0,0,1)    0%,
      rgba(0,0,0,1)    45%,
      rgba(0,0,0,0.82) 60%,
      rgba(0,0,0,0.45) 75%,
      rgba(0,0,0,0.15) 88%,
      rgba(0,0,0,0)    100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right,
      rgba(0,0,0,1)    0%,
      rgba(0,0,0,1)    20%,
      rgba(0,0,0,0.88) 38%,
      rgba(0,0,0,0.62) 55%,
      rgba(0,0,0,0.30) 72%,
      rgba(0,0,0,0.08) 88%,
      rgba(0,0,0,0)    100%),
    linear-gradient(to bottom,
      rgba(0,0,0,1)    0%,
      rgba(0,0,0,1)    45%,
      rgba(0,0,0,0.82) 60%,
      rgba(0,0,0,0.45) 75%,
      rgba(0,0,0,0.15) 88%,
      rgba(0,0,0,0)    100%);
  mask-composite: intersect;
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
  /* Slow, smooth lift on exit — overlay slides upward while fading,
     revealing the landing page beneath. */
  transition: opacity 2s cubic-bezier(0.65, 0, 0.35, 1),
              transform 2s cubic-bezier(0.65, 0, 0.35, 1);
  will-change: opacity, transform;
}
#ccx-entrance-overlay.fade-out {
  opacity: 0;
  transform: translateY(-22vh);
  pointer-events: none;
}
#ccx-intro-logo {
  width: 200px;
  height: auto;
  max-height: 200px;
  object-fit: contain;
  /* Knocks out the PNG's white background so the logo sits on cream
     without a visible square. White × cream = cream. */
  mix-blend-mode: multiply;
  opacity: 0;
  transform: scale(0.94);
  animation: introLogoIn 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.4s forwards;
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
  animation: editionRise 1.4s cubic-bezier(0.22, 1, 0.36, 1) 1.2s forwards;
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
   SUPPORTED BY
   ═══════════════════════════════════════════════════ */
.ccx-supported {
  padding: 48px 32px 112px;
  background: transparent;
}
.ccx-supported__inner {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.ccx-supported__label {
  font-family: var(--font-work-sans), 'Work Sans', sans-serif;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.35em;
  color: #b0a898;
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.6s cubic-bezier(0.22,1,0.36,1),
              transform 0.6s cubic-bezier(0.22,1,0.36,1);
}
.ccx-supported__label.visible { opacity: 1; transform: translateY(0); }
.ccx-supported__logos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 40px;
  flex-wrap: wrap;
}
.ccx-supported__divider {
  width: 1px;
  height: 24px;
  background: rgba(69, 58, 42, 0.12);
  flex-shrink: 0;
}
.ccx-grant-link {
  display: flex;
  align-items: center;
  text-decoration: none;
  transition: transform 0.35s ease;
}
.ccx-grant-link:hover { transform: translateY(-2px); }
.ccx-grant-slide-left {
  opacity: 0;
  transform: translateX(-32px);
  transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1),
              transform 0.8s cubic-bezier(0.22,1,0.36,1);
}
.ccx-grant-slide-left.visible { opacity: 1; transform: translateX(0); }
.ccx-grant-slide-right {
  opacity: 0;
  transform: translateX(32px);
  transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1),
              transform 0.8s cubic-bezier(0.22,1,0.36,1);
}
.ccx-grant-slide-right.visible { opacity: 1; transform: translateX(0); }
@keyframes ccx-grant-breathe {
  0%, 100% { opacity: 0.45; }
  50%       { opacity: 1; }
}
.ccx-grant-link.visible.ccx-grant-pulse-1 {
  animation: ccx-grant-breathe 3s ease-in-out infinite;
}
.ccx-grant-link.visible.ccx-grant-pulse-2 {
  animation: ccx-grant-breathe 3s ease-in-out 1.5s infinite;
}
.ccx-grant-link img { display: block; height: auto; }
`

const NAV_LINKS = [
  { label: 'Home', href: '/x' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'About Us', href: '/our-story' },
]

const FOOTER_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'The Platform', href: '/about-ccx' },
  { label: 'The Team', href: '/our-story' },
  { label: 'Acknowledgements', href: '/collaborators' },
  {
    label: 'Contact Us',
    href: 'mailto:contact@casecompendiumx.in?subject=Case%20CompendiumX%20Query',
  },
]

const COLLEGES = [
  { src: 'https://www.casecompendiumx.in/colleges/srcc.png', alt: 'SRCC' },
  { src: 'https://www.casecompendiumx.in/colleges/st-stephens.png', alt: "St. Stephen's" },
  { src: 'https://www.casecompendiumx.in/colleges/sscbs.png', alt: 'SSCBS' },
  { src: 'https://www.casecompendiumx.in/colleges/lsr.png', alt: 'LSR' },
  { src: 'https://www.casecompendiumx.in/colleges/ashoka.png', alt: 'Ashoka' },
  { src: 'https://www.casecompendiumx.in/colleges/iit-delhi.png', alt: 'IIT Delhi' },
  { src: 'https://www.casecompendiumx.in/colleges/iit-bombay.png', alt: 'IIT Bombay' },
  { src: 'https://www.casecompendiumx.in/colleges/iit-kharagpur.png', alt: 'IIT Kharagpur' },
  { src: 'https://www.casecompendiumx.in/colleges/iit-kanpur.png', alt: 'IIT Kanpur' },
  { src: 'https://www.casecompendiumx.in/colleges/iit-madras.png', alt: 'IIT Madras' },
]

function Navbar() {
  const pathname = usePathname()
  return (
    <nav
      className={`fixed top-0 w-full z-[100] border-b border-[${ACCENT}]/10`}
      style={{
        backgroundColor: 'rgba(255, 248, 240, 0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        height: '70px',
        borderBottomColor: 'rgba(107,74,30,0.1)',
      }}
    >
      <div className="max-w-screen-2xl mx-auto flex justify-between items-center w-full h-full px-12">
        <Link
          href="/x"
          className="flex items-center gap-1 transition-opacity hover:opacity-85"
          aria-label="Case CompendiumX home"
        >
          <span
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: 'Newsreader, serif', color: 'rgb(59, 47, 47)' }}
          >
            Case Compendium<span style={{ color: 'rgb(59, 47, 47)' }}>X</span>
          </span>
        </Link>

        <div className="flex items-center gap-10">
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'relative pb-1 text-xs uppercase tracking-[0.2em] transition-all duration-300',
                  'hover:font-semibold',
                  isActive ? 'font-medium' : 'text-[#57534E] font-normal',
                ].join(' ')}
                style={{
                  fontFamily: "var(--font-work-sans), 'Work Sans', sans-serif",
                  color: isActive ? ACCENT : undefined,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = ACCENT
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isActive ? ACCENT : ''
                }}
              >
                {label.toUpperCase()}
                {isActive && (
                  <span
                    className="absolute left-0 right-0 bottom-[-4px] h-[2px]"
                    style={{ backgroundColor: ACCENT }}
                    aria-hidden="true"
                  />
                )}
              </Link>
            )
          })}
        </div>

        <Link
          href="/login?redirect=/x"
          className="px-5 py-2 text-[10px] uppercase tracking-[0.2em] font-medium transition-all duration-300 cursor-pointer bg-transparent"
          style={{
            fontFamily: "var(--font-work-sans), 'Work Sans', sans-serif",
            color: ACCENT,
            border: `1px solid ${ACCENT}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = ACCENT
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = ACCENT
          }}
        >
          SIGN IN
        </Link>
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer className="w-full py-16 px-12" style={{ backgroundColor: 'rgb(69, 58, 42)' }}>
      <div className="max-w-screen-2xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-12 mb-10">
          <div>
            <Link
              href="/x"
              className="mb-2 inline-block transition-opacity hover:opacity-85"
              style={{
                fontFamily: 'Newsreader, serif',
                fontSize: '24px',
                fontWeight: 600,
                letterSpacing: '-0.6px',
                color: 'rgb(30, 27, 21)',
                textDecoration: 'none',
              }}
            >
              Case Compendium<span style={{ color: ACCENT }}>X</span>
            </Link>
            <p
              className="text-xs"
              style={{
                fontFamily: "var(--font-work-sans), 'Work Sans', sans-serif",
                color: 'rgba(213, 196, 177, 0.5)',
              }}
            >
              The case book a million readers grew up on. Now built to coach you.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-12 gap-y-4">
            {FOOTER_LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="transition-all hover:text-white hover:font-semibold"
                style={{
                  fontFamily: "var(--font-work-sans), 'Work Sans', sans-serif",
                  fontSize: '10px',
                  fontWeight: 400,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: 'rgba(213, 196, 177, 0.7)',
                  textDecoration: 'none',
                }}
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        <div
          className="w-full mb-8"
          style={{ height: '1px', backgroundColor: 'rgba(213, 196, 177, 0.15)' }}
        />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-8">
            <a
              href="https://www.linkedin.com/company/casecompendiumx"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-all hover:text-white"
              style={{ color: 'rgba(213, 196, 177, 0.7)' }}
              aria-label="LinkedIn"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M4.98 3.5C4.98 4.881 3.87 6 2.5 6S.02 4.881.02 3.5C.02 2.12 1.13 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8.5h4V24h-4V8.5zm6.5 0h3.8v2.1h.05c.53-1 1.82-2.1 3.75-2.1 4.01 0 4.75 2.64 4.75 6.07V24H15v-8.37c0-2-.04-4.58-2.79-4.58-2.8 0-3.23 2.18-3.23 4.43V24H5.5V8.5H7z" />
              </svg>
            </a>
            <a
              href="mailto:contact@casecompendiumx.in"
              className="transition-all hover:text-white"
              style={{ color: 'rgba(213, 196, 177, 0.7)' }}
              aria-label="Email us"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </a>
          </div>

          <p
            className="text-[10px] tracking-[0.2em] uppercase"
            style={{
              fontFamily: "var(--font-work-sans), 'Work Sans', sans-serif",
              color: 'rgba(213, 196, 177, 0.5)',
            }}
          >
            © 2026 Case CompendiumX. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default function LandingX() {
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
        <img id="ccx-intro-logo" src="/logo.png" alt="Case CompendiumX" onerror="this.style.display='none'"/>
        <div id="ccx-edition-reveal">3rd Edition of Case Compendium</div>
      `
      document.body.appendChild(overlay)

      // Timeline:
      //   0.4s – 1.8s : logo fades in (scale 0.94 → 1, opacity 0 → 1)
      //   1.2s – 2.6s : edition rises in
      //   2.6s – 3.2s : hold so user can register the brand
      //   3.2s        : fade-out class triggers 2s upward lift + opacity fade
      //   5.2s        : overlay fully invisible
      //   5.5s        : overlay element removed from DOM
      const tFade = setTimeout(() => {
        document.getElementById('ccx-entrance-overlay')?.classList.add('fade-out')
        // Crossfade: as the overlay lifts away, the landing page fades in
        // over the same 2s window so the reveal feels seamless, not abrupt.
        pageEl?.classList.add('ccx-revealed')
      }, 3200)
      const tRemove = setTimeout(() => {
        document.getElementById('ccx-entrance-overlay')?.remove()
        sessionStorage.setItem('ccx-entrance-done', '1')
      }, 5500)
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
      header.style.overflow = 'hidden'
      const heroInner = header.querySelector<HTMLElement>('.hero-inner')
      if (heroInner) {
        heroInner.style.position = 'relative'
        heroInner.style.zIndex = '10'
      }
    }

    /* 4. SCROLL: fade image + expand hero content — raf-lerped for smoothness */
    const heroInner = document.querySelector<HTMLElement>('.hero-inner')
    const splitPanel = document.getElementById('ccx-split-left')
    const FADE_END = 1150 // px of scroll over which the image fully fades — generous so wrap-snap is surrounded by long, gentle motion
    const SMOOTH = 0.028 // closer to 0 = slower / smoother chase
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
        const pct = 42 * (1 - eased)
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
        .querySelectorAll(
          '[data-ccx-reveal], .ccx-grant-slide-left, .ccx-grant-slide-right, .ccx-supported__label',
        )
        .forEach((el) => observer.observe(el))
      cleanups.push(() => observer.disconnect())
    } else {
      document
        .querySelectorAll(
          '[data-ccx-reveal], .ccx-grant-slide-left, .ccx-grant-slide-right, .ccx-supported__label',
        )
        .forEach((el) => el.classList.add('visible'))
    }

    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [])

  return (
    <div className="ccx-page">
      {/* Fonts are self-hosted site-wide via next/font (see app/layout.tsx);
          the literal 'Work Sans'/'Newsreader' names resolve through the
          --font-* CSS variables, so the Google-CDN stylesheet is no longer
          needed here (it duplicated every face and blocked first paint). */}
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      <Navbar />

      <main className="pt-[70px]">
        <header className="ccx-hero">
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
              <a className="primary" href="#library">
                BROWSE REPOSITORY
              </a>
              <a className="secondary" href="#practice">
                DO A CASE
              </a>
            </div>
          </div>
        </header>

        <section className="ccx-contributors">
          <div className="ccx-contributors__inner">
            <h2 className="ccx-contributors__heading">Contributors</h2>
          </div>
          <div className="ccx-carousel-mask">
            <div className="ccx-carousel-track">
              {[...COLLEGES, ...COLLEGES].map((c, i) => (
                <div key={`${c.alt}-${i}`} className="ccx-carousel-item">
                  <div className="ccx-carousel-item__img-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.src} alt={c.alt} loading="lazy" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ccx-supported">
          <div className="ccx-supported__inner">
            <p className="ccx-supported__label" data-ccx-reveal>
              Supported by
            </p>
            <div className="ccx-supported__logos">
              <a
                className="ccx-grant-link ccx-grant-slide-left ccx-grant-pulse-1"
                href="https://elevenlabs.io/startup-grants"
                target="_blank"
                rel="noopener noreferrer"
                data-ccx-reveal
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.casecompendiumx.in/grants/elevenlabs-grants.webp"
                  alt="ElevenLabs Grants"
                  style={{ width: '200px', height: 'auto' }}
                />
              </a>
              <div className="ccx-supported__divider" />
              <a
                className="ccx-grant-link ccx-grant-slide-right ccx-grant-pulse-2"
                href="https://cloud.google.com/startup"
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginTop: '4px' }}
                data-ccx-reveal
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.casecompendiumx.in/grants/google-for-startups-new.png"
                  alt="Google for Startups"
                  style={{ width: '175px', height: 'auto' }}
                />
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

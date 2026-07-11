'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Navbar from '@/components/dashboard/Navbar'
import Footer from '@/components/dashboard/Footer'

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

/* ─── HOW TO USE LINK ─── */
.ccx-how-to-use {
  display: inline-block;
  margin-top: 20px;
  font-family: 'Newsreader', serif;
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

/* ═══════════════════════════════════════════════════
   THE PROJECTION ROOM — "How to use" video overlay
   Rendered as a sibling of .ccx-page so the page's global
   border-radius:0 reset never touches it.
   ═══════════════════════════════════════════════════ */
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


export default function LandingPage() {
  /* ── Projection Room ("How to use") state ── */
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PrMode>('local')
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
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const hideTimerRef = useRef<number | null>(null)
  const scrubbingRef = useRef(false)
  const phaseRef = useRef<PrPhase>('poster')
  const modeRef = useRef<PrMode>('local')
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { modeRef.current = mode }, [mode])

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
    setMode(next)
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

  const openOverlay = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = e.currentTarget
    setOpen(true)
  }, [])

  const closeOverlay = useCallback(() => {
    videoRef.current?.pause()
    setOpen(false)
  }, [])

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
    const url = HOW_TO_USE_VIDEOS.local
    if (url) v.src = url
  }, [])

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

  /* lock body scroll (compensating scrollbar width) + move focus into the dialog */
  useEffect(() => {
    if (!open) return
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
      triggerRef.current?.focus()
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
    <>
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
            <button className="ccx-how-to-use" onClick={openOverlay}>
              How to use
            </button>
          </div>
        </header>
      </main>

      <Footer />
    </div>

    {/* ══ The Projection Room — "How to use" overlay ══ */}
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
            <button
              className="pr-next"
              tabIndex={phase === 'ended' ? 0 : -1}
              onClick={() => switchMode(mode === 'local' ? 'remote' : 'local')}
            >
              or see {PR_MODE_NAMES[mode === 'local' ? 'remote' : 'local']} &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}

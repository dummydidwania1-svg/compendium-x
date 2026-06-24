'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Footer from '@/components/dashboard/Footer'

/* ─── Section nav ─── */

const NAV_SECTIONS = [
  { id: 'setup',    label: 'The Setup' },
  { id: 'demand',   label: 'Demand Side' },
  { id: 'supply',   label: 'Supply Side' },
  { id: 'physical', label: 'Physical Estimation' },
  { id: 'cheatsheet', label: 'Cheat Sheet' },
]

/* ─── Page CSS ─── */

const PAGE_CSS = `
  .pf-root {
    font-family: 'Work Sans', sans-serif;
    background: #fff8f0;
    color: #453a2a;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  .pf-root *::selection { background: rgba(92,64,51,.15); color: #3b2f2f; }

  /* Reveal */
  .pf-reveal {
    opacity: 0;
    transform: translateY(36px) scale(.985);
    filter: blur(8px);
    transition: opacity 1.15s cubic-bezier(.16,1,.3,1),
                transform 1.15s cubic-bezier(.16,1,.3,1),
                filter .9s ease;
    will-change: opacity, transform, filter;
  }
  .pf-reveal.visible { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  @media (prefers-reduced-motion: reduce) {
    .pf-reveal { transition: none; opacity: 1; transform: none; filter: none; }
  }

  /* Layout */
  .pf-wrap { max-width: 1320px; margin: 0 auto; padding: 0 60px; }
  @media (max-width: 768px) { .pf-wrap { padding: 0 28px; } }
  @media (max-width: 480px) { .pf-wrap { padding: 0 20px; } }

  /* Back-link bar -- match case-preview pages (top-left of screen, ~24px below navbar) */
  .pf-crumb-bar { max-width: 1480px; margin: 0 auto; padding: 94px 16px 0; }
  @media (min-width: 1024px) { .pf-crumb-bar { padding: 94px 24px 0; } }

  /* Hero */
  .pf-hero { max-width: 1320px; margin: 0 auto; padding: 28px 60px 24px; text-align: center; }
  @media (max-width: 768px) { .pf-hero { padding: 22px 28px 20px; } }

  /* Breadcrumb */
  .pf-back-link {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .2em; color: #5C4033; text-decoration: none;
    opacity: .7; transition: opacity .18s;
  }
  .pf-back-link:hover { opacity: 1; }

  .pf-eyebrow {
    display: block; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .3em;
    color: rgba(92,64,51,.48); margin-bottom: 14px;
  }
  .pf-headline {
    font-family: 'Newsreader', serif;
    font-size: clamp(40px, 6vw, 72px); font-weight: 300;
    line-height: 1.0; letter-spacing: -.025em; color: #453a2a; margin-bottom: 20px;
  }

  /* Sections */
  .pf-section { position: relative; padding: 132px 0; scroll-margin-top: 90px; }
  .pf-section:first-of-type { padding-top: 28px; }
  .pf-section::before {
    content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
    width: min(640px, 80%); height: 1px;
    background: linear-gradient(to right, transparent 0%, rgba(92,64,51,.18) 25%, rgba(92,64,51,.28) 50%, rgba(92,64,51,.18) 75%, transparent 100%);
  }
  .pf-section::after {
    content: ''; position: absolute; top: -3px; left: 50%; transform: translateX(-50%) rotate(45deg);
    width: 5px; height: 5px; background: #5C4033; opacity: .55;
  }
  .pf-section:first-of-type::before,
  .pf-section:first-of-type::after { display: none; }

  .pf-section-ey {
    display: block; font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .3em; color: rgba(92,64,51,.45); margin-bottom: 10px; margin-top: 8px;
  }
  .pf-section-title {
    font-family: 'Newsreader', serif; font-size: clamp(22px, 3vw, 30px);
    font-weight: 300; color: #453a2a; letter-spacing: -.01em; line-height: 1.25; margin-bottom: 22px;
  }

  .pf-body { font-size: 15px; line-height: 1.9; color: #5a4f43; max-width: 760px; }

  /* Callout */
  .pf-callout { border-left: 2px solid #5C4033; padding: 18px 22px; background: rgba(92,64,51,.03); margin-bottom: 32px; }
  .pf-callout-lbl { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .26em; color: rgba(92,64,51,.5); margin-bottom: 8px; }
  .pf-callout-txt { font-family: 'Newsreader', serif; font-size: 18px; font-style: italic; font-weight: 300; color: #453a2a; line-height: 1.6; }

  /* Numbered list */
  .pf-qlist { list-style: none; margin: 0; padding: 0; }
  .pf-q {
    display: flex; gap: 16px; align-items: flex-start; padding: 16px 0;
    border-bottom: 1px solid rgba(92,64,51,.07);
    opacity: 0; transform: translateX(-10px);
    transition: opacity .6s cubic-bezier(.22,1,.36,1), transform .6s cubic-bezier(.22,1,.36,1);
  }
  .pf-q:first-child { border-top: 1px solid rgba(92,64,51,.07); }
  .pf-q.visible { opacity: 1; transform: translateX(0); }
  @media (prefers-reduced-motion: reduce) { .pf-q { transition: none; opacity: 1; transform: none; } }
  .pf-qn { font-family: 'Newsreader', serif; font-size: 13px; font-weight: 300; color: rgba(92,64,51,.38); min-width: 22px; flex-shrink: 0; padding-top: 2px; }
  .pf-qt { font-size: 15px; line-height: 1.7; color: #5a4f43; }

  .pf-split { display: grid; grid-template-columns: 380px 1fr; gap: 64px; align-items: start; margin-top: 96px; }
  @media (max-width: 980px) { .pf-split { grid-template-columns: 1fr; gap: 24px; } }
  .pf-split-text { position: sticky; top: 96px; align-self: start; transition: opacity .4s ease; }
  @media (max-width: 980px) { .pf-split-text { position: static; } }
  .pf-split-cap { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .28em; color: rgba(92,64,51,.35); margin-bottom: 14px; text-align: left; }
  .pf-split-desc { font-size: 15px; line-height: 1.95; color: #5a4f43; max-width: 340px; }
  .pf-split-chart { min-width: 0; overflow: visible; }

  /* Italic note */
  .pf-note { margin-top: 24px; font-size: 13px; line-height: 1.7; color: rgba(90,79,67,.6); font-style: italic; }

  .pf-costpair { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; margin-top: 88px; align-items: start; }
  @media (max-width: 980px) { .pf-costpair { grid-template-columns: 1fr; gap: 40px; } }
  .pf-costcol { min-width: 0; }
  .pf-costcol .pf-split-cap { text-align: left; margin-bottom: 12px; }
  .pf-costcol .pf-split-desc { margin-bottom: 20px; max-width: none; }

  /* Section nav */
  .pf-snav { position: fixed; right: 28px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 16px; z-index: 50; }
  @media (max-width: 1300px) { .pf-snav { display: none; } }
  .pf-snav-btn { display: flex; align-items: center; gap: 9px; background: none; border: none; cursor: pointer; padding: 0; justify-content: flex-end; }
  .pf-snav-lbl { font-family: 'Work Sans', sans-serif; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .2em; color: #5C4033; opacity: 0; transition: opacity .18s ease; pointer-events: none; white-space: nowrap; }
  .pf-snav-btn:hover .pf-snav-lbl { opacity: 1; }
  .pf-snav-bar { width: 18px; height: 2px; border-radius: 1px; background: rgba(92,64,51,.22); transition: width .28s cubic-bezier(.22,1,.36,1), background .28s ease; flex-shrink: 0; }
  .pf-snav-btn:hover .pf-snav-bar { background: rgba(92,64,51,.5); width: 26px; }
  .pf-snav-btn.active .pf-snav-bar { width: 30px; background: #5C4033; }

  /* ===== ITEM 1: parameter boxes - uniform grid, 5 per row, single color ===== */
  .pf-params {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    margin-top: 26px;
  }
  @media (max-width: 900px) { .pf-params { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 560px) { .pf-params { grid-template-columns: repeat(2, 1fr); } }
  .pf-param {
    display: flex; align-items: center; justify-content: center; text-align: center;
    padding: 16px 14px; min-height: 64px;
    background: rgba(196,168,130,.18);
    border: 1px solid rgba(92,64,51,.28);
    border-radius: 4px;
    font-family: 'Work Sans', sans-serif; font-size: 13.5px; font-weight: 500;
    color: #453a2a; line-height: 1.3; letter-spacing: 0.01em;
    transition: background .3s ease, border-color .3s ease, transform .3s ease;
  }
  .pf-param:hover {
    background: rgba(196,168,130,.3);
    border-color: rgba(92,64,51,.45);
    transform: translateY(-2px);
  }

  /* ===== ITEM 6: segmented-pill toggle (replica of CasePreviewMaster StepIndicator) ===== */
  .pf-stepbar {
    position: sticky; top: 70px; z-index: 30;
    background: rgba(255,248,240,0.6);
    backdrop-filter: blur(28px) saturate(1.5);
    -webkit-backdrop-filter: blur(28px) saturate(1.5);
    padding: 12px 0;
  }
  .pf-stepbar-inner { max-width: 1320px; margin: 0 auto; padding: 0 60px; display: flex; }
  @media (max-width: 768px) { .pf-stepbar-inner { padding: 0 28px; } }
  @media (max-width: 480px) { .pf-stepbar-inner { padding: 0 20px; } }
  .pf-pill {
    position: relative; display: inline-flex;
    border-radius: 999px;
    border: 1px solid rgba(61,90,53,0.12);
    background: rgba(255,248,240,0.5);
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    padding: 3px;
    box-shadow: 0 2px 10px rgba(59,47,47,0.05);
  }
  .pf-pill-slider {
    position: absolute; top: 3px; bottom: 3px;
    border-radius: 999px;
    background: rgba(255,248,240,0.95);
    box-shadow: 0 1px 6px rgba(59,47,47,0.08);
    transition: left .35s cubic-bezier(.16,1,.3,1), width .35s cubic-bezier(.16,1,.3,1);
    pointer-events: none;
  }
  .pf-pill-btn {
    position: relative; z-index: 10;
    display: inline-flex; align-items: center; gap: 8px;
    border: none; background: none; cursor: pointer;
    border-radius: 999px; padding: 7px 20px;
    transition: all .3s;
  }
  .pf-pill-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: #3D5A35; flex-shrink: 0;
    animation: pf-dot-breathe 2.5s ease-in-out infinite;
  }
  .pf-pill-lbl {
    font-family: 'Work Sans', sans-serif;
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.2em; white-space: nowrap;
    color: rgba(92,64,51,0.35);
    transition: color .3s;
  }
  .pf-pill-btn.active .pf-pill-lbl { color: #3B2F2F; }
  @keyframes pf-dot-breathe {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: .55; transform: scale(.78); }
  }

  /* ===== ITEM 5: cheat sheet - dark/light brown mini-tables ===== */
  .pf-cs-grid {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 24px 20px; margin-top: 28px;
  }
  @media (max-width: 1100px) { .pf-cs-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px)  { .pf-cs-grid { grid-template-columns: 1fr; } }

  /* Per-block reveal: starts hidden, IntersectionObserver adds .visible with staggered data-delay */
  .pf-cs-block {
    display: flex; flex-direction: column;
    opacity: 0;
    transform: translateY(22px) scale(.97);
    filter: blur(4px);
    transition: opacity .75s cubic-bezier(.16,1,.3,1),
                transform .75s cubic-bezier(.16,1,.3,1),
                filter .6s ease;
  }
  .pf-cs-block.visible { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  @media (prefers-reduced-motion: reduce) { .pf-cs-block { transition: none; opacity: 1; transform: none; filter: none; } }

  .pf-cs-title {
    font-family: 'Newsreader', serif; font-size: 15px; font-weight: 600;
    color: #453a2a; text-align: center; margin-bottom: 8px; letter-spacing: -0.01em;
  }
  /* Table wrapper gives us border-radius + outer shadow without fighting border-collapse */
  .pf-cs-table-wrap {
    border-radius: 6px;
    border: 1px solid rgba(92,64,51,0.18);
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(92,64,51,0.07), 0 0 0 0 transparent;
    transition: box-shadow .3s ease;
  }
  .pf-cs-block:hover .pf-cs-table-wrap {
    box-shadow: 0 6px 22px rgba(92,64,51,0.13), 0 0 0 1px rgba(92,64,51,0.10);
  }
  .pf-cs-table {
    width: 100%; border-collapse: collapse;
  }
  .pf-cs-table tr { transition: background .22s ease; }
  .pf-cs-table tr:hover .pf-cs-val { background: rgba(196,168,130,0.34); }
  .pf-cs-key {
    background: #5C4033; color: #f0f5ee;
    font-family: 'Work Sans', sans-serif; font-size: 12px; font-weight: 500;
    padding: 9px 14px; text-align: left; white-space: nowrap;
    border-bottom: 1px solid rgba(240,245,238,0.12);
    width: 50%;
  }
  .pf-cs-val {
    background: rgba(196,168,130,0.18); color: #3B2F2F;
    font-family: 'Newsreader', serif; font-size: 14px; font-weight: 400;
    padding: 9px 14px; text-align: center; white-space: nowrap;
    border-bottom: 1px solid rgba(92,64,51,0.10);
    border-left: 1px solid rgba(92,64,51,0.10);
  }
  .pf-cs-table tr:last-child .pf-cs-key,
  .pf-cs-table tr:last-child .pf-cs-val { border-bottom: none; }

  /* Misc uses the same table structure - allow value text to wrap and left-align */
  .pf-cs-misc .pf-cs-val { white-space: normal; text-align: left; }
  .pf-cs-misc .pf-cs-key { white-space: nowrap; width: 1%; }

  /* Miscellaneous - sits in same row as GDP, spans remaining 3 columns */
  .pf-cs-misc { grid-column: span 3; }
  @media (max-width: 1100px) { .pf-cs-misc { grid-column: span 2; } }
  @media (max-width: 560px)  { .pf-cs-misc { grid-column: 1; } }
`

/* ─── Main component ─── */

export default function GuesstimateFramework() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [activeSection, setActiveSection] = useState('setup')
  const [, startTransition] = useTransition()

  useEffect(() => {
    const root = rootRef.current; if (!root) return
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        setTimeout(() => el.classList.add('visible'), parseInt(el.dataset.delay ?? '0', 10))
        io.unobserve(el)
      }),
      { threshold: 0.05, rootMargin: '0px 0px -18% 0px' },
    )
    root.querySelectorAll('.pf-reveal, .pf-q, .pf-cs-block').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const ACTIVATION_OFFSET = 0.30
    let raf = 0
    const compute = () => {
      raf = 0
      const line = window.innerHeight * ACTIVATION_OFFSET
      let bestId = NAV_SECTIONS[0].id
      let bestDist = Infinity
      for (const s of NAV_SECTIONS) {
        const el = document.getElementById(s.id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        const dist = line - top
        if (dist >= 0 && dist < bestDist) { bestDist = dist; bestId = s.id }
      }
      startTransition(() => setActiveSection(prev => prev === bestId ? prev : bestId))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    compute()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  /* Segmented-pill (Framework | Cheat Sheet) - replica of StepIndicator */
  const pillBtnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pillSlider, setPillSlider] = useState({ left: 3, width: 120 })
  const pillActive = activeSection === 'cheatsheet' ? 1 : 0
  useEffect(() => {
    const btn = pillBtnRefs.current[pillActive]
    if (!btn?.parentElement) return
    const containerLeft = btn.parentElement.getBoundingClientRect().left
    const r = btn.getBoundingClientRect()
    setPillSlider({ left: r.left - containerLeft, width: r.width })
  }, [pillActive])

  const PILL_STEPS = [
    { label: 'Framework',   target: 'setup' },
    { label: 'Cheat Sheet', target: 'cheatsheet' },
  ]

  return (
    <div ref={rootRef} className="pf-root">
      <style>{PAGE_CSS}</style>

      <nav className="pf-snav" aria-label="Page sections">
        {NAV_SECTIONS.map(s => (
          <button
            key={s.id}
            className={`pf-snav-btn${activeSection === s.id ? ' active' : ''}`}
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={`Go to ${s.label}`}
          >
            <span className="pf-snav-lbl">{s.label}</span>
            <span className="pf-snav-bar" />
          </button>
        ))}
      </nav>

      <div className="pf-crumb-bar">
        <Link href="/repository" className="pf-back-link">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <path d="M7 2L3.5 5.5L7 9" stroke="#5C4033" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Repository
        </Link>
      </div>

      <header className="pf-hero">
        <span className="pf-eyebrow pf-reveal" data-delay="0">Framework</span>
        <h1 className="pf-headline pf-reveal" data-delay="55">Guesstimate</h1>
      </header>

      {/* ITEM 6: walkthrough/drilldown-style segmented pill */}
      <div className="pf-stepbar">
        <div className="pf-stepbar-inner">
          <div className="pf-pill">
            <div
              className="pf-pill-slider"
              style={{ left: `${pillSlider.left}px`, width: `${pillSlider.width}px` }}
            />
            {PILL_STEPS.map((step, idx) => (
              <button
                key={step.target}
                ref={el => { pillBtnRefs.current[idx] = el }}
                type="button"
                className={`pf-pill-btn${pillActive === idx ? ' active' : ''}`}
                onClick={() => document.getElementById(step.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {pillActive === idx && <span className="pf-pill-dot" />}
                <span className="pf-pill-lbl">{step.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <main>
        {/* ── Section 1: The Setup ── */}
        <section id="setup" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">The Setup</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              What a typical guesstimate looks like
            </h2>

            <p className="pf-body pf-reveal" data-delay="110">
              Most Guesstimates require you to make an estimate of the number of people that would
              purchase a product/service and the footfall of particular locations or events.
              Guesstimates require you to be analytical, logical and concise. It is a type of question
              asked not just in case interviews but also in interviews as this is an indicator of your
              creativity and problem solving ability.
            </p>

            <p className="pf-body pf-reveal" data-delay="150" style={{ marginTop: 18 }}>
              Guesstimates can be asked in 2 ways. As a standalone estimate or as part of a market
              entry case. Keep in mind, it is not the final answer, but how you reach your final
              answer that matters.
            </p>

            <div className="pf-callout pf-reveal" data-delay="190">
              <p className="pf-callout-lbl">Example</p>
              <p className="pf-callout-txt">
                "Guesstimate the number of washing machines sold in a year"
              </p>
            </div>

            <p className="pf-body pf-reveal" data-delay="220">
              Important questions you can ask before you begin:
            </p>

            <ol className="pf-qlist" aria-label="Preliminary questions" style={{ marginTop: 28 }}>
              {[
                'Over what time period and in which location am I estimating this amount',
                'If you are estimating market size, clarify if you need to estimate it in terms of units sold or revenue generated',
                'Clarify the industry and price point in case you are unfamiliar to better arrive at the final answer',
              ].map((q, i) => (
                <li key={i} className="pf-q" data-delay={String(i * 75)}>
                  <span className="pf-qn">{i + 1}</span>
                  <span className="pf-qt">{q}</span>
                </li>
              ))}
            </ol>

            <p className="pf-note pf-reveal" data-delay="0">
              Note: To make things easier for you, ask the interviewer if you can assume a standard
              size product for the purpose of this case. For e.g. in the washing machine example,
              there are numerous price ranges and types of washing machines sold in India. Accounting
              for all of this would become really hard. Hence, assume an average price and a standard
              size washing machine to be the only type sold.
            </p>

            <p className="pf-body pf-reveal" data-delay="0" style={{ marginTop: 28 }}>
              There are two ways to begin a guesstimate - Demand-side or Supply-side.
            </p>
          </div>
        </section>

        {/* ── Section 2: Demand Side ── */}
        <section id="demand" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Approach A</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">Demand Side</h2>
            <p className="pf-body pf-reveal" data-delay="110">
              As the name suggests, you aim to estimate the total demand for the product/service
              assuming there are no supply side constraints. The starting point of most demand side
              approaches is the total population that have access to the product/service. Using
              various parameters, you eliminate parts of the population to arrive at your final
              answer.
            </p>
            <p className="pf-body pf-reveal" data-delay="150" style={{ marginTop: 18 }}>
              Parameters you can use while arriving at your estimate -
            </p>

            <div className="pf-params pf-reveal" data-delay="190">
              {[
                'Urban-Rural Split',
                'Income Segmentation',
                'Gender Split',
                'Age Divide',
                'Employed-Unemployed Split',
                'Formal-Informal Sector Split',
                'Digital Literacy Rate',
                'Household Size',
                'Literacy Rate',
                'Average No of Units Consumed / Person',
              ].map((label, i) => (
                <span key={i} className="pf-param">{label}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 3: Supply Side ── */}
        <section id="supply" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Approach B</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">Supply Side</h2>
            <p className="pf-body pf-reveal" data-delay="110">
              This method is generally preferred when you have a bottleneck i.e. supply side
              constraint. For e.g. Number of Burgers sold in McDonald's Outlet in CP. No matter what
              the demand is, the store can not make more number of burgers than its maximum capacity
              and hence there is a supply side constraint. Hence, we use the supply side approach.
            </p>
            <p className="pf-body pf-reveal" data-delay="150" style={{ marginTop: 18 }}>
              Important parameters you can use in supply side approaches -
            </p>

            <div className="pf-params pf-reveal" data-delay="190">
              {[
                'Maximum Capacity',
                'Number of Hours of Operation',
                'Peak and Non-Peak Hours',
                'Average Occupancy / Hour',
                'Number of Units / Consumer',
              ].map((label, i) => (
                <span key={i} className="pf-param">{label}</span>
              ))}
            </div>

            <p className="pf-note pf-reveal" data-delay="0">
              Note: Keep in mind, it is incredibly important to correctly identify whether to approach
              the problem through supply or demand side. An intuition that becomes better with more
              and more practice.
            </p>
          </div>
        </section>

        {/* ── Section 4: Physical Estimation ── */}
        <section id="physical" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Another Case Type</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">Physical Estimation</h2>
            <p className="pf-body pf-reveal" data-delay="110">
              In addition to market sizing guesstimates, cases related to physical estimation are also
              commonly asked. In these cases, the candidate would typically be required to estimate
              volumes, lengths, speeds, etc.
            </p>

            <div className="pf-callout pf-reveal" data-delay="150">
              <p className="pf-callout-lbl">Example</p>
              <p className="pf-callout-txt">
                "Guesstimate the number of Table Tennis balls that can fit inside an Airbus A320".
              </p>
            </div>

            <p className="pf-body pf-reveal" data-delay="190">
              In physical estimation, making an approximation might seem even more abstract at first.
              To solve this, you must use known or accurately measurable proxies to arrive at the
              overall figures. For instance, to estimate the size of an Airbus A320, you can consider
              the approximate size of a seat (based on your own body measurements) and extrapolate the
              size of the passenger cabin and then factor in other spaces such as the cockpit, luggage
              compartments and aisles.
            </p>

            <p className="pf-body pf-reveal" data-delay="220" style={{ marginTop: 18 }}>
              Some important sets of formulae and data which you would require in such cases -
            </p>

            <div className="pf-params pf-reveal" data-delay="260">
              {[
                'Volumes of Shapes',
                'Perimeters of Shapes',
                'Time, Speed & Distance',
                'Conversions of Foot, Yards, etc',
                'Consumption Rates of Common Items',
              ].map((label, i) => (
                <span key={i} className="pf-param">{label}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 5: Cheat Sheet ── */}
        <section id="cheatsheet" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Reference</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">Guesstimate Cheat Sheet</h2>

            <div className="pf-cs-grid">
              <CheatBlock title="Urban-Rural Split"   rows={[['Urban','35%'],['Rural','65%']]}                                                                         delay={0} />
              <CheatBlock title="Average Family Size" rows={[['Urban','4'],['Rural','4.5']]}                                                                            delay={40} />
              <CheatBlock title="Total Area"          rows={[['India','3.3m km'],['Delhi','1500 km']]}                                                                  delay={80} />
              <CheatBlock title="Gender Divide"       rows={[['Male','52%'],['Female','48%']]}                                                                          delay={120} />

              <CheatBlock title="Income Split"        rows={[['Elite','5%'],['UMC','20%'],['LMC','35%'],['BPL','40%']]}                                                 delay={160} />
              <CheatBlock title="Age Divide"          rows={[['0 - 18','30%'],['18 - 35','30%'],['35 - 60','30%'],['60 +','10%']]}                                      delay={200} />
              <CheatBlock title="Household Expenses"  rows={[['Food','45%'],['Travel','10%'],['Other','30%'],['Savings','15%']]}                                         delay={240} />
              <CheatBlock title="Religious Divide"    rows={[['Hindu','80%'],['Muslim','15%'],['Christian','2%'],['Other','3%']]}                                        delay={280} />

              <CheatBlock title="Unemployment"        rows={[['India','3%'],['Urban','5%'],['Rural','2%'],['Delhi','5%']]}                                               delay={320} />
              <CheatBlock title="Population Density"  rows={[['India','500/km²'],['Urban','900/km²'],['Rural','300/km²'],['Delhi','12000/km²']]}                        delay={360} />
              <CheatBlock title="Literacy Rate"       rows={[['India','80%'],['Urban','88%'],['Rural','77%'],['Delhi','90%']]}                                           delay={400} />
              <CheatBlock title="Land Use Split"      rows={[['Cultivation','45%'],['Forests','24%'],['Built Up','9%'],['Other','22%']]}                                 delay={440} />

              {/* Row 4: GDP + Misc side by side */}
              <CheatBlock title="GDP Size & Split"    rows={[['India','$4 Trillion'],['Primary','15%'],['Secondary','28%'],['Tertiary','57%']]}                          delay={480} />

              <div className="pf-cs-misc pf-cs-block" data-delay="520">
                <p className="pf-cs-title">Miscellaneous</p>
                <div className="pf-cs-table-wrap">
                  <table className="pf-cs-table">
                    <tbody>
                      <tr>
                        <td className="pf-cs-key">Employment</td>
                        <td className="pf-cs-val">12-88 split between formal/informal. Sectoral split is 43-25-32, order as given in the GDP data</td>
                      </tr>
                      <tr>
                        <td className="pf-cs-key">Locations</td>
                        <td className="pf-cs-val">6.4 lakh villages, 9000+ cities and 500 with &gt;1 lakh population, including 8 Tier-1 and 104 Tier-2 cities</td>
                      </tr>
                      <tr>
                        <td className="pf-cs-key">Digital</td>
                        <td className="pf-cs-val">47% Indians have smartphones, 958m active internet users (94% on mobile), rural now the larger share</td>
                      </tr>
                      <tr>
                        <td className="pf-cs-key">Banking</td>
                        <td className="pf-cs-val">89% Indians have accounts, UPI does 220b transactions per annum (600m a day), 1 billion active debit cards</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <p className="pf-note pf-reveal" data-delay="0">
              Note: India's population can be approximately taken as 147 crores. Do familiarize
              yourself with facts relating to your home state, hometown and college location. Ask the
              interviewer if your estimates are reasonable before proceeding. These are approximated
              estimates as of June, 2026.
            </p>
          </div>
        </section>
      </main>

      <div style={{ borderTop: '1px solid rgba(92,64,51,.1)' }}>
        <Footer currentPage="repository" />
      </div>
    </div>
  )
}

/* Small helper for cheat-sheet mini-tables (dark key / light value) */
function CheatBlock({ title, rows, delay = 0 }: { title: string; rows: [string, string][]; delay?: number }) {
  return (
    <div className="pf-cs-block" data-delay={String(delay)}>
      <p className="pf-cs-title">{title}</p>
      <div className="pf-cs-table-wrap">
        <table className="pf-cs-table">
          <tbody>
            {rows.map(([k, v], i) => (
              <tr key={i}>
                <td className="pf-cs-key">{k}</td>
                <td className="pf-cs-val">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

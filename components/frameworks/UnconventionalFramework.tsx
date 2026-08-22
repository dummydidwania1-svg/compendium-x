'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Footer from '@/components/dashboard/Footer'

/* ─── Section nav ─── */

const NAV_SECTIONS = [
  { id: 'setup', label: 'The Setup' },
  { id: 'cases', label: 'Common Cases' },
]

/* ─── Page CSS ─── */
/* Copied verbatim from ProfitabilityFramework.tsx base, with flow-chain CSS appended */

const PAGE_CSS = `
  .pf-root {
    font-family: var(--font-work-sans), 'Work Sans', sans-serif;
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
    font-family: var(--font-newsreader), 'Newsreader', serif;
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
    font-family: var(--font-newsreader), 'Newsreader', serif; font-size: clamp(22px, 3vw, 30px);
    font-weight: 300; color: #453a2a; letter-spacing: -.01em; line-height: 1.25; margin-bottom: 22px;
  }

  .pf-body { font-size: 15px; line-height: 1.9; color: #5a4f43; max-width: 760px; }

  /* Callout */
  .pf-callout { border-left: 2px solid #5C4033; padding: 18px 22px; background: rgba(92,64,51,.03); margin-bottom: 32px; }
  .pf-callout-lbl { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .26em; color: rgba(92,64,51,.5); margin-bottom: 8px; }
  .pf-callout-txt { font-family: var(--font-newsreader), 'Newsreader', serif; font-size: 18px; font-style: italic; font-weight: 300; color: #453a2a; line-height: 1.6; }

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
  .pf-qn { font-family: var(--font-newsreader), 'Newsreader', serif; font-size: 13px; font-weight: 300; color: rgba(92,64,51,.38); min-width: 22px; flex-shrink: 0; padding-top: 2px; }
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

  .pf-lenses {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; align-items: stretch;
    margin-top: 4px; border-top: 1px solid rgba(92,64,51,.16);
  }
  @media (max-width: 760px) { .pf-lenses { grid-template-columns: 1fr; border-top: none; } }
  .pf-lens {
    display: flex; flex-direction: column; padding: 26px 28px 8px; background: transparent;
    border-left: 1px solid rgba(92,64,51,.10); transition: background .3s ease;
  }
  .pf-lens:first-child { border-left: none; padding-left: 0; }
  .pf-lens:hover { background: rgba(92,64,51,.02); }
  @media (max-width: 760px) {
    .pf-lens { border-left: none; border-top: 1px solid rgba(92,64,51,.12); padding: 24px 0 4px; }
    .pf-lens:first-child { border-top: none; padding-top: 8px; }
  }
  .pf-lens-ey { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .24em; color: rgba(92,64,51,.5); margin-bottom: 12px; }
  .pf-lens-h { font-family: var(--font-newsreader), 'Newsreader', serif; font-size: 19px; font-weight: 300; color: #453a2a; line-height: 1.25; letter-spacing: -.01em; margin: 0 0 18px; min-height: 48px; }
  .pf-lens-list { list-style: none; margin: 0; padding: 0; }
  .pf-lens-list li { font-size: 14px; line-height: 1.5; color: #5a4f43; padding: 8px 0 8px 18px; position: relative; }
  .pf-lens-list li::before { content: ''; position: absolute; left: 0; top: .82em; width: 8px; height: 1px; background: rgba(92,64,51,.42); }
  .pf-lens-eq { margin: 14px 0 0; padding-left: 18px; font-family: var(--font-newsreader), 'Newsreader', serif; font-style: italic; font-weight: 300; font-size: 13.5px; color: rgba(69,58,42,.7); line-height: 1.45; }
  .pf-lenses-foot { margin-top: 34px; padding-top: 22px; border-top: 1px solid rgba(92,64,51,.10); text-align: center; font-family: var(--font-newsreader), 'Newsreader', serif; font-style: italic; font-weight: 300; font-size: 15px; color: rgba(90,79,67,.72); }

  .pf-costpair { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; margin-top: 88px; align-items: start; }
  @media (max-width: 980px) { .pf-costpair { grid-template-columns: 1fr; gap: 40px; } }
  .pf-costcol { min-width: 0; }
  .pf-costcol .pf-split-cap { text-align: left; margin-bottom: 12px; }
  .pf-costcol .pf-split-desc { margin-bottom: 20px; max-width: none; }

  /* Section nav */
  .pf-snav { position: fixed; right: 28px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 16px; z-index: 50; }
  @media (max-width: 1300px) { .pf-snav { display: none; } }
  .pf-snav-btn { display: flex; align-items: center; gap: 9px; background: none; border: none; cursor: pointer; padding: 0; justify-content: flex-end; }
  .pf-snav-lbl { font-family: var(--font-work-sans), 'Work Sans', sans-serif; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .2em; color: #5C4033; opacity: 0; transition: opacity .18s ease; pointer-events: none; white-space: nowrap; }
  .pf-snav-btn:hover .pf-snav-lbl { opacity: 1; }
  .pf-snav-bar { width: 18px; height: 2px; border-radius: 1px; background: rgba(92,64,51,.22); transition: width .28s cubic-bezier(.22,1,.36,1), background .28s ease; flex-shrink: 0; }
  .pf-snav-btn:hover .pf-snav-bar { background: rgba(92,64,51,.5); width: 26px; }
  .pf-snav-btn.active .pf-snav-bar { width: 30px; background: #5C4033; }

  /* Unconventional flow chains (sequential boxes joined by connector lines) */
  .pf-flowblock { margin-top: 72px; }
  .pf-flowblock:first-of-type { margin-top: 40px; }
  .pf-flow-cap {
    font-family: var(--font-newsreader), 'Newsreader', serif; font-size: 19px; font-weight: 300;
    color: #453a2a; line-height: 1.4; margin-bottom: 6px;
  }
  .pf-flow-desc {
    font-size: 14px; line-height: 1.7; color: #5a4f43; margin-bottom: 22px; max-width: 760px;
  }
  .pf-flow {
    display: flex; align-items: stretch; flex-wrap: wrap; gap: 0;
  }
  .pf-flow-node {
    flex: 1 1 0; min-width: 132px;
    display: flex; align-items: center; justify-content: center; text-align: center;
    padding: 16px 18px; min-height: 56px;
    background: rgba(196,168,130,.18);
    border: 1px solid rgba(92,64,51,.28);
    border-radius: 4px;
    font-family: var(--font-work-sans), 'Work Sans', sans-serif; font-size: 13.5px; font-weight: 500;
    color: #453a2a; line-height: 1.3;
    transition: background .3s ease, border-color .3s ease, transform .3s ease;
  }
  .pf-flow-node:hover {
    background: rgba(196,168,130,.3);
    border-color: rgba(92,64,51,.45);
    transform: translateY(-2px);
  }
  .pf-flow-link {
    flex: 0 0 32px; align-self: center;
    height: 1px; background: rgba(92,64,51,.4);
  }
  @media (max-width: 760px) {
    .pf-flow { flex-direction: column; gap: 0; }
    .pf-flow-node { width: 100%; min-width: 0; }
    .pf-flow-link { width: 1px; height: 24px; flex-basis: 24px; align-self: center; }
  }
`

/* ─── Main component ─── */

export default function UnconventionalFramework() {
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
    root.querySelectorAll('.pf-reveal, .pf-q').forEach(el => io.observe(el))
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
        <h1 className="pf-headline pf-reveal" data-delay="55">Unconventional</h1>
      </header>

      <main>
        {/* ── Section 1: The Setup ── */}
        <section id="setup" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">The Setup</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              When a case fits no framework
            </h2>

            <p className="pf-body pf-reveal" data-delay="110">
              Unconventional cases generally can not be fit into any of the frameworks we have studied
              so far. These cases are generally open-ended and have multiple ways of being structured.
              Most unconventional cases do not have a particular solution like profitability cases do.
            </p>

            <div className="pf-callout pf-reveal" data-delay="150">
              <p className="pf-callout-lbl">Example prompt</p>
              <p className="pf-callout-txt">
                "You are required to improve the literacy rate of your state."
              </p>
            </div>

            <p className="pf-body pf-reveal" data-delay="190">
              As you can see, this case focuses on how creative you can be and how broad your framework
              can be to incorporate maximum points. There is no one solution in this case.
            </p>

            <p className="pf-body pf-reveal" data-delay="220" style={{ marginTop: 40 }}>
              Things to keep in mind in unconventional cases:
            </p>

            <ol className="pf-qlist" aria-label="Things to keep in mind" style={{ marginTop: 28 }}>
              {[
                'Try to break the problem into a mathematical formula whenever possible.',
                'Aim at looking at the problem in 2 ways: quantitatively and qualitatively.',
                'If the case is really broad, try asking the interviewer if you can focus on only the most important bucket.',
                'Bucketing helps massively in unconventional cases.',
                'Never begin an unconventional case structure without ensuring you are familiar with the problem or the industry; ambiguity can be your biggest enemy.',
              ].map((q, i) => (
                <li key={i} className="pf-q" data-delay={String(i * 75)}>
                  <span className="pf-qn">{i + 1}</span>
                  <span className="pf-qt">{q}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Section 2: Common Cases (three flow chains) ── */}
        <section id="cases" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Common Cases</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              Some examples and how you can approach them
            </h2>

            {/* A) Journey / time-related */}
            <div className="pf-flowblock pf-reveal" data-delay="110">
              <p className="pf-flow-cap">A · Journey or time-related problems</p>
              <p className="pf-flow-desc">
                Calculate the total time taken at each step of the journey to isolate the problem.
              </p>
              <div className="pf-flow">
                <span className="pf-flow-node">Start Point</span>
                <span className="pf-flow-link" aria-hidden="true" />
                <span className="pf-flow-node">Travel</span>
                <span className="pf-flow-link" aria-hidden="true" />
                <span className="pf-flow-node">End Point</span>
              </div>
            </div>

            {/* B) Process-related with a goal */}
            <div className="pf-flowblock pf-reveal" data-delay="0">
              <p className="pf-flow-cap">B · Process-related problems with regards to a particular goal</p>
              <p className="pf-flow-desc">
                For example, help India win the next Cricket World Cup.
              </p>
              <div className="pf-flow">
                <span className="pf-flow-node">Pre</span>
                <span className="pf-flow-link" aria-hidden="true" />
                <span className="pf-flow-node">During</span>
                <span className="pf-flow-link" aria-hidden="true" />
                <span className="pf-flow-node">Post</span>
              </div>
            </div>

            {/* C) Increasing footfall */}
            <div className="pf-flowblock pf-reveal" data-delay="0">
              <p className="pf-flow-cap">C · Increasing footfall at a particular event</p>
              <p className="pf-flow-desc">
                For example, increase the footfall of a concert in Delhi.
              </p>
              <div className="pf-flow pf-flow-4">
                <span className="pf-flow-node">Population</span>
                <span className="pf-flow-link" aria-hidden="true" />
                <span className="pf-flow-node">% that are aware</span>
                <span className="pf-flow-link" aria-hidden="true" />
                <span className="pf-flow-node">% that can come</span>
                <span className="pf-flow-link" aria-hidden="true" />
                <span className="pf-flow-node">% that want to come</span>
              </div>
            </div>

            <p className="pf-note pf-reveal" data-delay="0">
              Keep in mind, these are suggestive and have to be modified depending on the case. The best
              way to improve is to keep practicing.
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

'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Footer from '@/components/dashboard/Footer'
import { AdditionalFrameworkPanel, type FrameworkTree } from '@/components/case/CasePreviewMaster'

/* ─── Tree data ─── */

const GROWTH_TREE_FW: FrameworkTree = {
  nodes: {
    growth:    { id: 'growth',    label: 'Growth',    tone: 'root',   children: ['organic', 'inorganic'] },
    organic:   { id: 'organic',   label: 'Organic',   tone: 'branch', children: [] },
    inorganic: { id: 'inorganic', label: 'Inorganic', tone: 'branch', children: [] },
  },
  defaultExpanded: ['growth'],
  defaultFocusedId: 'growth',
  notes: [],
}

const ORGANIC_TREE_FW: FrameworkTree = {
  nodes: {
    organic:    { id: 'organic',    label: 'Organic',               tone: 'root',   children: ['numCust', 'revPerCust'] },
    numCust:    { id: 'numCust',    label: 'No. of\nCustomers',     tone: 'branch', children: [] },
    revPerCust: { id: 'revPerCust', label: 'Revenue per\nCustomer', tone: 'branch', children: [] },
  },
  defaultExpanded: ['organic'],
  defaultFocusedId: 'organic',
  notes: [],
}

const NUM_CUSTOMERS_TREE_FW: FrameworkTree = {
  nodes: {
    numCust:      { id: 'numCust',      label: 'No. of Customers',   tone: 'root',   children: ['existing', 'newCh'] },
    existing:     { id: 'existing',     label: 'Existing\nChannels', tone: 'branch', children: ['supply', 'distribution', 'demand'] },
    newCh:        { id: 'newCh',        label: 'New\nChannels',      tone: 'branch', children: ['segments', 'geographies', 'revStreams'] },
    supply:       { id: 'supply',       label: 'Supply',             tone: 'leaf',   children: [] },
    distribution: { id: 'distribution', label: 'Distribution',       tone: 'leaf',   children: [] },
    demand:       { id: 'demand',       label: 'Demand',             tone: 'leaf',   children: [] },
    segments:     { id: 'segments',     label: 'Customer\nSegments', tone: 'leaf',   children: [] },
    geographies:  { id: 'geographies',  label: 'Geographies',        tone: 'leaf',   children: [] },
    revStreams:    { id: 'revStreams',   label: 'Revenue\nStreams',   tone: 'leaf',   children: [] },
  },
  defaultExpanded: ['numCust', 'existing', 'newCh'],
  defaultFocusedId: 'numCust',
  notes: [],
}

const REV_PER_CUSTOMER_TREE_FW: FrameworkTree = {
  nodes: {
    revPerCust: { id: 'revPerCust', label: 'Revenue per Customer', tone: 'root',   children: ['price', 'lifespan', 'crossSell', 'promotions'] },
    price:      { id: 'price',      label: 'Price\nCharged',       tone: 'branch', children: [] },
    lifespan:   { id: 'lifespan',   label: 'Life Span\n/ Usage',   tone: 'branch', children: [] },
    crossSell:  { id: 'crossSell',  label: 'Cross-\nSelling',      tone: 'branch', children: [] },
    promotions: { id: 'promotions', label: 'Promotions',           tone: 'branch', children: [] },
  },
  defaultExpanded: ['revPerCust'],
  defaultFocusedId: 'revPerCust',
  notes: [],
}

const INORGANIC_TREE_FW: FrameworkTree = {
  nodes: {
    inorganic: { id: 'inorganic', label: 'Inorganic',               tone: 'root',   children: ['jv', 'ma'] },
    jv:        { id: 'jv',        label: 'Joint\nVentures',         tone: 'branch', children: [] },
    ma:        { id: 'ma',        label: 'Mergers &\nAcquisitions', tone: 'branch', children: [] },
  },
  defaultExpanded: ['inorganic'],
  defaultFocusedId: 'inorganic',
  notes: [],
}

/* ─── Section nav ─── */

const NAV_SECTIONS = [
  { id: 'setup',     label: 'The Setup' },
  { id: 'organic',   label: 'Organic' },
  { id: 'inorganic', label: 'Inorganic' },
]

/* ─── Page CSS ─── */
/* Copied verbatim from ProfitabilityFramework.tsx */

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

  /* Edit 5a: wider body, more line-height */
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
  /* Edit 5a: larger desc text */
  .pf-split-desc { font-size: 15px; line-height: 1.95; color: #5a4f43; max-width: 340px; }
  /* Edit 1: no scrollbars */
  .pf-split-chart { min-width: 0; overflow: visible; }

  /* Italic note */
  .pf-note { margin-top: 24px; font-size: 13px; line-height: 1.7; color: rgba(90,79,67,.6); font-style: italic; }

  /* Demand lenses -- open, airy, consistent with the page (Edit R6) */
  .pf-lenses {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    align-items: stretch;
    margin-top: 4px;
    border-top: 1px solid rgba(92,64,51,.16);
  }
  @media (max-width: 760px) {
    .pf-lenses { grid-template-columns: 1fr; border-top: none; }
  }

  .pf-lens {
    display: flex; flex-direction: column;
    padding: 26px 28px 8px;
    background: transparent;
    border-left: 1px solid rgba(92,64,51,.10);
    transition: background .3s ease;
  }
  .pf-lens:first-child { border-left: none; padding-left: 0; }
  .pf-lens:hover { background: rgba(92,64,51,.02); }
  @media (max-width: 760px) {
    .pf-lens {
      border-left: none;
      border-top: 1px solid rgba(92,64,51,.12);
      padding: 24px 0 4px;
    }
    .pf-lens:first-child { border-top: none; padding-top: 8px; }
  }

  .pf-lens-ey {
    font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .24em;
    color: rgba(92,64,51,.5); margin-bottom: 12px;
  }
  .pf-lens-h {
    font-family: 'Newsreader', serif; font-size: 19px; font-weight: 300;
    color: #453a2a; line-height: 1.25; letter-spacing: -.01em;
    margin: 0 0 18px; min-height: 48px;
  }
  .pf-lens-list { list-style: none; margin: 0; padding: 0; }
  .pf-lens-list li {
    font-size: 14px; line-height: 1.5; color: #5a4f43;
    padding: 8px 0 8px 18px; position: relative;
  }
  .pf-lens-list li::before {
    content: ''; position: absolute; left: 0; top: .82em;
    width: 8px; height: 1px; background: rgba(92,64,51,.42);
  }
  .pf-lens-eq {
    margin: 14px 0 0; padding-left: 18px;
    font-family: 'Newsreader', serif; font-style: italic; font-weight: 300;
    font-size: 13.5px; color: rgba(69,58,42,.7); line-height: 1.45;
  }
  .pf-lenses-foot {
    margin-top: 34px; padding-top: 22px;
    border-top: 1px solid rgba(92,64,51,.10);
    text-align: center;
    font-family: 'Newsreader', serif; font-style: italic; font-weight: 300;
    font-size: 15px; color: rgba(90,79,67,.72);
  }

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

  /* R26: full-width tree block (caption on top, chart spans full width) -- used
     only for the Number of Customers tree so its two expanded branches have room
     to lay out horizontally without colliding. */
  .pf-wideblock { margin-top: 96px; }
  /* R27: head left-aligned with the section text above; description flows full
     width to the right (aligns with the last flowchart node), tree sits below. */
  .pf-wideblock .pf-wideblock-head { max-width: 100%; margin: 0 0 36px; text-align: left; }
  .pf-wideblock .pf-split-cap { text-align: left; margin-bottom: 14px; }
  .pf-wideblock .pf-split-desc { max-width: 100%; margin: 0; }
  .pf-wideblock .pf-split-chart { min-width: 0; overflow: visible; width: 100%; }
  @media (max-width: 980px) { .pf-wideblock { margin-top: 48px; } }
`

/* ─── Main component ─── */

export default function GrowthFramework() {
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

      {/* Back-link: left edge of screen, matching case-preview pages */}
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
        <h1 className="pf-headline pf-reveal" data-delay="55">Growth</h1>
      </header>

      <main>
        {/* ── Section 1: The Setup ── */}
        <section id="setup" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">The Setup</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              What a typical prompt looks like
            </h2>

            <div className="pf-callout pf-reveal" data-delay="110">
              <p className="pf-callout-lbl">Example prompt</p>
              <p className="pf-callout-txt">
                "You need to increase your client's revenue by 40% in the next 2 years."
              </p>
            </div>

            <p className="pf-body pf-reveal" data-delay="150">
              It is important to understand the problem better by asking some preliminary questions.
              Some important questions are:
            </p>

            <ol className="pf-qlist" aria-label="Preliminary questions" style={{ marginTop: 28 }}>
              {[
                'Understand the company: geography, products, customers, value chain.',
                'The objective behind targeting growth.',
                'Current growth rate of the company.',
                'Current growth rate of the industry.',
                'Timeline to achieve this growth if not given in the statement.',
                'Any budgetary constraints to be kept in mind while solving the case.',
                'Keep checking operational feasibility at every stage: are our current plants capable of meeting the increased demand?',
              ].map((q, i) => (
                <li key={i} className="pf-q" data-delay={String(i * 75)}>
                  <span className="pf-qn">{i + 1}</span>
                  <span className="pf-qt">{q}</span>
                </li>
              ))}
            </ol>

            <p className="pf-body pf-reveal" data-delay="0" style={{ marginTop: 40 }}>
              Let us look at the different ways of increasing revenues. The methods can be broadly
              divided into organic means and inorganic means.
            </p>

            <div className="pf-split pf-reveal" data-delay="110" style={{ marginTop: 72 }}>
              <aside className="pf-split-text">
                <p className="pf-split-cap">The starting framework</p>
                <p className="pf-split-desc">
                  Growth splits into two broad routes: organic means (growing the existing business)
                  and inorganic means (growing through deals).
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={GROWTH_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 2: Organic ── */}
        <section id="organic" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Organic Means</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              Grow the customers and the revenue per customer
            </h2>
            <p className="pf-body pf-reveal" data-delay="110">
              Organic means can be divided into the number of customers and the revenue per customer.
            </p>

            {/* Organic decomposition */}
            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Organic decomposition</p>
                <p className="pf-split-desc">
                  The two levers of organic growth are the number of customers and the revenue earned
                  per customer.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={ORGANIC_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>

            {/* Number of customers -- full-width so both expanded branches fit horizontally (R26) */}
            <div className="pf-wideblock pf-reveal" data-delay="0">
              <div className="pf-wideblock-head">
                <p className="pf-split-cap">Number of customers</p>
                <p className="pf-split-desc">
                  Growth via existing channels covers supply (capacity), distribution (online or
                  offline, number of distributors and amount sold per distributor) and demand
                  (improving the quality of current services). Growth via new channels covers new
                  customer segments, new geographies and new revenue streams.
                </p>
              </div>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={NUM_CUSTOMERS_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>

            {/* Revenue per customer (a lever of organic growth) */}
            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Revenue per customer</p>
                <p className="pf-split-desc">
                  The other lever of organic growth. Four sub-levers raise the value of each
                  customer: the price charged, the life span or usage of the product, cross-selling,
                  and promotions such as loyalty programs and bulk discounts.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={REV_PER_CUSTOMER_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 4: Inorganic ── */}
        <section id="inorganic" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Inorganic Means</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              Grow through joint ventures and acquisitions
            </h2>
            <p className="pf-body pf-reveal" data-delay="110">
              Inorganic means include joint ventures, mergers and acquisitions. Points to note under
              these are the criteria for shortlisting companies, identifying key geographies to expand
              to via mergers and acquisitions, and the timeline for the proposed increase.
            </p>

            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Inorganic decomposition</p>
                <p className="pf-split-desc">
                  Inorganic growth comes through joint ventures and through mergers and acquisitions.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={INORGANIC_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>

            <ol className="pf-qlist" aria-label="Points to note" style={{ marginTop: 40 }}>
              {[
                'Criteria for shortlisting companies.',
                'Identifying key geographies to expand to via mergers and acquisitions.',
                'Timeline for the proposed increase.',
              ].map((q, i) => (
                <li key={i} className="pf-q" data-delay={String(i * 75)}>
                  <span className="pf-qn">{i + 1}</span>
                  <span className="pf-qt">{q}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <div style={{ borderTop: '1px solid rgba(92,64,51,.1)' }}>
        <Footer currentPage="repository" />
      </div>
    </div>
  )
}

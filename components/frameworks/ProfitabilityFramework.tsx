'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Footer from '@/components/dashboard/Footer'
import { AdditionalFrameworkPanel, type FrameworkTree } from '@/components/case/CasePreviewMaster'

/* ─── Tree data ─── */

const PROFIT_TREE_FW: FrameworkTree = {
  nodes: {
    profit:  { id: 'profit',  label: 'Profit',  tone: 'root',   children: ['revenue', 'cost'] },
    revenue: { id: 'revenue', label: 'Revenue', tone: 'branch', children: [] },
    cost:    { id: 'cost',    label: 'Cost',    tone: 'branch', children: [] },
  },
  defaultExpanded: ['profit'],
  defaultFocusedId: 'profit',
  notes: [],
}

const REVENUE_TREE_FW: FrameworkTree = {
  nodes: {
    revenue:       { id: 'revenue',       label: 'Revenue',            tone: 'root',   children: ['units', 'price'] },
    units:         { id: 'units',         label: 'No. of\nUnits Sold', tone: 'branch', children: ['rProduction', 'rDistribution', 'rDemand'] },
    price:         { id: 'price',         label: 'Price / Unit',       tone: 'branch', children: [] },
    rProduction:   { id: 'rProduction',   label: 'Production',         tone: 'leaf',   children: [] },
    rDistribution: { id: 'rDistribution', label: 'Distribution',       tone: 'leaf',   children: [] },
    rDemand:       { id: 'rDemand',       label: 'Demand',             tone: 'leaf',   children: [] },
  },
  defaultExpanded: ['revenue', 'units'],
  defaultFocusedId: 'revenue',
  notes: [],
}

const COST_TREE_FW: FrameworkTree = {
  nodes: {
    cost:        { id: 'cost',        label: 'Cost',                 tone: 'root',   children: ['numUnits', 'costPerUnit'] },
    numUnits:    { id: 'numUnits',    label: 'No. of\nUnits',        tone: 'branch', children: [] },
    costPerUnit: { id: 'costPerUnit', label: 'Cost / Unit',          tone: 'branch', children: ['fixed', 'variable'] },
    fixed:       { id: 'fixed',       label: 'Fixed Cost\n/ Unit',   tone: 'leaf',   children: [] },
    variable:    { id: 'variable',    label: 'Variable Cost\n/ Unit', tone: 'leaf',   children: [] },
  },
  defaultExpanded: ['cost', 'costPerUnit'],
  defaultFocusedId: 'cost',
  notes: [],
}

const PRODUCTION_TREE_FW: FrameworkTree = {
  nodes: {
    production: { id: 'production', label: 'Production',       tone: 'root', children: ['mfgUnits', 'unitCap', 'capUsed', 'defects'] },
    mfgUnits:   { id: 'mfgUnits',   label: 'No. of mfg.\nunits', tone: 'leaf', children: [] },
    unitCap:    { id: 'unitCap',    label: 'Capacity per\nunit',  tone: 'leaf', children: [] },
    capUsed:    { id: 'capUsed',    label: 'Capacity\nutilised',  tone: 'leaf', children: [] },
    defects:    { id: 'defects',    label: 'Defect\nrate',        tone: 'leaf', children: [] },
  },
  defaultExpanded: ['production'],
  defaultFocusedId: 'production',
  notes: [],
}

const DISTRIBUTION_TREE_FW: FrameworkTree = {
  nodes: {
    distribution: { id: 'distribution', label: 'Distribution',        tone: 'root', children: ['numDist', 'soldPerDist'] },
    numDist:      { id: 'numDist',      label: 'No. of\ndistributors', tone: 'leaf', children: [] },
    soldPerDist:  { id: 'soldPerDist',  label: 'Sold per\ndistributor', tone: 'leaf', children: [] },
  },
  defaultExpanded: ['distribution'],
  defaultFocusedId: 'distribution',
  notes: [],
}

const FIXED_COST_TREE_FW: FrameworkTree = {
  nodes: {
    fixed:         { id: 'fixed',         label: 'Fixed Cost\n/ Unit', tone: 'root', children: ['land', 'building', 'salariesFixed', 'equipment', 'furniture', 'machinery', 'warehouses', 'fixedCharges'] },
    land:          { id: 'land',          label: 'Land',               tone: 'leaf', children: [] },
    building:      { id: 'building',      label: 'Building',           tone: 'leaf', children: [] },
    salariesFixed: { id: 'salariesFixed', label: 'Salary',             tone: 'leaf', children: [] },
    equipment:     { id: 'equipment',     label: 'Equipment',          tone: 'leaf', children: [] },
    furniture:     { id: 'furniture',     label: 'Furniture',          tone: 'leaf', children: [] },
    machinery:     { id: 'machinery',     label: 'Machinery',          tone: 'leaf', children: [] },
    warehouses:    { id: 'warehouses',    label: 'Warehouses',         tone: 'leaf', children: [] },
    fixedCharges:  { id: 'fixedCharges',  label: 'Fixed\ncharges',     tone: 'leaf', children: [] },
  },
  defaultExpanded: ['fixed'],
  defaultFocusedId: 'fixed',
  notes: [],
}

const VARIABLE_COST_TREE_FW: FrameworkTree = {
  nodes: {
    variable:       { id: 'variable',       label: 'Variable Cost\n/ Unit', tone: 'root', children: ['rawMaterial', 'transportation', 'processing', 'packaging', 'storage', 'distributionV', 'marketingV', 'afterSales'] },
    rawMaterial:    { id: 'rawMaterial',    label: 'Raw material',          tone: 'leaf', children: [] },
    transportation: { id: 'transportation', label: 'Transportation',         tone: 'leaf', children: [] },
    processing:     { id: 'processing',     label: 'Processing',             tone: 'leaf', children: [] },
    packaging:      { id: 'packaging',      label: 'Packaging',              tone: 'leaf', children: [] },
    storage:        { id: 'storage',        label: 'Storage',                tone: 'leaf', children: [] },
    distributionV:  { id: 'distributionV',  label: 'Distribution',           tone: 'leaf', children: [] },
    marketingV:     { id: 'marketingV',     label: 'Marketing',              tone: 'leaf', children: [] },
    afterSales:     { id: 'afterSales',     label: 'After-sales',            tone: 'leaf', children: [] },
  },
  defaultExpanded: ['variable'],
  defaultFocusedId: 'variable',
  notes: [],
}

/* ─── Section nav ─── */

const NAV_SECTIONS = [
  { id: 'setup',   label: 'The Setup' },
  { id: 'core',    label: 'Big Picture' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'cost',    label: 'Cost' },
]

/* ─── Page CSS ─── */

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

  /* Edit 5a: wider body, more line-height */
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
    font-family: var(--font-newsreader), 'Newsreader', serif; font-size: 19px; font-weight: 300;
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
    font-family: var(--font-newsreader), 'Newsreader', serif; font-style: italic; font-weight: 300;
    font-size: 13.5px; color: rgba(69,58,42,.7); line-height: 1.45;
  }
  .pf-lenses-foot {
    margin-top: 34px; padding-top: 22px;
    border-top: 1px solid rgba(92,64,51,.10);
    text-align: center;
    font-family: var(--font-newsreader), 'Newsreader', serif; font-style: italic; font-weight: 300;
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
  .pf-snav-lbl { font-family: var(--font-work-sans), 'Work Sans', sans-serif; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .2em; color: #5C4033; opacity: 0; transition: opacity .18s ease; pointer-events: none; white-space: nowrap; }
  .pf-snav-btn:hover .pf-snav-lbl { opacity: 1; }
  .pf-snav-bar { width: 18px; height: 2px; border-radius: 1px; background: rgba(92,64,51,.22); transition: width .28s cubic-bezier(.22,1,.36,1), background .28s ease; flex-shrink: 0; }
  .pf-snav-btn:hover .pf-snav-bar { background: rgba(92,64,51,.5); width: 26px; }
  .pf-snav-btn.active .pf-snav-bar { width: 30px; background: #5C4033; }
`

/* ─── Main component ─── */

export default function ProfitabilityFramework() {
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
        <h1 className="pf-headline pf-reveal" data-delay="55">Profitability</h1>
      </header>

      <main>
        {/* Section 1: The Setup (book copy, Edit 3c) */}
        <section id="setup" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">The Setup</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              What a typical prompt looks like
            </h2>

            <div className="pf-callout pf-reveal" data-delay="110">
              <p className="pf-callout-lbl">Example prompt</p>
              <p className="pf-callout-txt">
                "Your profits are down by 20%, analyse the reason for the same by isolating the problem."
              </p>
            </div>

            <p className="pf-body pf-reveal" data-delay="150">
              It is important to begin by understanding the problem better by asking some preliminary
              questions for profitability cases, such as:
            </p>

            <ol className="pf-qlist" aria-label="Preliminary questions" style={{ marginTop: 28 }}>
              {[
                'Since when has the client been facing the problem and what is the magnitude of the decline?',
                'Where is the client located, geographically?',
                'Which part of the value chain does our client lie in?',
                'Is it a company-specific or an industry-wide problem?',
                'Segmentation questions: All stores? All geographies? All product lines? All customers?',
              ].map((q, i) => (
                <li key={i} className="pf-q" data-delay={String(i * 75)}>
                  <span className="pf-qn">{i + 1}</span>
                  <span className="pf-qt">{q}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Section 2: The Big Picture ── */}
        <section id="core" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">The Big Picture</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              The problem stems from revenue, cost, or both
            </h2>

            <div className="pf-split pf-reveal" data-delay="110">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Profit decomposition</p>
                <p className="pf-split-desc">
                  Split profit into its two levers and isolate which side is driving the decline.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={PROFIT_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 3: Revenue ── */}
        <section id="revenue" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Revenue Analysis</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              Revenue is volume times price
            </h2>
            <p className="pf-body pf-reveal" data-delay="110">
              Revenue side can be affected by production, distribution and demand.
            </p>

            {/* Revenue decomposition */}
            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Revenue decomposition</p>
                <p className="pf-split-desc">
                  Revenue = units sold × price per unit. Units sold is the lever that breaks down further.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={REVENUE_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>

            {/* Production */}
            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Production drivers</p>
                <p className="pf-split-desc">
                  Production can be analysed by looking at the following factors:
                  number of manufacturing units, capacity of each unit, production
                  capacity used, and defects in the manufactured goods.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={PRODUCTION_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>

            {/* Distribution */}
            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Distribution drivers</p>
                <p className="pf-split-desc">
                  Distribution can be analysed by looking at the following factors.
                  Begin by asking the mode of distribution adopted by our client and
                  benchmark it with competitors: number of distributors, and amount
                  sold per distributor (which can be affected by monetary and
                  non-monetary reasons).
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={DISTRIBUTION_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>

            {/* Demand: book-style text (Edit 3c) */}
            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Demand drivers</p>
                <p className="pf-split-desc">
                  Demand can be analysed by looking at the following factors.
                  Begin by understanding whether all revenue streams have been
                  affected equally.
                </p>
              </aside>
              <div className="pf-split-chart">
                <div className="pf-lenses">
                  <div className="pf-lens pf-reveal" data-delay="0">
                    <span className="pf-lens-ey">01 · Product-centric</span>
                    <h4 className="pf-lens-h">Look at the product</h4>
                    <ul className="pf-lens-list">
                      <li>Number of products sold</li>
                      <li>Price of products sold</li>
                      <li>Product mix</li>
                    </ul>
                  </div>

                  <div className="pf-lens pf-reveal" data-delay="90">
                    <span className="pf-lens-ey">02 · Sales-centric</span>
                    <h4 className="pf-lens-h">Look at the sales</h4>
                    <ul className="pf-lens-list">
                      <li>Number of sales</li>
                      <li>Average ticket size</li>
                    </ul>
                    <p className="pf-lens-eq">Number of sales = Footfall × Conversion</p>
                  </div>

                  <div className="pf-lens pf-reveal" data-delay="180">
                    <span className="pf-lens-ey">03 · Customer-centric</span>
                    <h4 className="pf-lens-h">Look at the customer</h4>
                    <ul className="pf-lens-list">
                      <li>Number of customers</li>
                      <li>Revenue per customer</li>
                    </ul>
                  </div>
                </div>

                <p className="pf-lenses-foot">Essentially, don't restrict yourself to one framework.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 4: Cost ── */}
        <section id="cost" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Cost Analysis</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              Cost is units times cost per unit
            </h2>
            <p className="pf-body pf-reveal" data-delay="110">
              For cost side problems, it is helpful to draw a process map or divide the costs
              into fixed and variable costs.
            </p>

            {/* Cost decomposition */}
            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Cost decomposition</p>
                <p className="pf-split-desc">
                  Costs = Number of units × Cost per unit. Cost per unit divides into fixed and
                  variable components, depending on the industry.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={COST_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>

            {/* Fixed + Variable side-by-side (Edit 3b) */}
            <div className="pf-costpair pf-reveal" data-delay="0">
              <div className="pf-costcol">
                <p className="pf-split-cap">Fixed cost components</p>
                <p className="pf-split-desc">
                  Some of the most common fixed costs are: land, building, fixed component
                  of salaries, equipment, furniture, machinery, warehouses, depreciation,
                  fixed charges such as interest payments and insurance, marketing and taxes.
                </p>
                <div className="pf-split-chart">
                  <AdditionalFrameworkPanel tree={FIXED_COST_TREE_FW} multiActive hideHeader noScroll forceVertical excludeVisible />
                </div>
              </div>
              <div className="pf-costcol">
                <p className="pf-split-cap">Variable cost components</p>
                <p className="pf-split-desc">
                  Some of the most common variable costs are: raw material, transportation,
                  processing and packaging, storage, distribution, marketing and after-sales
                  expenses.
                </p>
                <div className="pf-split-chart">
                  <AdditionalFrameworkPanel tree={VARIABLE_COST_TREE_FW} multiActive hideHeader noScroll forceVertical excludeVisible />
                </div>
              </div>
            </div>

            <p className="pf-note pf-reveal" data-delay="0">
              Note: This is an indicative and not exhaustive list. The above components will vary according to the industry.
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

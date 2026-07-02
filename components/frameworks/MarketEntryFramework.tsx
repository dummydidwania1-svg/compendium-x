'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Footer from '@/components/dashboard/Footer'
import { AdditionalFrameworkPanel, type FrameworkTree } from '@/components/case/CasePreviewMaster'

/* ─── Tree data ─── */

const MARKET_ENTRY_TREE_FW: FrameworkTree = {
  nodes: {
    entry:       { id: 'entry',       label: 'Market Entry',              tone: 'root',   children: ['financial', 'operational', 'risks'] },
    financial:   { id: 'financial',   label: 'Financial\nAttractiveness', tone: 'branch', children: [] },
    operational: { id: 'operational', label: 'Operational\nFeasibility',  tone: 'branch', children: [] },
    risks:       { id: 'risks',       label: 'Risks',                     tone: 'branch', children: [] },
  },
  defaultExpanded: ['entry'],
  defaultFocusedId: 'entry',
  notes: [],
}

const FINANCIAL_TREE_FW: FrameworkTree = {
  nodes: {
    financial:   { id: 'financial',   label: 'Financial\nAttractiveness', tone: 'root',   children: ['expected', 'growth', 'landscape'] },
    expected:    { id: 'expected',    label: 'Expected\nProfits',         tone: 'branch', children: [] },
    growth:      { id: 'growth',      label: 'Market\nGrowth Rate',       tone: 'branch', children: [] },
    landscape:   { id: 'landscape',   label: 'Competitive\nLandscape',    tone: 'branch', children: [] },
  },
  defaultExpanded: ['financial'],
  defaultFocusedId: 'financial',
  notes: [],
}

const EXPECTED_PROFITS_TREE_FW: FrameworkTree = {
  nodes: {
    expected:   { id: 'expected',   label: 'Expected Profits',     tone: 'root',   children: ['mktSize', 'mktShare', 'profitUnit', 'fixedCosts'] },
    mktSize:    { id: 'mktSize',    label: 'Market Size\n(units)', tone: 'branch', children: [] },
    mktShare:   { id: 'mktShare',   label: '% Market\nShare',      tone: 'branch', children: [] },
    profitUnit: { id: 'profitUnit', label: 'Profit / Unit',        tone: 'branch', children: ['sellPrice', 'varCost'] },
    fixedCosts: { id: 'fixedCosts', label: 'Fixed Costs',          tone: 'branch', children: [] },
    sellPrice:  { id: 'sellPrice',  label: 'Selling\nPrice / Unit', tone: 'leaf',  children: [] },
    varCost:    { id: 'varCost',    label: 'Variable\nCost / Unit', tone: 'leaf',  children: [] },
  },
  defaultExpanded: ['expected', 'profitUnit'],
  defaultFocusedId: 'expected',
  notes: [],
}

/* ─── Section nav ─── */

const NAV_SECTIONS = [
  { id: 'setup',       label: 'The Setup' },
  { id: 'financial',   label: 'Financial' },
  { id: 'operational', label: 'Operational' },
  { id: 'risks',       label: 'Risks' },
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
`

/* ─── Main component ─── */

export default function MarketEntryFramework() {
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
        <h1 className="pf-headline pf-reveal" data-delay="55">Market Entry</h1>
      </header>

      <main>
        {/* ── Section 1: The Setup ── */}
        <section id="setup" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">The Setup</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              What a typical prompt looks like
            </h2>

            <p className="pf-body pf-reveal" data-delay="110">
              A market entry case usually involves a firm expanding its offerings to new
              geographies or venturing into a new product or service line. You are required to
              advise them on whether they should enter the market, and if yes, how.
            </p>

            <p className="pf-body pf-reveal" data-delay="150" style={{ marginTop: 20 }}>
              It is important to begin with some preliminary questions. Some important questions
              for market entry cases are:
            </p>

            <ol className="pf-qlist" aria-label="Preliminary questions" style={{ marginTop: 28 }}>
              {[
                'What does the client do? What are the current geographies they operate in?',
                'Have they entered similar markets in the past?',
                'Why are they looking to enter this market? Are there any other markets they are considering?',
                'What parameters will the market entry decision be based on?',
                'When are they looking to enter the market by?',
              ].map((q, i) => (
                <li key={i} className="pf-q" data-delay={String(i * 75)}>
                  <span className="pf-qn">{i + 1}</span>
                  <span className="pf-qt">{q}</span>
                </li>
              ))}
            </ol>

            <div className="pf-split pf-reveal" data-delay="110" style={{ marginTop: 72 }}>
              <aside className="pf-split-text">
                <p className="pf-split-cap">The starting framework</p>
                <p className="pf-split-desc">
                  Broadly, you can refer to the following framework as a good starting point as you
                  begin with your first couple of market entry cases.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={MARKET_ENTRY_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 2: Financial Attractiveness ── */}
        <section id="financial" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Financial Attractiveness</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              Start by assessing how attractive the market is
            </h2>
            <p className="pf-body pf-reveal" data-delay="110">
              Most market entry cases begin with an analysis of the financial attractiveness of the
              proposed market.
            </p>

            {/* Financial attractiveness decomposition */}
            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Financial decomposition</p>
                <p className="pf-split-desc">
                  Financial attractiveness breaks down into expected profits, the market growth
                  rate, and the competitive landscape.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={FINANCIAL_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>

            {/* Expected profits formula */}
            <div className="pf-callout pf-reveal" data-delay="0" style={{ marginTop: 72 }}>
              <p className="pf-callout-lbl">Expected profits</p>
              <p className="pf-callout-txt">
                Expected profits = (Market size (in units) × % Market Share × Profit / unit) - Fixed costs
              </p>
            </div>

            <p className="pf-body pf-reveal" data-delay="0">
              Usually, the interviewer will ask you to estimate the above figures. Thus, these cases
              often involve market sizing guesstimates to arrive at the starting figure. Once this is
              estimated, you can discuss with the interviewer to make an estimate of the percentage of
              the market the firm will be able to capture initially. This will be based on the number
              of players in the market, how fragmented the market is, and the product differentiation
              that exists.
            </p>
            <p className="pf-body pf-reveal" data-delay="0" style={{ marginTop: 20 }}>
              Moving on to the profit per unit, this can be calculated by estimating the variable
              costs that will go into making the product or rendering the service in question. Lastly,
              any fixed costs that will be incurred can be reduced from this figure to arrive at the
              expected profits.
            </p>

            {/* Expected profits decomposition */}
            <div className="pf-split pf-reveal" data-delay="0">
              <aside className="pf-split-text">
                <p className="pf-split-cap">Expected profits decomposition</p>
                <p className="pf-split-desc">
                  Market size in units × percentage market share × profit per unit, less fixed costs.
                  Profit per unit further splits into selling price per unit and variable cost per unit.
                </p>
              </aside>
              <div className="pf-split-chart">
                <AdditionalFrameworkPanel tree={EXPECTED_PROFITS_TREE_FW} multiActive hideHeader noScroll excludeVisible />
              </div>
            </div>

            <p className="pf-note pf-reveal" data-delay="0">
              Do keep in mind the market growth rate and competitive landscape before coming to a
              conclusion on the market's attractiveness.
            </p>
          </div>
        </section>

        {/* ── Section 3: Operational Feasibility ── */}
        <section id="operational" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Operational Feasibility</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              How will we actually enter the market
            </h2>
            <p className="pf-body pf-reveal" data-delay="110">
              Sometimes, you may be asked to assess the operational feasibility of the proposed
              business. This is essentially the "How will we enter?" part of the case. Under this, you
              can look at how the business can be set up in the new market. Insights can be drawn from
              the firm's current operating model and the tweaks which the new market will require.
              After confirming that the firm will be able to secure the necessary permissions and
              licenses, you can go about drawing the firm's value chain and discuss how each step of
              the value chain can be set up. Common questions you need to ask yourself are:
            </p>

            <ol className="pf-qlist" aria-label="Operational questions" style={{ marginTop: 28 }}>
              {[
                'Should we outsource this step or do it in-house?',
                'Should we produce in the home country and export, or should we set up units in the new market?',
                'If we entered a market recently, how did we set up operations there?',
              ].map((q, i) => (
                <li key={i} className="pf-q" data-delay={String(i * 75)}>
                  <span className="pf-qn">{i + 1}</span>
                  <span className="pf-qt">{q}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Section 4: Risks ── */}
        <section id="risks" className="pf-section">
          <div className="pf-wrap">
            <span className="pf-section-ey pf-reveal" data-delay="0">Risks</span>
            <h2 className="pf-section-title pf-reveal" data-delay="55">
              Go the extra step and analyse the risks
            </h2>
            <p className="pf-body pf-reveal" data-delay="110">
              Most candidates stop the case at this step. However, we advise you to go the extra step
              and analyse the risks associated with this venture. This not only gets you brownie points
              but also recognises the different challenges the firm will face. "Porter's five forces"
              and "PESTEL" are two frameworks which will help you think about the various risks the
              firm may face.
            </p>
            <p className="pf-body pf-reveal" data-delay="150" style={{ marginTop: 20 }}>
              Finally, based on your evaluation of the proposed idea and attractiveness of the market,
              you can take a decision on whether the client should enter the market.
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

'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Footer from '@/components/dashboard/Footer'

/* ─── Tree renderer — exact visual parity with CasePreviewMaster ─── */

const T_GREEN    = '#3D5A35'
const T_MUTED_BG = 'rgba(255,248,240,1)'
const T_MUTED_BD = 'rgba(92,64,51,0.32)'
const T_MUTED_TX = '#7A5C4A'
const T_EDGE     = 'rgba(92,64,51,0.30)'
const T_FONT     = "'Work Sans', sans-serif"
const T_FS       = 13
const T_PX       = 18
const T_PY       = 12
const T_LH       = T_FS * 1.4
const T_H_GAP    = 60
const T_V_GAP    = 42
const T_PAD      = 32
const T_CW       = T_FS * 0.54
const T_MIN_W    = 130

type TNode = { label: string; children: string[] }
type TDef  = { nodes: Record<string, TNode>; rootId: string }

/* Wraps label into lines — explicit \n creates hard breaks */
function wrapLabel(label: string, innerW: number): string[] {
  const cpl = Math.max(4, Math.floor(innerW / T_CW))
  const result: string[] = []
  for (const seg of label.split('\n')) {
    const words = seg.split(' ')
    let cur = ''
    for (const w of words) {
      if (cur && cur.length + 1 + w.length > cpl) { result.push(cur); cur = w }
      else { cur = cur ? `${cur} ${w}` : w }
    }
    if (cur) result.push(cur)
  }
  return result.length ? result : ['']
}

/* Natural node size: uses large inner to honour explicit \n without extra wrapping */
function rawSize(label: string): { w: number; h: number } {
  const ls = wrapLabel(label, 999)
  const textW = Math.max(...ls.map(l => l.length * T_CW))
  return {
    w: Math.max(T_MIN_W, textW + T_PX * 2),
    h: Math.max(44, ls.length * T_LH + T_PY * 2),
  }
}

/* Layout with tier-uniform node dimensions */
function computeLayout(tree: TDef) {
  const { nodes, rootId } = tree

  const tiers = new Map<string, number>()
  function assignTier(id: string, t: number) {
    tiers.set(id, t)
    ;(nodes[id]?.children ?? []).forEach(ch => assignTier(ch, t + 1))
  }
  assignTier(rootId, 0)

  const tierDims = new Map<number, { w: number; h: number }>()
  tiers.forEach((t, id) => {
    const { w, h } = rawSize(nodes[id]?.label ?? '')
    const prev = tierDims.get(t) ?? { w: 0, h: 0 }
    tierDims.set(t, { w: Math.max(prev.w, w), h: Math.max(prev.h, h) })
  })

  function dims(id: string) {
    return tierDims.get(tiers.get(id) ?? 0) ?? { w: T_MIN_W, h: 44 }
  }

  function sw(id: string): number {
    const { w } = dims(id)
    const ch = nodes[id]?.children ?? []
    if (!ch.length) return w
    return Math.max(w, ch.reduce((s, c, i) => s + sw(c) + (i ? T_H_GAP : 0), 0))
  }

  const pos = new Map<string, { x: number; y: number; w: number; h: number }>()
  function place(id: string, cx: number, cy: number) {
    const { w, h } = dims(id)
    pos.set(id, { x: cx, y: cy, w, h })
    const ch = nodes[id]?.children ?? []
    if (!ch.length) return
    const total = ch.reduce((s, c, i) => s + sw(c) + (i ? T_H_GAP : 0), 0)
    let lx = cx - total / 2
    for (const c of ch) {
      const csw = sw(c)
      const { h: chH } = dims(c)
      place(c, lx + csw / 2, cy + h / 2 + T_V_GAP + chH / 2)
      lx += csw + T_H_GAP
    }
  }
  place(rootId, 0, 0)
  return { pos, tiers }
}

function StaticTree({ tree }: { tree: TDef }) {
  const { pos, tiers } = computeLayout(tree)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  pos.forEach(n => {
    minX = Math.min(minX, n.x - n.w / 2); minY = Math.min(minY, n.y - n.h / 2)
    maxX = Math.max(maxX, n.x + n.w / 2); maxY = Math.max(maxY, n.y + n.h / 2)
  })
  const svgW = maxX - minX + T_PAD * 2
  const svgH = maxY - minY + T_PAD * 2
  const ox   = T_PAD - minX
  const oy   = T_PAD - minY

  function renderNode(id: string) {
    const n = pos.get(id)
    const def = tree.nodes[id]
    if (!n || !def) return null
    const tier   = tiers.get(id) ?? 0
    const active = tier <= 1
    const x = n.x + ox, y = n.y + oy
    const hw = n.w / 2, hh = n.h / 2
    const fill   = active ? T_GREEN   : T_MUTED_BG
    const stroke = active ? T_GREEN   : T_MUTED_BD
    const tc     = active ? '#f0f5ee' : T_MUTED_TX
    const fw     = active ? 500       : 400
    const ls     = wrapLabel(def.label, n.w - T_PX * 2)
    const totalH = ls.length * T_LH
    const startY = y - totalH / 2 + T_LH * 0.85
    return (
      <g key={id}>
        <rect x={x - hw} y={y - hh} width={n.w} height={n.h} rx={4}
          fill={fill} stroke={stroke} strokeWidth={active ? 1.5 : 1} />
        {ls.map((l, i) => (
          <text key={i} x={x} y={startY + i * T_LH}
            textAnchor="middle" fontSize={T_FS} fontFamily={T_FONT}
            fontWeight={fw} fill={tc}>{l}</text>
        ))}
      </g>
    )
  }

  function renderEdges() {
    const out: React.ReactNode[] = []
    Object.keys(tree.nodes).forEach(pid => {
      const p = pos.get(pid); if (!p) return
      ;(tree.nodes[pid].children ?? []).forEach(cid => {
        const c = pos.get(cid); if (!c) return
        const pTier  = tiers.get(pid) ?? 0
        const cTier  = tiers.get(cid) ?? 0
        const active = pTier <= 1 && cTier <= 1
        const x1 = p.x + ox, y1 = p.y + oy + p.h / 2
        const x2 = c.x + ox, y2 = c.y + oy - c.h / 2
        const my = (y1 + y2) / 2
        out.push(
          <g key={`${pid}-${cid}`}>
            <path
              d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`}
              fill="none"
              stroke={active ? T_GREEN : T_EDGE}
              strokeWidth={active ? 1.5 : 1}
              strokeDasharray={active ? undefined : '3 2'}
            />
            <polygon
              points={`${x2},${y2} ${x2 - 4},${y2 - 7} ${x2 + 4},${y2 - 7}`}
              fill={active ? T_GREEN : T_EDGE}
            />
          </g>
        )
      })
    })
    return out
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%"
        style={{ maxWidth: svgW, display: 'block', margin: '0 auto' }}>
        {renderEdges()}
        {Object.keys(tree.nodes).map(renderNode)}
      </svg>
    </div>
  )
}

/* ─── Tree data ─── */

const PROFIT_TREE: TDef = {
  rootId: 'profit',
  nodes: {
    profit:  { label: 'Profit',  children: ['revenue', 'cost'] },
    revenue: { label: 'Revenue', children: [] },
    cost:    { label: 'Cost',    children: [] },
  },
}

const REVENUE_TREE: TDef = {
  rootId: 'revenue',
  nodes: {
    revenue: { label: 'Revenue',            children: ['units', 'price'] },
    units:   { label: 'No. of\nUnits Sold', children: [] },
    price:   { label: 'Price /\nUnit',       children: [] },
  },
}

const COST_TREE: TDef = {
  rootId: 'cost',
  nodes: {
    cost:       { label: 'Cost',                    children: ['numUnits', 'costPerUnit'] },
    numUnits:   { label: 'No. of\nUnits',           children: [] },
    costPerUnit:{ label: 'Cost /\nUnit',            children: ['fixed', 'variable'] },
    fixed:      { label: 'Fixed Cost\n/ Unit',      children: [] },
    variable:   { label: 'Variable Cost\n/ Unit',   children: [] },
  },
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
    font-family: 'Work Sans', sans-serif;
    background: #fff8f0;
    color: #453a2a;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  .pf-root *::selection { background: rgba(61,90,53,.15); color: #3b2f2f; }

  /* Reveal */
  .pf-reveal {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity .85s cubic-bezier(.22,1,.36,1),
                transform .85s cubic-bezier(.22,1,.36,1);
  }
  .pf-reveal.visible { opacity: 1; transform: translateY(0); }

  /* Layout */
  .pf-wrap { max-width: 1100px; margin: 0 auto; padding: 0 60px; }
  @media (max-width: 768px) { .pf-wrap { padding: 0 28px; } }
  @media (max-width: 480px) { .pf-wrap { padding: 0 20px; } }

  /* Back button */
  .pf-back {
    max-width: 1100px;
    margin: 0 auto;
    padding: 96px 60px 0;
  }
  @media (max-width: 768px) { .pf-back { padding: 82px 28px 0; } }
  .pf-back-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .22em;
    color: #3D5A35;
    text-decoration: none;
    transition: opacity .18s;
  }
  .pf-back-link:hover { opacity: .65; }

  /* Hero */
  .pf-hero {
    max-width: 1100px;
    margin: 0 auto;
    padding: 22px 60px 60px;
  }
  @media (max-width: 768px) { .pf-hero { padding: 18px 28px 48px; } }

  .pf-eyebrow {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .3em;
    color: rgba(61,90,53,.48);
    margin-bottom: 14px;
  }
  .pf-headline {
    font-family: 'Newsreader', serif;
    font-size: clamp(40px, 6vw, 72px);
    font-weight: 300;
    line-height: 1.0;
    letter-spacing: -.025em;
    color: #453a2a;
    margin-bottom: 20px;
  }
  .pf-lead {
    font-size: 15px;
    line-height: 1.8;
    color: rgba(90,79,67,.8);
    max-width: 460px;
  }

  /* Sections */
  .pf-section {
    border-top: 1px solid rgba(61,90,53,.1);
    padding: 68px 0;
  }

  .pf-section-ey {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .3em;
    color: rgba(61,90,53,.45);
    margin-bottom: 10px;
  }
  .pf-section-title {
    font-family: 'Newsreader', serif;
    font-size: clamp(22px, 3vw, 30px);
    font-weight: 300;
    color: #453a2a;
    letter-spacing: -.01em;
    line-height: 1.25;
    margin-bottom: 22px;
  }
  .pf-body {
    font-size: 15px;
    line-height: 1.85;
    color: #5a4f43;
    max-width: 640px;
  }

  /* Callout */
  .pf-callout {
    border-left: 2px solid #3D5A35;
    padding: 18px 22px;
    background: rgba(61,90,53,.03);
    margin-bottom: 32px;
  }
  .pf-callout-lbl {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .26em;
    color: rgba(61,90,53,.5);
    margin-bottom: 8px;
  }
  .pf-callout-txt {
    font-family: 'Newsreader', serif;
    font-size: 18px;
    font-style: italic;
    font-weight: 300;
    color: #453a2a;
    line-height: 1.6;
  }

  /* Numbered list */
  .pf-qlist { list-style: none; margin: 0; padding: 0; }
  .pf-q {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    padding: 16px 0;
    border-bottom: 1px solid rgba(61,90,53,.07);
    opacity: 0;
    transform: translateX(-10px);
    transition: opacity .6s cubic-bezier(.22,1,.36,1),
                transform .6s cubic-bezier(.22,1,.36,1);
  }
  .pf-q:first-child { border-top: 1px solid rgba(61,90,53,.07); }
  .pf-q.visible { opacity: 1; transform: translateX(0); }
  .pf-qn {
    font-family: 'Newsreader', serif;
    font-size: 13px;
    font-weight: 300;
    color: rgba(61,90,53,.38);
    min-width: 22px;
    flex-shrink: 0;
    padding-top: 2px;
  }
  .pf-qt { font-size: 15px; line-height: 1.7; color: #5a4f43; }

  /* Tree label above SVG */
  .pf-tree { margin-top: 40px; }
  .pf-tree-cap {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .28em;
    color: rgba(61,90,53,.35);
    margin-bottom: 18px;
    text-align: center;
  }

  /* Driver columns */
  .pf-drivers {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin-top: 52px;
    border-top: 1px solid rgba(61,90,53,.1);
  }
  @media (max-width: 720px) { .pf-drivers { grid-template-columns: 1fr; } }

  .pf-driver {
    padding: 28px 28px 28px 0;
    border-right: 1px solid rgba(61,90,53,.08);
    opacity: 0;
    transform: translateY(14px);
    transition: opacity .65s cubic-bezier(.22,1,.36,1),
                transform .65s cubic-bezier(.22,1,.36,1);
  }
  .pf-driver:last-child { border-right: none; padding-right: 0; }
  .pf-driver + .pf-driver { padding-left: 28px; }
  .pf-driver:first-child { padding-left: 0; }
  @media (max-width: 720px) {
    .pf-driver {
      border-right: none;
      border-bottom: 1px solid rgba(61,90,53,.08);
      padding: 24px 0;
    }
    .pf-driver + .pf-driver { padding-left: 0; }
  }
  .pf-driver.visible { opacity: 1; transform: translateY(0); }
  .pf-driver-name {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .24em;
    color: #3D5A35;
    margin-bottom: 14px;
  }
  .pf-driver-note {
    font-size: 13px;
    line-height: 1.65;
    color: rgba(90,79,67,.65);
    font-style: italic;
    margin-bottom: 12px;
  }
  .pf-driver-sub {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .2em;
    color: rgba(61,90,53,.5);
    margin: 14px 0 8px;
  }

  /* Shared dot list */
  .pf-dl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
  .pf-di {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    font-size: 13px;
    line-height: 1.65;
    color: #5a4f43;
  }
  .pf-dot {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: rgba(61,90,53,.3);
    margin-top: 6px;
    flex-shrink: 0;
  }

  /* Cost two-column layout */
  .pf-cost-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 56px;
    margin-top: 40px;
  }
  @media (max-width: 640px) { .pf-cost-grid { grid-template-columns: 1fr; gap: 32px; } }
  .pf-cost-col-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .24em;
    color: #3D5A35;
    padding-bottom: 14px;
    margin-bottom: 18px;
    border-bottom: 1px solid rgba(61,90,53,.15);
  }

  /* Italic note */
  .pf-note {
    margin-top: 24px;
    font-size: 13px;
    line-height: 1.7;
    color: rgba(90,79,67,.6);
    font-style: italic;
  }

  /* Section nav (right dots) */
  .pf-snav {
    position: fixed;
    right: 28px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 16px;
    z-index: 50;
  }
  @media (max-width: 1300px) { .pf-snav { display: none; } }

  .pf-snav-btn {
    display: flex;
    align-items: center;
    gap: 9px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    justify-content: flex-end;
  }
  .pf-snav-lbl {
    font-family: 'Work Sans', sans-serif;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .2em;
    color: #3D5A35;
    opacity: 0;
    transition: opacity .18s ease;
    pointer-events: none;
    white-space: nowrap;
  }
  .pf-snav-btn:hover .pf-snav-lbl { opacity: 1; }
  .pf-snav-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: rgba(61,90,53,.2);
    transition: background .25s ease, transform .25s ease;
    flex-shrink: 0;
  }
  .pf-snav-btn.active .pf-snav-dot {
    background: #3D5A35;
    transform: scale(1.6);
  }
  .pf-snav-btn:hover .pf-snav-dot { background: rgba(61,90,53,.55); }
`

/* ─── Main component ─── */

export default function ProfitabilityFramework() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [activeSection, setActiveSection] = useState('setup')

  /* Scroll reveal */
  useEffect(() => {
    const root = rootRef.current; if (!root) return
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        setTimeout(() => el.classList.add('visible'), parseInt(el.dataset.delay ?? '0', 10))
        io.unobserve(el)
      }),
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' },
    )
    root.querySelectorAll('.pf-reveal, .pf-q, .pf-driver').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  /* Section tracker for right-side dots */
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id) }),
      { threshold: 0, rootMargin: '0px 0px -70% 0px' },
    )
    NAV_SECTIONS.forEach(s => {
      const el = document.getElementById(s.id); if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  return (
    <div ref={rootRef} className="pf-root">
      <style>{PAGE_CSS}</style>

      {/* Right-side section nav */}
      <nav className="pf-snav" aria-label="Page sections">
        {NAV_SECTIONS.map(s => (
          <button
            key={s.id}
            className={`pf-snav-btn${activeSection === s.id ? ' active' : ''}`}
            onClick={() =>
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            aria-label={`Go to ${s.label}`}
          >
            <span className="pf-snav-lbl">{s.label}</span>
            <span className="pf-snav-dot" />
          </button>
        ))}
      </nav>

      {/* Back to Repository */}
      <div className="pf-back">
        <Link href="/repository" className="pf-back-link">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 2.5L5 7l4 4.5" stroke="currentColor" strokeWidth="1.25"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Repository
        </Link>
      </div>

      {/* Hero */}
      <header className="pf-hero">
        <span className="pf-eyebrow pf-reveal" data-delay="0">Framework</span>
        <h1 className="pf-headline pf-reveal" data-delay="55">Profitability</h1>
        <p className="pf-lead pf-reveal" data-delay="115">
          Diagnose whether the issue lies on the revenue side, the cost side, or both.
        </p>
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
                "Your client's profits are down by 20%. Analyse the reason for the same
                by isolating the problem."
              </p>
            </div>

            <p className="pf-body pf-reveal" data-delay="150">
              Before structuring an answer, get oriented by asking the right preliminary questions.
              These narrow the scope early and prevent going down irrelevant paths.
            </p>

            <ol className="pf-qlist" aria-label="Preliminary questions" style={{ marginTop: 28 }}>
              {[
                'Since when has the client been facing this problem, and what is the magnitude of the decline?',
                'Where is the client located geographically?',
                'Which part of the value chain does the client operate in?',
                'Is this a company-specific problem or an industry-wide one?',
                'Segmentation questions: does the decline affect all stores, all geographies, all product lines and all customers?',
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
            <p className="pf-body pf-reveal" data-delay="110">
              Every profitability case starts here. Determine which side of the equation is
              responsible before going deeper into either branch.
            </p>

            <div className="pf-tree pf-reveal" data-delay="160">
              <p className="pf-tree-cap">Profit decomposition</p>
              <StaticTree tree={PROFIT_TREE} />
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
              Revenue equals the number of units sold multiplied by price per unit. Volume
              problems trace back to production, distribution, or demand. Price problems
              require a separate line of inquiry. Start by asking which revenue streams have
              been equally affected.
            </p>

            <div className="pf-tree pf-reveal" data-delay="160">
              <p className="pf-tree-cap">Revenue decomposition</p>
              <StaticTree tree={REVENUE_TREE} />
            </div>

            <div className="pf-drivers">
              <div className="pf-driver" data-delay="0">
                <p className="pf-driver-name">Production</p>
                <ul className="pf-dl">
                  {[
                    'Number of manufacturing units',
                    'Capacity of each unit',
                    'Production capacity being used',
                    'Defects in manufactured goods',
                  ].map((item, i) => (
                    <li key={i} className="pf-di"><span className="pf-dot" />{item}</li>
                  ))}
                </ul>
              </div>

              <div className="pf-driver" data-delay="85">
                <p className="pf-driver-name">Distribution</p>
                <p className="pf-driver-note">
                  Ask the mode of distribution the client uses and benchmark against competitors.
                </p>
                <ul className="pf-dl">
                  {[
                    'Number of distributors',
                    'Amount sold per distributor (affected by monetary and non-monetary factors)',
                  ].map((item, i) => (
                    <li key={i} className="pf-di"><span className="pf-dot" />{item}</li>
                  ))}
                </ul>
              </div>

              <div className="pf-driver" data-delay="170">
                <p className="pf-driver-name">Demand</p>
                <p className="pf-driver-note">
                  Begin by understanding whether all revenue streams have been affected equally.
                </p>
                <p className="pf-driver-sub">Product-centric</p>
                <ul className="pf-dl" style={{ marginBottom: 12 }}>
                  {['Number of products sold', 'Price of products sold', 'Product mix'].map((item, i) => (
                    <li key={i} className="pf-di"><span className="pf-dot" />{item}</li>
                  ))}
                </ul>
                <p className="pf-driver-sub">Sales-centric</p>
                <ul className="pf-dl" style={{ marginBottom: 12 }}>
                  {[
                    'Number of sales and average ticket size',
                    'Footfall, Conversion and Average ticket size (Sales = Footfall × Conversion)',
                  ].map((item, i) => (
                    <li key={i} className="pf-di"><span className="pf-dot" />{item}</li>
                  ))}
                </ul>
                <p className="pf-driver-sub">Customer-centric</p>
                <ul className="pf-dl">
                  {['Number of customers', 'Revenue per customer'].map((item, i) => (
                    <li key={i} className="pf-di"><span className="pf-dot" />{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="pf-note pf-reveal" data-delay="0">
              Don't restrict yourself to one lens. The right approach depends on how the business is structured.
            </p>
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
              For cost-side problems, draw a process map or divide costs into fixed and variable.
              Cost per unit varies by industry.
            </p>

            <div className="pf-tree pf-reveal" data-delay="160">
              <p className="pf-tree-cap">Cost decomposition</p>
              <StaticTree tree={COST_TREE} />
            </div>

            <div className="pf-cost-grid pf-reveal" data-delay="0">
              <div>
                <p className="pf-cost-col-title">Fixed Cost / Unit</p>
                <ul className="pf-dl">
                  {[
                    'Land',
                    'Building',
                    'Salaries (fixed component)',
                    'Equipment',
                    'Furniture',
                    'Machinery',
                    'Warehouses',
                    'Fixed charges (interest payments, insurance, marketing and taxes)',
                  ].map((item, i) => (
                    <li key={i} className="pf-di"><span className="pf-dot" />{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="pf-cost-col-title">Variable Cost / Unit</p>
                <ul className="pf-dl">
                  {[
                    'Raw material',
                    'Transportation',
                    'Processing',
                    'Packaging',
                    'Storage',
                    'Distribution',
                    'Marketing',
                    'After-sales expenses',
                  ].map((item, i) => (
                    <li key={i} className="pf-di"><span className="pf-dot" />{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="pf-note pf-reveal" data-delay="0">
              This is an indicative, not exhaustive, list. Components will vary depending on the industry.
            </p>
          </div>
        </section>
      </main>

      <div style={{ borderTop: '1px solid rgba(61,90,53,.1)' }}>
        <Footer currentPage="repository" />
      </div>
    </div>
  )
}

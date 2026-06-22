'use client'

import React, { useEffect, useRef } from 'react'
import Link from 'next/link'
import Footer from '@/components/dashboard/Footer'

/* ─────────────────────────────────────────────────────────────
   SVG Tree Renderer — exact visual parity with CasePreviewMaster
   ───────────────────────────────────────────────────────────── */

const T_GREEN    = '#3D5A35'
const T_MUTED_BG = 'rgba(255,248,240,1)'
const T_MUTED_BD = 'rgba(92,64,51,0.28)'
const T_MUTED_TX = '#7A5C4A'
const T_EDGE     = 'rgba(92,64,51,0.30)'
const T_FONT     = "'Work Sans', sans-serif"
const T_FS       = 13
const T_PX       = 18
const T_PY       = 12
const T_LH       = T_FS * 1.4   // 18.2
const T_H_GAP    = 56
const T_V_GAP    = 40
const T_PAD      = 28
const T_CW       = T_FS * 0.54  // ~7px per char

type TreeNodeDef = {
  label: string
  children: string[]
}

type TreeDef = {
  nodes: Record<string, TreeNodeDef>
  rootId: string
}

function wrapLabel(label: string, maxInner: number): string[] {
  const cpl = Math.max(4, Math.floor(maxInner / T_CW))
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

function nodeSize(label: string): { w: number; h: number } {
  const maxInner = 150
  const ls = wrapLabel(label, maxInner)
  const textW = Math.max(...ls.map(l => l.length * T_CW))
  const textH = ls.length * T_LH
  return {
    w: Math.max(110, textW + T_PX * 2),
    h: Math.max(44,  textH + T_PY * 2),
  }
}

type PlacedNode = { x: number; y: number; w: number; h: number }

function computeLayout(tree: TreeDef): Map<string, PlacedNode> {
  const { nodes, rootId } = tree

  function subtreeW(id: string): number {
    const n = nodes[id]
    if (!n) return 0
    const { w } = nodeSize(n.label)
    if (!n.children.length) return w
    const kids = n.children.reduce((s, ch, i) => s + subtreeW(ch) + (i ? T_H_GAP : 0), 0)
    return Math.max(w, kids)
  }

  const pos = new Map<string, PlacedNode>()

  function place(id: string, cx: number, cy: number) {
    const n = nodes[id]
    if (!n) return
    const { w, h } = nodeSize(n.label)
    pos.set(id, { x: cx, y: cy, w, h })
    if (!n.children.length) return
    const total = n.children.reduce((s, ch, i) => s + subtreeW(ch) + (i ? T_H_GAP : 0), 0)
    let lx = cx - total / 2
    for (const ch of n.children) {
      const csw = subtreeW(ch)
      const { h: childH } = nodeSize(nodes[ch]?.label ?? '')
      place(ch, lx + csw / 2, cy + h / 2 + T_V_GAP + childH / 2)
      lx += csw + T_H_GAP
    }
  }

  place(rootId, 0, 0)
  return pos
}

function StaticTree({ tree }: { tree: TreeDef }) {
  const pos = computeLayout(tree)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  pos.forEach(n => {
    minX = Math.min(minX, n.x - n.w / 2); minY = Math.min(minY, n.y - n.h / 2)
    maxX = Math.max(maxX, n.x + n.w / 2); maxY = Math.max(maxY, n.y + n.h / 2)
  })
  const svgW = maxX - minX + T_PAD * 2
  const svgH = maxY - minY + T_PAD * 2
  const ox = T_PAD - minX
  const oy = T_PAD - minY

  function renderNode(id: string) {
    const n = pos.get(id)
    const def = tree.nodes[id]
    if (!n || !def) return null
    const x = n.x + ox, y = n.y + oy
    const hw = n.w / 2, hh = n.h / 2
    const isRoot = id === tree.rootId
    const fill   = isRoot ? T_GREEN   : T_MUTED_BG
    const stroke = isRoot ? T_GREEN   : T_MUTED_BD
    const tColor = isRoot ? '#f0f5ee' : T_MUTED_TX
    const ls = wrapLabel(def.label, n.w - T_PX * 2)
    const totalH = ls.length * T_LH
    const startY = y - totalH / 2 + T_LH * 0.85
    return (
      <g key={id}>
        <rect x={x - hw} y={y - hh} width={n.w} height={n.h} rx={4}
          fill={fill} stroke={stroke} strokeWidth={isRoot ? 1.5 : 1} />
        {ls.map((l, i) => (
          <text key={i} x={x} y={startY + i * T_LH}
            textAnchor="middle" fontSize={T_FS} fontFamily={T_FONT}
            fontWeight={isRoot ? 600 : 400} fill={tColor}>
            {l}
          </text>
        ))}
      </g>
    )
  }

  function renderEdges() {
    const out: React.ReactNode[] = []
    Object.keys(tree.nodes).forEach(id => {
      const n = pos.get(id)
      if (!n) return
      tree.nodes[id].children.forEach(ch => {
        const c = pos.get(ch)
        if (!c) return
        const x1 = n.x + ox, y1 = n.y + oy + n.h / 2
        const x2 = c.x + ox, y2 = c.y + oy - c.h / 2
        const my = (y1 + y2) / 2
        const d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`
        out.push(
          <g key={`${id}-${ch}`}>
            <path d={d} fill="none" stroke={T_EDGE} strokeWidth={1} strokeDasharray="3 2" />
            <polygon points={`${x2},${y2} ${x2 - 4},${y2 - 7} ${x2 + 4},${y2 - 7}`} fill={T_EDGE} />
          </g>
        )
      })
    })
    return out
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%"
        style={{ maxWidth: svgW, display: 'block', margin: '0 auto' }}>
        {renderEdges()}
        {Object.keys(tree.nodes).map(renderNode)}
      </svg>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Tree data
   ───────────────────────────────────────────────────────────── */

const PROFIT_TREE: TreeDef = {
  rootId: 'profit',
  nodes: {
    profit:  { label: 'Profit',  children: ['revenue', 'cost'] },
    revenue: { label: 'Revenue', children: [] },
    cost:    { label: 'Cost',    children: [] },
  },
}

const REVENUE_TREE: TreeDef = {
  rootId: 'revenue',
  nodes: {
    revenue:      { label: 'Revenue',          children: ['units', 'price'] },
    units:        { label: 'No. of Units Sold', children: ['production', 'distribution', 'demand'] },
    price:        { label: 'Price / Unit',      children: [] },
    production:   { label: 'Production',        children: [] },
    distribution: { label: 'Distribution',      children: [] },
    demand:       { label: 'Demand',            children: [] },
  },
}

const COST_TREE: TreeDef = {
  rootId: 'cost',
  nodes: {
    cost:     { label: 'Cost',                 children: ['numUnits', 'costPerUnit'] },
    numUnits: { label: 'No. of Units',          children: [] },
    costPerUnit: { label: 'Cost / Unit',        children: ['fixed', 'variable'] },
    fixed:    { label: 'Fixed Cost / Unit',     children: [] },
    variable: { label: 'Variable Cost / Unit',  children: [] },
  },
}

/* ─────────────────────────────────────────────────────────────
   Page CSS
   ───────────────────────────────────────────────────────────── */

const PAGE_CSS = `
  .pf-root {
    font-family: 'Work Sans', sans-serif;
    background: #fff8f0;
    color: #453a2a;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  .pf-root *::selection { background: rgba(61,90,53,.15); color: #3b2f2f; }

  /* Scroll reveal */
  .pf-reveal {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity .85s cubic-bezier(.22,1,.36,1),
                transform .85s cubic-bezier(.22,1,.36,1);
  }
  .pf-reveal.visible { opacity: 1; transform: translateY(0); }

  /* Layout */
  .pf-container { max-width: 860px; margin: 0 auto; padding: 0 40px; }
  @media (max-width: 640px) { .pf-container { padding: 0 24px; } }

  /* Breadcrumb */
  .pf-breadcrumb {
    padding: 96px 40px 0;
    max-width: 860px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .24em;
    color: rgba(61,90,53,.45);
  }
  .pf-breadcrumb a { color: inherit; text-decoration: none; transition: color .2s; }
  .pf-breadcrumb a:hover { color: #3D5A35; }
  .pf-breadcrumb-sep { opacity: .4; }
  @media (max-width: 640px) { .pf-breadcrumb { padding: 80px 24px 0; } }

  /* Hero */
  .pf-hero {
    padding: 28px 40px 72px;
    max-width: 860px;
    margin: 0 auto;
    border-bottom: 1px solid rgba(61,90,53,.1);
  }
  @media (max-width: 640px) { .pf-hero { padding: 24px 24px 56px; } }

  .pf-eyebrow {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .3em;
    color: rgba(61,90,53,.5);
    margin-bottom: 16px;
  }
  .pf-headline {
    font-family: 'Newsreader', serif;
    font-size: clamp(38px, 6vw, 64px);
    font-weight: 300;
    line-height: 1.05;
    letter-spacing: -.02em;
    color: #453a2a;
    margin-bottom: 20px;
  }
  .pf-lead {
    font-size: 16px;
    line-height: 1.8;
    color: #5a4f43;
    max-width: 560px;
  }

  /* Section */
  .pf-section { padding: 72px 0; border-bottom: 1px solid rgba(61,90,53,.08); }
  .pf-section:last-of-type { border-bottom: none; }

  .pf-section-eyebrow {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .3em;
    color: rgba(61,90,53,.45);
    margin-bottom: 12px;
  }
  .pf-section-title {
    font-family: 'Newsreader', serif;
    font-size: clamp(22px, 3.2vw, 30px);
    font-weight: 300;
    color: #453a2a;
    letter-spacing: -.01em;
    line-height: 1.25;
    margin-bottom: 28px;
  }
  .pf-body {
    font-size: 15px;
    line-height: 1.85;
    color: #5a4f43;
    margin-bottom: 20px;
    max-width: 620px;
  }
  .pf-body:last-child { margin-bottom: 0; }

  /* Prompt callout */
  .pf-callout {
    border-left: 2px solid #3D5A35;
    padding: 20px 24px;
    background: rgba(61,90,53,.035);
    margin-bottom: 36px;
  }
  .pf-callout-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .28em;
    color: rgba(61,90,53,.5);
    margin-bottom: 10px;
  }
  .pf-callout-text {
    font-family: 'Newsreader', serif;
    font-size: 18px;
    font-style: italic;
    font-weight: 300;
    color: #453a2a;
    line-height: 1.6;
  }

  /* Numbered list */
  .pf-qlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .pf-qlist-item {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    padding: 16px 0;
    border-bottom: 1px solid rgba(61,90,53,.07);
    opacity: 0;
    transform: translateX(-12px);
    transition: opacity .6s cubic-bezier(.22,1,.36,1),
                transform .6s cubic-bezier(.22,1,.36,1);
  }
  .pf-qlist-item.visible { opacity: 1; transform: translateX(0); }
  .pf-qlist-item:first-child { border-top: 1px solid rgba(61,90,53,.07); }
  .pf-qnum {
    font-family: 'Newsreader', serif;
    font-size: 13px;
    font-weight: 300;
    color: rgba(61,90,53,.4);
    min-width: 24px;
    padding-top: 2px;
    flex-shrink: 0;
  }
  .pf-qtext {
    font-size: 15px;
    line-height: 1.7;
    color: #5a4f43;
  }

  /* Tree wrapper */
  .pf-tree-wrap {
    margin-top: 36px;
    padding: 32px 24px;
    background: rgba(255,248,240,0.7);
    border: 1px solid rgba(61,90,53,.1);
  }
  .pf-tree-caption {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .28em;
    color: rgba(61,90,53,.4);
    margin-bottom: 20px;
    text-align: center;
  }

  /* Driver cards */
  .pf-driver-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 40px;
  }
  @media (max-width: 720px) { .pf-driver-grid { grid-template-columns: 1fr; } }

  .pf-driver-card {
    border-top: 2px solid rgba(61,90,53,.15);
    padding-top: 20px;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity .7s cubic-bezier(.22,1,.36,1),
                transform .7s cubic-bezier(.22,1,.36,1);
  }
  .pf-driver-card.visible { opacity: 1; transform: translateY(0); }
  .pf-driver-name {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .26em;
    color: #3D5A35;
    margin-bottom: 16px;
  }
  .pf-driver-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pf-driver-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 14px;
    line-height: 1.6;
    color: #5a4f43;
  }
  .pf-driver-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(61,90,53,.35);
    margin-top: 7px;
    flex-shrink: 0;
  }
  .pf-driver-sub {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .2em;
    color: rgba(61,90,53,.5);
    margin-top: 14px;
    margin-bottom: 8px;
  }

  /* Cost breakdown columns */
  .pf-cost-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    margin-top: 36px;
    border: 1px solid rgba(61,90,53,.12);
  }
  @media (max-width: 640px) { .pf-cost-cols { grid-template-columns: 1fr; } }

  .pf-cost-col-head {
    padding: 12px 20px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .24em;
    color: #f0f5ee;
    background: #3D5A35;
  }
  .pf-cost-col-body {
    background: rgba(255,248,240,.9);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pf-cost-col-divider {
    background: rgba(61,90,53,.06);
    width: 2px;
  }
  .pf-cost-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 14px;
    line-height: 1.5;
    color: #5a4f43;
  }
  .pf-cost-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(61,90,53,.3);
    margin-top: 6px;
    flex-shrink: 0;
  }

  /* Note */
  .pf-note {
    margin-top: 20px;
    font-size: 13px;
    line-height: 1.7;
    color: rgba(90,79,67,.7);
    font-style: italic;
  }

  /* Principle cards */
  .pf-principle-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-top: 8px;
  }
  @media (max-width: 640px) { .pf-principle-grid { grid-template-columns: 1fr; } }
  .pf-principle {
    padding: 24px;
    border: 1px solid rgba(61,90,53,.1);
    background: rgba(61,90,53,.025);
    opacity: 0;
    transform: translateY(14px);
    transition: opacity .7s cubic-bezier(.22,1,.36,1),
                transform .7s cubic-bezier(.22,1,.36,1);
  }
  .pf-principle.visible { opacity: 1; transform: translateY(0); }
  .pf-principle-title {
    font-family: 'Newsreader', serif;
    font-size: 17px;
    font-style: italic;
    font-weight: 300;
    color: #453a2a;
    margin-bottom: 10px;
  }
  .pf-principle-body {
    font-size: 13px;
    line-height: 1.75;
    color: #6b5d50;
  }
`

/* ─────────────────────────────────────────────────────────────
   Main component
   ───────────────────────────────────────────────────────────── */

export default function ProfitabilityFramework() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const el = entry.target as HTMLElement
          const delay = parseInt(el.dataset.delay ?? '0', 10)
          setTimeout(() => el.classList.add('visible'), delay)
          io.unobserve(el)
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    )
    root.querySelectorAll('.pf-reveal, .pf-qlist-item, .pf-driver-card, .pf-principle').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div ref={rootRef} className="pf-root">
      <style>{PAGE_CSS}</style>

      {/* Breadcrumb */}
      <nav className="pf-breadcrumb" aria-label="Breadcrumb">
        <Link href="/repository" className="pf-breadcrumb-a">Repository</Link>
        <span className="pf-breadcrumb-sep">/</span>
        <span style={{ color: 'rgba(61,90,53,.7)' }}>Profitability</span>
      </nav>

      {/* Hero */}
      <header className="pf-hero">
        <span className="pf-eyebrow pf-reveal" data-delay="0">Framework</span>
        <h1 className="pf-headline pf-reveal" data-delay="60">Profitability</h1>
        <p className="pf-lead pf-reveal" data-delay="130">
          Profit problems require you to isolate whether the issue lies on the revenue side,
          the cost side, or both. This framework walks through how to structure that diagnosis
          systematically.
        </p>
      </header>

      <main>
        {/* Section 1 — Setup */}
        <section className="pf-section">
          <div className="pf-container">
            <span className="pf-section-eyebrow pf-reveal" data-delay="0">The Setup</span>
            <h2 className="pf-section-title pf-reveal" data-delay="60">
              What a typical prompt looks like
            </h2>

            <div className="pf-callout pf-reveal" data-delay="120">
              <p className="pf-callout-label">Example prompt</p>
              <p className="pf-callout-text">
                "Your client's profits are down by 20%. Analyse the reason for the same by
                isolating the problem."
              </p>
            </div>

            <p className="pf-body pf-reveal" data-delay="160">
              Before structuring an answer, get oriented by asking the right preliminary questions.
              These help narrow the scope early and avoid going down irrelevant paths.
            </p>

            <ol className="pf-qlist" aria-label="Preliminary questions">
              {[
                'Since when has the client been facing this problem, and what is the magnitude of the decline?',
                'Where is the client located geographically?',
                'Which part of the value chain does the client operate in?',
                'Is this a company-specific problem or an industry-wide one?',
                'Segmentation questions: does the decline affect all stores, all geographies, all product lines, and all customers?',
              ].map((q, i) => (
                <li key={i} className="pf-qlist-item" data-delay={String(i * 80)}>
                  <span className="pf-qnum">{i + 1}</span>
                  <span className="pf-qtext">{q}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Section 2 — Core Equation */}
        <section className="pf-section">
          <div className="pf-container">
            <span className="pf-section-eyebrow pf-reveal" data-delay="0">The Big Picture</span>
            <h2 className="pf-section-title pf-reveal" data-delay="60">
              The problem stems from revenue, cost, or both
            </h2>
            <p className="pf-body pf-reveal" data-delay="120">
              Every profitability case starts here. Determine which side of the equation is
              responsible before going deeper into either branch.
            </p>

            <div className="pf-tree-wrap pf-reveal" data-delay="160">
              <p className="pf-tree-caption">Profit decomposition</p>
              <StaticTree tree={PROFIT_TREE} />
            </div>
          </div>
        </section>

        {/* Section 3 — Revenue */}
        <section className="pf-section">
          <div className="pf-container">
            <span className="pf-section-eyebrow pf-reveal" data-delay="0">Revenue Analysis</span>
            <h2 className="pf-section-title pf-reveal" data-delay="60">
              Revenue is driven by volume and price
            </h2>
            <p className="pf-body pf-reveal" data-delay="120">
              Revenue equals the number of units sold multiplied by the price per unit. Volume
              problems can be traced to production, distribution, or demand. Price problems
              require a separate line of inquiry.
            </p>

            <div className="pf-tree-wrap pf-reveal" data-delay="160">
              <p className="pf-tree-caption">Revenue decomposition</p>
              <StaticTree tree={REVENUE_TREE} />
            </div>

            {/* Driver cards */}
            <div className="pf-driver-grid">
              {/* Production */}
              <div className="pf-driver-card" data-delay="0">
                <p className="pf-driver-name">Production</p>
                <ul className="pf-driver-list">
                  {[
                    'Number of manufacturing units',
                    'Capacity of each unit',
                    'Production capacity being used',
                    'Defects in manufactured goods',
                  ].map((item, i) => (
                    <li key={i} className="pf-driver-item">
                      <span className="pf-driver-dot" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Distribution */}
              <div className="pf-driver-card" data-delay="80">
                <p className="pf-driver-name">Distribution</p>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(90,79,67,.7)', marginBottom: 14 }}>
                  Begin by asking the mode of distribution adopted by the client and benchmark it against competitors.
                </p>
                <ul className="pf-driver-list">
                  {[
                    'Number of distributors',
                    'Amount sold per distributor (affected by monetary and non-monetary factors)',
                  ].map((item, i) => (
                    <li key={i} className="pf-driver-item">
                      <span className="pf-driver-dot" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Demand */}
              <div className="pf-driver-card" data-delay="160">
                <p className="pf-driver-name">Demand</p>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(90,79,67,.7)', marginBottom: 14 }}>
                  Begin by understanding whether all revenue streams have been affected equally.
                </p>

                <p className="pf-driver-sub">Product-centric</p>
                <ul className="pf-driver-list" style={{ marginBottom: 14 }}>
                  {['Number of products sold', 'Price of products sold', 'Product mix'].map((item, i) => (
                    <li key={i} className="pf-driver-item">
                      <span className="pf-driver-dot" />
                      {item}
                    </li>
                  ))}
                </ul>

                <p className="pf-driver-sub">Sales-centric</p>
                <ul className="pf-driver-list" style={{ marginBottom: 14 }}>
                  {['Number of sales and average ticket size', 'Or: Footfall, Conversion, and Average ticket size (where Sales = Footfall × Conversion)'].map((item, i) => (
                    <li key={i} className="pf-driver-item">
                      <span className="pf-driver-dot" />
                      {item}
                    </li>
                  ))}
                </ul>

                <p className="pf-driver-sub">Customer-centric</p>
                <ul className="pf-driver-list">
                  {['Number of customers', 'Revenue per customer'].map((item, i) => (
                    <li key={i} className="pf-driver-item">
                      <span className="pf-driver-dot" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="pf-note pf-reveal" data-delay="0">
              Don't restrict yourself to one framework. The right lens depends on how the business
              is structured.
            </p>
          </div>
        </section>

        {/* Section 4 — Cost */}
        <section className="pf-section">
          <div className="pf-container">
            <span className="pf-section-eyebrow pf-reveal" data-delay="0">Cost Analysis</span>
            <h2 className="pf-section-title pf-reveal" data-delay="60">
              Cost is units times cost per unit
            </h2>
            <p className="pf-body pf-reveal" data-delay="120">
              For cost-side problems, draw a process map or divide costs into fixed and variable.
              Cost per unit varies by industry but typically breaks into the categories below.
            </p>

            <div className="pf-tree-wrap pf-reveal" data-delay="160">
              <p className="pf-tree-caption">Cost decomposition</p>
              <StaticTree tree={COST_TREE} />
            </div>

            <div className="pf-cost-cols pf-reveal" data-delay="0">
              <div>
                <div className="pf-cost-col-head">Fixed Cost / Unit</div>
                <div className="pf-cost-col-body">
                  {['Land', 'Building', 'Salaries (fixed component)', 'Equipment', 'Furniture', 'Machinery', 'Warehouses', 'Fixed charges — interest payments, insurance, marketing, taxes'].map((item, i) => (
                    <div key={i} className="pf-cost-item">
                      <span className="pf-cost-dot" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="pf-cost-col-head">Variable Cost / Unit</div>
                <div className="pf-cost-col-body">
                  {['Raw material', 'Transportation', 'Processing', 'Packaging', 'Storage', 'Distribution', 'Marketing', 'After-sales expenses'].map((item, i) => (
                    <div key={i} className="pf-cost-item">
                      <span className="pf-cost-dot" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="pf-note pf-reveal" data-delay="0">
              This is an indicative, not exhaustive, list. The components will vary depending on
              the industry.
            </p>
          </div>
        </section>

        {/* Section 5 — Principles */}
        <section className="pf-section" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div className="pf-container">
            <span className="pf-section-eyebrow pf-reveal" data-delay="0">Keep in Mind</span>
            <h2 className="pf-section-title pf-reveal" data-delay="60">
              Four things that matter in every profitability case
            </h2>

            <div className="pf-principle-grid">
              {[
                {
                  title: 'Ask before you structure',
                  body: 'Preliminary questions narrow the problem before you draw any tree. Never skip them.',
                  delay: 0,
                },
                {
                  title: 'Isolate before you solve',
                  body: 'Confirm whether the issue is revenue, cost, or both before going one level deeper.',
                  delay: 80,
                },
                {
                  title: 'Benchmark everything',
                  body: 'A cost that looks high in isolation may be industry-standard. Always ask what is normal for the sector.',
                  delay: 160,
                },
                {
                  title: 'One framework is rarely enough',
                  body: 'Mix product-centric, sales-centric, and customer-centric lenses depending on how the business is organised.',
                  delay: 240,
                },
              ].map(({ title, body, delay }) => (
                <div key={title} className="pf-principle" data-delay={String(delay)}>
                  <p className="pf-principle-title">{title}</p>
                  <p className="pf-principle-body">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <div style={{ marginTop: 80 }}>
        <Footer currentPage="repository" />
      </div>
    </div>
  )
}

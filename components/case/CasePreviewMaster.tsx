'use client'

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/dashboard/Navbar'

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

type TranscriptSpeaker = 'candidate' | 'interviewer' | 'neutral'
type TranscriptDisplayLine = { text: string; speaker: TranscriptSpeaker }
type ParsedFramework = {
  transcriptLines: string[]
  summaryTitle: string | null
  summaryRows: Array<{ label: string; value: string }>
  recommendations: string[]
}

type WalkthroughBlock =
  | { key: string; kind: 'heading'; text: string }
  | { key: string; kind: 'equation'; text: string; speaker: TranscriptSpeaker }
  | { key: string; kind: 'bullet'; marker: string; text: string; speaker: TranscriptSpeaker }
  | { key: string; kind: 'line'; text: string; speaker: TranscriptSpeaker }

export type FrameworkNode = {
  id: string
  label: string
  tone: 'root' | 'branch' | 'support' | 'leaf'
  children: readonly string[]
}

export type FrameworkTree = {
  nodes: Record<string, FrameworkNode>
  defaultExpanded: string[]
  defaultFocusedId: string
  notes: { title: string; items: string[] }[]
}

export type CasePreviewMasterProps = {
  caseData: { title: string; prompt?: string; framework?: string }
  previewMode: boolean
  transcriptDisplayLines: TranscriptDisplayLine[]
  parsedFramework: ParsedFramework
  promptLines: string[]
  caseTypeLabel: string
  industryLabel: string
  difficultyLabel: string
  companyLabel: string
  roundLabel: string
  ForumSection?: ReactNode
  frameworkTree?: FrameworkTree
}

/* ═══════════════════════════════════════════════════════════
   Default Framework Tree — Banking on You (fallback)
   ═══════════════════════════════════════════════════════════ */

const BANKING_ON_YOU_TREE: FrameworkTree = {
  nodes: {
    'revenue':               { id: 'revenue',               label: 'Revenue',                tone: 'root',    children: ['interest-on-loans','fees-and-penalties','interest-on-investments','locker-charges','ancillary'] },
    'interest-on-loans':     { id: 'interest-on-loans',     label: 'Interest on Loans',      tone: 'branch',  children: ['amount-of-loans','interest-rate','percent-collected'] },
    'fees-and-penalties':    { id: 'fees-and-penalties',    label: 'Fees & Penalties',        tone: 'support', children: [] },
    'interest-on-investments':{ id: 'interest-on-investments', label: 'Interest on Investments', tone: 'support', children: [] },
    'locker-charges':        { id: 'locker-charges',        label: 'Locker Charges',          tone: 'support', children: [] },
    'ancillary':             { id: 'ancillary',             label: 'Ancillary',               tone: 'support', children: [] },
    'amount-of-loans':       { id: 'amount-of-loans',       label: 'Amount of Loans',         tone: 'branch',  children: ['supply-side','demand-side'] },
    'interest-rate':         { id: 'interest-rate',         label: 'Interest Rate',           tone: 'support', children: [] },
    'percent-collected':     { id: 'percent-collected',     label: '% Collected',             tone: 'support', children: [] },
    'supply-side':           { id: 'supply-side',           label: 'Supply-Side',             tone: 'branch',  children: ['deposits','other-sources'] },
    'demand-side':           { id: 'demand-side',           label: 'Demand-Side',             tone: 'support', children: [] },
    'deposits':              { id: 'deposits',              label: 'Deposits',                tone: 'branch',  children: ['num-depositors','amount-per-person'] },
    'other-sources':         { id: 'other-sources',         label: 'Other Sources',           tone: 'support', children: [] },
    'num-depositors':        { id: 'num-depositors',        label: 'No. of Depositors',       tone: 'support', children: [] },
    'amount-per-person':     { id: 'amount-per-person',     label: 'Amount per Person',       tone: 'branch',  children: ['amount-earned','percent-deposited'] },
    'amount-earned':         { id: 'amount-earned',         label: 'Amount Earned',           tone: 'support', children: [] },
    'percent-deposited':     { id: 'percent-deposited',     label: '% Deposited',             tone: 'branch',  children: ['alternatives','policies','consumption'] },
    'alternatives':          { id: 'alternatives',          label: 'Alternatives',            tone: 'leaf',    children: [] },
    'policies':              { id: 'policies',              label: 'Policies',                tone: 'leaf',    children: [] },
    'consumption':           { id: 'consumption',           label: 'Consumption',             tone: 'leaf',    children: [] },
  },
  defaultExpanded: ['revenue','interest-on-loans','amount-of-loans','supply-side','deposits','amount-per-person','percent-deposited'],
  defaultFocusedId: 'alternatives',
  notes: [
    { title: 'Questions', items: ['Which revenue stream?', 'Where are the branches concentrated?'] },
    { title: 'Keep In Mind', items: ['Know all five revenue streams', 'Loans: supply vs. demand split', 'Segment deposits by customer profile'] },
    { title: 'Brownie Points', items: ['Increased consumption expenditure', 'Salary-account tie-ups and policy nudges'] },
  ],
}

/* ═══════════════════════════════════════════════════════════
   Module-level tree state — set by main component from props.
   Single-instance page component, safe for module scope.
   ═══════════════════════════════════════════════════════════ */

let NODES: Record<string, FrameworkNode> = {}
let PARENTS: Record<string, string> = {}
let ROOT_ID = ''
let DEFAULT_EXPANDED = new Set<string>()
let DEFAULT_FOCUSED_ID = ''
let NOTES: { title: string; items: string[] }[] = []


/* ═══════════════════════════════════════════════════════════
   Tree Utilities
   ═══════════════════════════════════════════════════════════ */

function pathTo(id: string): string[] {
  const p: string[] = []
  let c: string | undefined = id
  while (c) { p.unshift(c); c = PARENTS[c] }
  return p
}

function descendants(id: string): string[] {
  const node = NODES[id]
  if (!node) return []
  const out: string[] = []
  for (const ch of node.children) { out.push(ch, ...descendants(ch)) }
  return out
}

function collectVisible(id: string, expanded: Set<string>, out: Set<string>) {
  out.add(id)
  if (!expanded.has(id)) return
  const node = NODES[id]
  if (!node) return
  for (const ch of node.children) collectVisible(ch, expanded, out)
}

function nodeDepth(id: string) { return pathTo(id).length - 1 }

/* ═══════════════════════════════════════════════════════════
   Walkthrough Block Parser
   ═══════════════════════════════════════════════════════════ */

function isSectionHeading(v: string) { return /^[A-Z][A-Z0-9\s&'/-]{6,}$/.test(v) }
function isEquation(v: string) { return v.includes('=') && /[*xX×]/.test(v) }
function fmtEquation(v: string) { return v.replace(/\s+/g, ' ').trim().replace(/\s*\*\s*/g, ' × ') }

function buildBlocks(lines: TranscriptDisplayLine[]): WalkthroughBlock[] {
  return lines.flatMap((e, i): WalkthroughBlock[] => {
    const n = e.text.trim()
    if (!n) return []
    if (isSectionHeading(n)) return [{ key: `h-${i}`, kind: 'heading', text: n }]
    if (isEquation(n)) return [{ key: `eq-${i}`, kind: 'equation', text: fmtEquation(n), speaker: e.speaker }]
    const bm = n.match(/^(\d+[\).]|[-•])\s*(.+)$/)
    if (bm) return [{ key: `b-${i}`, kind: 'bullet', marker: bm[1], text: bm[2], speaker: e.speaker }]
    return [{ key: `l-${i}`, kind: 'line', text: n, speaker: e.speaker }]
  })
}

/* ═══════════════════════════════════════════════════════════
   Desktop Chart Layout Algorithm
   ═══════════════════════════════════════════════════════════ */

function estNodeW(id: string) {
  const node = NODES[id]
  if (!node) return 188

  const labelLength = node.label.replace(/\s+/g, '').length
  const wordCount = node.label.split(/\s+/).length
  const base =
    node.tone === 'root' ? 172 :
    node.tone === 'branch' ? 156 :
    node.tone === 'support' ? 132 :
    122
  const charBoost = Math.min(labelLength * 1.35, node.tone === 'support' ? 18 : 22)
  const wordBoost = Math.max(0, wordCount - 1) * 5
  const maxWidth =
    node.tone === 'root' ? 212 :
    node.tone === 'branch' ? 188 :
    node.tone === 'support' ? 156 :
    146

  return Math.max(base, Math.min(base + charBoost + wordBoost, maxWidth))
}

function estNodeFootprint(id: string) {
  const node = NODES[id]
  const labelWidth = estNodeW(id)
  return labelWidth + (node?.children.length ? 34 : 0)
}

function layoutDesktop(
  ids: string[], width: number, height: number, topPad: number, bottomPad: number,
) {
  const pos = new Map<string, { x: number; y: number }>()
  const nw = new Map<string, number>()
  const vis = new Set(ids)
  const maxD = Math.max(...ids.map(nodeDepth), 0)
  const vStep = maxD === 0 ? 0 : (height - topPad - bottomPad) / maxD
  const hPad = Math.min(20, width * 0.02)
  const sub = new Map<string, number>()
  const gapFor = (childCount: number, depth: number) => {
    if (childCount >= 5) return 10
    if (childCount === 4) return 14
    if (childCount === 3) return depth <= 1 ? 16 : 18
    return depth <= 1 ? 18 : 20
  }

  const measure = (id: string): number => {
    if (!vis.has(id)) return 0
    const ow = estNodeW(id); nw.set(id, ow)
    const footprint = estNodeFootprint(id)
    const vc = NODES[id].children.filter(c => vis.has(c))
    if (!vc.length) { sub.set(id, footprint); return footprint }
    const localGap = gapFor(vc.length, nodeDepth(id))
    const cw = vc.reduce((s, c, i) => s + measure(c) + (i > 0 ? localGap : 0), 0)
    const tw = Math.max(footprint, cw); sub.set(id, tw); return tw
  }

  const assign = (id: string, sx: number, ex: number) => {
    const d = nodeDepth(id)
    const vc = NODES[id].children.filter(c => vis.has(c))
    const y = topPad + vStep * d
    if (!vc.length) { pos.set(id, { x: (sx + ex) / 2, y }); return }
    const localGap = gapFor(vc.length, d)
    const cw = vc.reduce((s, c, i) => s + (sub.get(c) ?? estNodeW(c)) + (i > 0 ? localGap : 0), 0)
    const tw = Math.max(ex - sx, cw)
    let cur = sx + (tw - cw) / 2
    vc.forEach(c => { const w = sub.get(c) ?? estNodeW(c); assign(c, cur, cur + w); cur += w + localGap })
    const cx = vc.map(c => pos.get(c)?.x).filter((v): v is number => typeof v === 'number')
    pos.set(id, { x: cx.length ? cx.reduce((a, b) => a + b, 0) / cx.length : (sx + ex) / 2, y })
  }

  measure(ROOT_ID)
  assign(ROOT_ID, hPad, hPad + Math.max(width - hPad * 2, 1))

  // Scale if overflowing
  const effW = new Map(nw)
  const aL = hPad / 2, aR = width - hPad / 2, aW = Math.max(aR - aL, 1)
  const laneInsetLeft = Math.min(Math.max(width * 0.018, 12), 24)
  const laneInsetRight = Math.min(Math.max(width * 0.014, 10), 20)
  const laneL = aL + laneInsetLeft
  const laneR = aR - laneInsetRight
  const laneW = Math.max(laneR - laneL, 1)
  let bounds = ids.reduce((b, id) => {
    const p = pos.get(id)
    const labelW = effW.get(id) ?? estNodeW(id)
    if (!p) return b
    const footprint = labelW + (NODES[id].children.length > 0 ? 34 : 0)
    return { minX: Math.min(b.minX, p.x - labelW / 2), maxX: Math.max(b.maxX, p.x - labelW / 2 + footprint) }
  }, { minX: Infinity, maxX: -Infinity })

  if (isFinite(bounds.minX) && bounds.maxX - bounds.minX > aW) {
    const ctr = (bounds.minX + bounds.maxX) / 2, scale = aW / (bounds.maxX - bounds.minX)
    ids.forEach(id => {
      const p = pos.get(id); if (!p) return
      const hc = NODES[id].children.length > 0
      const cw = effW.get(id) ?? estNodeW(id)
      pos.set(id, { x: ctr + (p.x - ctr) * scale, y: p.y })
      effW.set(id, Math.max(hc ? 132 : 116, cw * scale))
    })
  }

  // Centre-shift
  bounds = ids.reduce((b, id) => {
    const p = pos.get(id)
    const labelW = effW.get(id) ?? estNodeW(id)
    if (!p) return b
    const footprint = labelW + (NODES[id].children.length > 0 ? 34 : 0)
    return { minX: Math.min(b.minX, p.x - labelW / 2), maxX: Math.max(b.maxX, p.x - labelW / 2 + footprint) }
  }, { minX: Infinity, maxX: -Infinity })

  if (isFinite(bounds.minX)) {
    const effectiveFootprint = (id: string) => (effW.get(id) ?? estNodeW(id)) + (NODES[id].children.length > 0 ? 34 : 0)

    const shiftVisibleSubtree = (id: string, delta: number) => {
      if (!delta) return
      const point = pos.get(id)
      if (point) pos.set(id, { x: point.x + delta, y: point.y })
      NODES[id].children
        .filter((childId) => vis.has(childId))
        .forEach((childId) => shiftVisibleSubtree(childId, delta))
    }

    const parentIds = ids
      .filter((id) => NODES[id].children.some((childId) => vis.has(childId)))
      .sort((left, right) => nodeDepth(left) - nodeDepth(right))

    parentIds.forEach((parentId) => {
      const parentPoint = pos.get(parentId)
      if (!parentPoint) return

      const children = NODES[parentId].children.filter((childId) => vis.has(childId))
      if (children.length <= 1) return

      const rowLeft = parentId === ROOT_ID ? laneL : aL
      const rowRight = parentId === ROOT_ID ? laneR : aR
      const rowWidth = Math.max(rowRight - rowLeft, 1)
      const defaultGap = gapFor(children.length, nodeDepth(parentId))
      const footprintSum = children.reduce((sum, childId) => sum + effectiveFootprint(childId), 0)
      const packedGap =
        children.length > 1
          ? parentId === ROOT_ID
            ? Math.max(defaultGap, (rowWidth - footprintSum) / (children.length - 1))
            : Math.max(8, Math.min(defaultGap, (rowWidth - footprintSum) / (children.length - 1)))
          : defaultGap
      const groupWidth = footprintSum + packedGap * Math.max(children.length - 1, 0)
      const desiredLeft =
        parentId === ROOT_ID
          ? Math.max(rowLeft, Math.min((rowLeft + rowRight - groupWidth) / 2, rowRight - groupWidth))
          : Math.max(rowLeft, Math.min(parentPoint.x - groupWidth / 2, rowRight - groupWidth))

      let cursor = desiredLeft
      children.forEach((childId) => {
        const footprint = effectiveFootprint(childId)
        const currentPoint = pos.get(childId)
        if (!currentPoint) return
        const targetX = cursor + footprint / 2
        shiftVisibleSubtree(childId, targetX - currentPoint.x)
        cursor += footprint + packedGap
      })
    })

    bounds = ids.reduce((b, id) => {
      const p = pos.get(id)
      const labelW = effW.get(id) ?? estNodeW(id)
      if (!p) return b
      const footprint = labelW + (NODES[id].children.length > 0 ? 34 : 0)
      return { minX: Math.min(b.minX, p.x - labelW / 2), maxX: Math.max(b.maxX, p.x - labelW / 2 + footprint) }
    }, { minX: Infinity, maxX: -Infinity })

    const treeW = bounds.maxX - bounds.minX
    const freeSpace = Math.max(laneW - treeW, 0)
    const preferredLeft =
      treeW < laneW
        ? laneL + freeSpace / 2
        : laneL

    let shift = preferredLeft - bounds.minX
    if (bounds.maxX + shift > laneR) shift += laneR - (bounds.maxX + shift)
    if (bounds.minX + shift < laneL) shift += laneL - (bounds.minX + shift)
    if (shift) ids.forEach(id => { const p = pos.get(id); if (p) pos.set(id, { x: p.x + shift, y: p.y }) })

    const rootPoint = pos.get(ROOT_ID)
    const rootNode = NODES[ROOT_ID]
    const visibleRootChildren = rootNode ? rootNode.children.filter((childId) => vis.has(childId)) : []
    if (rootPoint && visibleRootChildren.length > 0) {
      bounds = ids.reduce((b, id) => {
        const p = pos.get(id)
        const labelW = effW.get(id) ?? estNodeW(id)
        if (!p) return b
        const footprint = labelW + (NODES[id].children.length > 0 ? 34 : 0)
        return { minX: Math.min(b.minX, p.x - labelW / 2), maxX: Math.max(b.maxX, p.x - labelW / 2 + footprint) }
      }, { minX: Infinity, maxX: -Infinity })

      const targetSideGap = isFinite(bounds.minX) ? Math.max(bounds.minX - aL, 0) : 0
      const currentRootLeft = visibleRootChildren.reduce((acc, childId) => {
        const childPoint = pos.get(childId)
        if (!childPoint) return acc
        const childWidth = effW.get(childId) ?? estNodeW(childId)
        return Math.min(acc, childPoint.x - childWidth / 2)
      }, Infinity)

      if (isFinite(currentRootLeft)) {
        const footprintSum = visibleRootChildren.reduce((sum, childId) => sum + effectiveFootprint(childId), 0)
        const targetRight = aR - targetSideGap
        const availableWidth = Math.max(targetRight - currentRootLeft, footprintSum)
        const rootGap =
          visibleRootChildren.length > 1
            ? Math.max(gapFor(visibleRootChildren.length, 0), (availableWidth - footprintSum) / (visibleRootChildren.length - 1))
            : 0

        let cursor = currentRootLeft
        visibleRootChildren.forEach((childId) => {
          const footprint = effectiveFootprint(childId)
          const currentPoint = pos.get(childId)
          if (!currentPoint) return
          const targetX = cursor + footprint / 2
          shiftVisibleSubtree(childId, targetX - currentPoint.x)
          cursor += footprint + rootGap
        })
      }

      const childBounds = visibleRootChildren.reduce((acc, childId) => {
        const childPoint = pos.get(childId)
        if (!childPoint) return acc
        const childWidth = effW.get(childId) ?? estNodeW(childId)
        return {
          minX: Math.min(acc.minX, childPoint.x - childWidth / 2),
          maxX: Math.max(acc.maxX, childPoint.x + childWidth / 2),
        }
      }, { minX: Infinity, maxX: -Infinity })

      if (isFinite(childBounds.minX) && isFinite(childBounds.maxX)) {
        const rootWidth = effW.get(ROOT_ID) ?? estNodeW(ROOT_ID)
        const rootFootprint = rootWidth + ((rootNode?.children.length ?? 0) > 0 ? 34 : 0)
        const minRootX = laneL + rootWidth / 2
        const maxRootX = laneR - rootFootprint + rootWidth / 2
        const targetRootX = Math.max(minRootX, Math.min((childBounds.minX + childBounds.maxX) / 2, maxRootX))
        pos.set(ROOT_ID, { x: targetRootX, y: rootPoint.y })
      }
    }
  }

  return { positions: pos, nodeWidths: effW }
}

/* ═══════════════════════════════════════════════════════════
   Small UI Components
   ═══════════════════════════════════════════════════════════ */

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [vis, setVis] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { rootMargin: '0px 0px -60px 0px', threshold: 0.1 })
    obs.observe(el); return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={className} style={{
      opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(18px)',
      filter: vis ? 'blur(0px)' : 'blur(6px)',
      transition: 'opacity 0.72s cubic-bezier(0.22,1,0.36,1), transform 0.72s cubic-bezier(0.22,1,0.36,1), filter 0.6s ease',
    }}>
      {children}
    </div>
  )
}

function ChevronChip({ expanded }: { expanded: boolean }) {
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center transition-opacity duration-200 opacity-30 hover:opacity-60">
      <span className="relative block h-2.5 w-2.5">
        <span className="absolute left-0 top-1/2 h-[1px] w-full -translate-y-1/2 bg-[#5C4033]" />
        <span className={`absolute left-1/2 top-0 h-full w-[1px] -translate-x-1/2 bg-[#5C4033] transition-all duration-300 ${expanded ? 'scale-y-0 opacity-0' : 'scale-y-100 opacity-100'}`} />
      </span>
    </span>
  )
}

/* ─── Sidebar: Meta field card ─────────────────────── */

const MetaField = ({ label, value, index = 0 }: { label: string; value: string; index?: number }) => (
  <div
    className="border border-b-0 border-[rgba(61,90,53,0.10)] backdrop-blur-sm first:rounded-t-xl cpm-fade-up"
    style={{
      background: 'rgba(255,248,240,0.80)',
      animationDelay: `${index * 100}ms`,
    }}
  >
    <div className="px-4 pt-2.5 pb-0.5">
      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#5C4033]/50">
        {label}
      </p>
    </div>
    <div className="px-4 pb-2.5">
      <p className="text-base font-medium text-[#3B2F2F] tracking-tight" style= {{fontFamily: "'Newsreader', serif" }}>
        {value}
      </p>
    </div>
  </div>
);

/* ─── Sidebar: Difficulty bar chart ────────────────── */

const DifficultyBar = ({ level, index = 0 }: { level: number; index?: number }) => {
  const filled = level;
  return (
    <div
      className="border border-[rgba(61,90,53,0.10)] rounded-b-xl backdrop-blur-sm cpm-fade-up"
      style={{
        background: 'rgba(255,248,240,0.80)',
        animationDelay: `${index * 100}ms`,
      }}
    >
      <div className="px-4 pt-2.5 pb-0.5">
        <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#5C4033]/50">
          DIFFICULTY
        </p>
      </div>
      <div className="px-4 pt-1 pb-3 flex items-center gap-1.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-5 w-3 rounded-sm transition-all duration-500"
            style=
              {{backgroundColor: i <= filled ? '#3D5A35' : 'rgba(217,208,196,0.3)',}}
            
          />
        ))}
      </div>
    </div>
  );
};

/* ─── Sidebar: Note card (framework section) ───────── */

function NoteCard({ title, items, className = '' }: { title: string; items: string[]; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px] transition-all duration-300 hover:shadow-[0_8px_24px_-8px_rgba(58,45,35,0.12)] hover:-translate-y-0.5 ${className}`}>
      <div className="bg-[#D9D0C4]/50 px-4 py-2.5">
        <span className="block text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#5C4033]">{title}</span>
      </div>
      <div className="h-full px-4 py-4">
        <ul className="mx-auto flex max-w-[13.25rem] flex-col space-y-3">
          {items.map(item => (
            <li key={item} className="flex items-start justify-center gap-2.5 text-[13px] leading-relaxed text-[#5C4033]/80">
              <span className="mt-[0.48rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#3D5A35]/40" />
              <span className="flex-1 text-left" style={{ textWrap: 'pretty' }}>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Walkthrough Block Renderer
   ═══════════════════════════════════════════════════════════ */

function walkthroughSpeakerTone(speaker: TranscriptSpeaker) {
  return speaker === 'interviewer'
    ? 'font-semibold text-[#3B2F2F]'
    : speaker === 'candidate'
      ? 'font-normal text-[#5C4033]/70'
      : 'font-normal text-[#5C4033]'
}

function WalkthroughBlockView({ block }: { block: WalkthroughBlock }) {
  if (block.kind === 'heading') {
    return (
      <div className="pt-3 pb-0.5">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#3D5A35]/50">{block.text}</h4>
        <div className="mt-1.5 h-[1px] w-14" style={{ background: 'linear-gradient(90deg, rgba(61,90,53,0.2), transparent)' }} />
      </div>
    )
  }
  if (block.kind === 'equation') {
    return (
      <p className={`text-center text-[16px] leading-[1.5] tracking-[0.01em] ${walkthroughSpeakerTone(block.speaker)}`}>
        {block.text}
      </p>
    )
  }
  if (block.kind === 'bullet') {
    return (
      <div className={`ml-5 flex gap-3 ${walkthroughSpeakerTone(block.speaker)}`}>
        <span className="min-w-[1.2rem] text-[16px] leading-[1.5]">{block.marker}</span>
        <p className="text-[16px] leading-[1.5]">{block.text}</p>
      </div>
    )
  }
  return (
    <p className={`text-[16px] leading-[1.5] ${walkthroughSpeakerTone(block.speaker)}`}>
      {block.text}
    </p>
  )
}

function walkthroughSpacingClass(block: WalkthroughBlock, previous?: WalkthroughBlock) {
  if (!previous) return ''

  if (block.kind === 'heading') return 'mt-6'
  if (previous.kind === 'heading') return block.kind === 'equation' ? 'mt-3.5' : 'mt-3'

  if (block.kind === 'equation' || previous.kind === 'equation') return 'mt-4'

  if (block.kind === 'bullet') return previous.kind === 'bullet' ? 'mt-2' : 'mt-3'
  if (previous.kind === 'bullet') return 'mt-3.5'

  if (block.kind === 'line' && previous.kind === 'line') {
    return block.speaker !== previous.speaker ? 'mt-[18px]' : 'mt-2.5'
  }

  return 'mt-3'
}

/* ═══════════════════════════════════════════════════════════
   Desktop Framework Chart
   ═══════════════════════════════════════════════════════════ */

function DesktopChart({
  visibleIds, expandedIds, focusedId, onSelect, onToggle, revealDepth, edgeAnimKey,
}: {
  visibleIds: string[]
  expandedIds: Set<string>
  focusedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  revealDepth: number
  edgeAnimKey: number
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [cW, setCW] = useState(980)
  const started = revealDepth >= 0
  const defaultPath = useMemo(() => pathTo(DEFAULT_FOCUSED_ID), [])
  const maxD = useMemo(() => Math.max(...visibleIds.map(nodeDepth), 0), [visibleIds])

  // Fixed vStep matched to original 6-level tree: (520-42-36)/6 ≈ 74px
  const FIXED_V_STEP = 74
  const metrics = useMemo(() => {
    if (maxD <= 0) return { h: 160, tp: 80, bp: 20 }
    if (maxD <= 1) return { h: 220, tp: 56, bp: 28 }
    if (maxD <= 2) return { h: 300, tp: 50, bp: 34 }
    if (maxD <= 4) return { h: 420, tp: 46, bp: 38 }
    if (maxD <= 6) return { h: 520, tp: 42, bp: 36 }
    // Deeper than 6 levels: grow the chart rather than compress connector lines
    return { h: 42 + FIXED_V_STEP * maxD + 36, tp: 42, bp: 36 }
  }, [maxD])

  useEffect(() => {
    const el = outerRef.current; if (!el) return
    let fid = 0
    const m = () => { if (fid) return; fid = requestAnimationFrame(() => { fid = 0; if (outerRef.current) setCW(Math.max(outerRef.current.clientWidth - 6, 900)) }) }
    m()
    const ro = new ResizeObserver(m); ro.observe(el)
    return () => { if (fid) cancelAnimationFrame(fid); ro.disconnect() }
  }, [])

  const layout = useMemo(() => layoutDesktop(visibleIds, cW, metrics.h, metrics.tp, metrics.bp), [visibleIds, cW, metrics])
  const { positions, nodeWidths } = layout

  const labelFs = 12.25
  const labelMinH = 54

  const edges = useMemo(() => {
    const vs = new Set(visibleIds)
    return visibleIds.flatMap(pid =>
      NODES[pid].children.filter(c => vs.has(c)).map(c => ({ pid, cid: c }))
    )
  }, [visibleIds])

  const depthStagger = useMemo(() => {
    const map = new Map<string, number>()
    const counter = new Map<number, number>()
    visibleIds.forEach(id => {
      const d = nodeDepth(id)
      const idx = counter.get(d) ?? 0
      map.set(id, idx)
      counter.set(d, idx + 1)
    })
    return map
  }, [visibleIds])

  return (
    <div ref={outerRef} className="relative w-full transition-all duration-700"
      style={{ opacity: started ? 1 : 0, transform: started ? 'translateY(0)' : 'translateY(24px)', filter: started ? 'blur(0)' : 'blur(8px)' }}>
      <div className="relative overflow-visible pb-4 pl-4 pr-2 pt-4" style={{ minHeight: `${metrics.h}px` }}>

        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${cW} ${metrics.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {edges.map(({ pid, cid }) => {
            const pp = positions.get(pid), cp = positions.get(cid)
            if (!pp || !cp) return null
            const childDepth = nodeDepth(cid)
            const edgeRevealed = childDepth <= revealDepth
            const stagger = (depthStagger.get(cid) ?? 0) * 40
            const sY = pp.y + 28, eY = cp.y - 28, mY = sY + (eY - sY) / 2
            return (
              <path key={`${pid}-${cid}-${edgeAnimKey}`} 
  d={`M ${Math.round(pp.x)} ${Math.round(sY)} V ${Math.round(mY)} H ${Math.round(cp.x)} V ${Math.round(eY)}`}
  fill="none" stroke="#c9bdb0" strokeWidth="1" strokeLinecap="round"
  shapeRendering="crispEdges"
  pathLength={1}
  style={{
    opacity: edgeRevealed ? 1 : 0,
    strokeDasharray: 1,
    strokeDashoffset: edgeRevealed ? 0 : 1,
    transition: `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${stagger}ms, stroke-dashoffset 0.65s cubic-bezier(0.22,1,0.36,1) ${stagger}ms`,
  }}
/>
            )
          })}
        </svg>

        {visibleIds.map((id) => {
          const node = NODES[id], p = positions.get(id)
          if (!p) return null
          const depth = nodeDepth(id)
          const isRevealed = depth <= revealDepth
          const stagger = (depthStagger.get(id) ?? 0) * 50
          const isExp = expandedIds.has(id)
          const isSelected = focusedId === id
          const isDefaultPath = defaultPath.includes(id)
          const hasCh = node.children.length > 0
          const nw = nodeWidths.get(id) ?? estNodeW(id)
          const lw = hasCh ? nw - 18 : nw
          const cls = isDefaultPath
  ? 'border-[#3D5A35]/90 bg-[#3D5A35] text-[#f0f5ee] shadow-[0_16px_30px_-26px_rgba(61,90,53,0.22)]'
  : isSelected
    ? 'border-[#C4A882]/50 bg-[rgba(255,248,240,0.96)] text-[#4f4335] shadow-[0_0_0_1px_rgba(196,168,130,0.2),0_0_20px_-10px_rgba(196,168,130,0.18)]'
    : 'border-[rgba(92,64,51,0.08)] bg-[rgba(255,248,240,0.6)] text-[#5C4033] shadow-[0_4px_14px_rgba(59,47,47,0.035)] backdrop-blur-[28px]'
          return (
            <div key={id} className="absolute z-20 flex items-center gap-2 transition-all duration-500"
              style={{ left: p.x, top: p.y, transform: 'translate(-50%,-50%)', opacity: isRevealed ? 1 : 0, transitionDelay: `${stagger}ms` }}>
              <div className="relative inline-flex items-center"
                style={{ animation: isRevealed ? `cpm-node-in 420ms cubic-bezier(0.22,1,0.36,1) ${stagger}ms both` : 'none' }}>
                <button type="button" data-node-button onClick={() => onSelect(id)}
  className={`flex items-center justify-center rounded-[4px] border px-4 py-3 text-center font-medium tracking-[0.01em] transition-all duration-300 hover:-translate-y-0.5 ${cls}`}
  style={{ width: `${lw}px`, minHeight: `${labelMinH}px`, fontSize: `${labelFs}px`, lineHeight: '1.18', whiteSpace: 'normal' }}>
  {node.label}
</button>
                {hasCh && (
                  <button type="button" data-node-button onClick={e => { e.stopPropagation(); onToggle(id) }}
className="absolute left-full ml-1.5 transition-all duration-300 hover:scale-105"
                    aria-label={`${isExp ? 'Collapse' : 'Expand'} ${node.label}`}>
                    <ChevronChip expanded={isExp} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Mobile Framework Tree
   ═══════════════════════════════════════════════════════════ */

function MobileTreeNode({
  nodeId, focusedId, expandedIds, onSelect, onToggle, depth = 0,
}: {
  nodeId: string; focusedId: string; expandedIds: Set<string>
  onSelect: (id: string) => void; onToggle: (id: string) => void; depth?: number
}) {
  const node = NODES[nodeId]
  if (!node) return null
  const isFoc = focusedId === nodeId, isExp = expandedIds.has(nodeId), hasCh = node.children.length > 0
  return (
    <div className={depth > 0 ? 'relative ml-5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:bg-[#d8ccc0]' : ''}>
      <div className={`rounded-2xl border px-4 py-4 transition-all ${
        isFoc ? 'border-[#3D5A35]/15 bg-[rgba(255,248,240,0.88)] shadow-[0_4px_12px_rgba(59,47,47,0.04)]'
              : 'border-[#3D5A35]/10 bg-[rgba(255,248,240,0.8)]'
      }`}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onSelect(nodeId)}
            className={`flex-1 text-left text-[13px] leading-relaxed ${isFoc ? 'font-semibold text-[#3B2F2F]' : 'font-medium text-[#5C4033]/80'}`}>
            {node.label}
          </button>
          {hasCh && (
            <button type="button" onClick={() => onToggle(nodeId)} className="transition-transform duration-300"
              aria-label={`${isExp ? 'Collapse' : 'Expand'} ${node.label}`}>
              <ChevronChip expanded={isExp} />
            </button>
          )}
        </div>
      </div>
      {hasCh && isExp && (
        <div className="mt-3 space-y-3">
          {node.children.map(ch => (
            <MobileTreeNode key={ch} nodeId={ch} focusedId={focusedId} expandedIds={expandedIds} onSelect={onSelect} onToggle={onToggle} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Section Heading (shared style)
   ═══════════════════════════════════════════════════════════ */

function SectionHeading({ text }: { text: string }) {
  return (
    <Reveal>
      <div className="mb-5 flex items-center gap-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#3D5A35]">{text}</span>
        <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(61,90,53,0.18), transparent)' }} />
      </div>
    </Reveal>
  )
}

/* ═══════════════════════════════════════════════════════════
   Compact Footer
   ═══════════════════════════════════════════════════════════ */

function CompactFooter() {
  return (
    <footer style={{ background: '#453a2a' }} className="mt-auto w-full px-6 py-6 md:px-10 md:py-7">
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-5 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center md:gap-10">
          <div>
            <Link href="/" style={{ fontFamily: "'Newsreader', serif" }} className="mb-2 inline-block text-2xl font-semibold tracking-tight transition-opacity hover:opacity-85">
              <span style={{ color: '#d5c4b1' }}>Case Compendium</span>
              <span style={{ color: '#aed0a1' }}>X</span>
            </Link>
            <p style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.5)', maxWidth: '280px', lineHeight: 1.6 }} className="text-xs">
              AI-powered case practice and performance analytics for consulting interviews.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-3 md:gap-x-12">
            {[
              { href: '/', label: 'Home' },
              { href: '/about', label: 'About Us' },
              { href: '/privacy-policy', label: 'Privacy Policy' },
            ].map(({ href, label }) => (
              <Link key={href} href={href} style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
                {label}
              </Link>
            ))}
            <a href="mailto:contact@casecompendiumx.in?subject=Compendium%20X%20Privacy%20Request" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
              Contact Us
            </a>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(213,196,177,0.12)', paddingTop: '12px' }} className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <a href="https://www.linkedin.com/company/casecompendiumx" target="_blank" rel="noreferrer" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="LinkedIn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" /></svg>
            </a>
            <a href="mailto:contact@casecompendiumx.in" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="Email Us">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
            </a>
          </div>
          <p style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.35)', lineHeight: 1.8 }} className="text-[10px] tracking-[0.2em] uppercase">
            &copy; 2026 Case CompendiumX. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

/* ═══════════════════════════════════════════════════════════
   Practice FAB
   ═══════════════════════════════════════════════════════════ */

function PracticeFab({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '32px',
        right: 'clamp(20px, calc((100vw - 1480px) / 2 + 20px), 48px)',
        zIndex: 50,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.85)',
        transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Helper text — bare label, no box, no border */}
      <span
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: hovered ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(3px)',
          opacity: hovered ? 0.50 : 0,
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          fontSize: '9px',
          fontWeight: 600,
          letterSpacing: '0.2em',
          textTransform: 'uppercase' as const,
          color: '#5C4033',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        Practice
      </span>

      <button
        type="button"
        aria-label="Practice this case"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: hovered ? 'rgba(255,248,240,0.96)' : 'rgba(255,248,240,0.65)',
          backdropFilter: 'blur(24px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
          border: `1px solid ${hovered ? 'rgba(61,90,53,0.28)' : 'rgba(61,90,53,0.22)'}`,
          boxShadow: hovered
            ? '0 12px 40px -8px rgba(61,90,53,0.30), 0 1px 0 rgba(255,255,255,0.7) inset'
            : '0 4px 20px rgba(61,90,53,0.12), 0 1px 0 rgba(255,255,255,0.7) inset',
          transform: hovered ? 'scale(1.06)' : 'scale(1)',
          transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Ping ring — same pattern as FeedbackAnalyser fa-ping */}
        {!hovered && (
          <span
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: '1px solid rgba(61,90,53,0.25)',
              animation: 'cpm-fab-ping 2.8s cubic-bezier(0.215,0.61,0.355,1) infinite',
            }}
          />
        )}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
          style={{ marginLeft: '1.5px', position: 'relative', zIndex: 1 }}>
          <path
            d="M5.5 3.5L12 8L5.5 12.5V3.5Z"
            fill={hovered ? 'rgba(61,90,53,0.88)' : 'rgba(61,90,53,0.65)'}
            style={{ transition: 'fill 0.2s ease' }}
          />
        </svg>
      </button>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */

function MiniStepNav({
  steps,
  activeStep,
  onStepClick,
  rightOffset = 0,
}: {
  steps: { label: string; number: number }[]
  activeStep: number
  onStepClick: (idx: number) => void
  rightOffset?: number
}) {
  return (
    <div
      className="fixed z-50 flex flex-col items-end"
      style=
        {{right: `clamp(${33.5 + rightOffset}px, calc((100vw - 1480px) / 2 + ${33.5 + rightOffset}px), ${80 + rightOffset}px)`,
        top: '50%',
        transform: 'translateY(-50%)',
        gap: '6px',
        animation: 'cpm-fade-up 0.35s cubic-bezier(0.22,1,0.36,1) both',}}
      
    >
      {steps.map((step, idx) => {
        const isActive = activeStep === idx
        return (
          <button
  key={step.number}
  type="button"
  onClick={() => onStepClick(idx)}
  className="cpm-mini-nav-btn relative flex items-center justify-end cursor-pointer"
  style={{
    padding: '5px 0',
    background: 'none',
    border: 'none',
    transitionDelay: `${idx * 30}ms`,  // ← stagger per bar
  }}
  aria-label={step.label}
>
            {/* Inline label — no box, no background, just text */}
            <span
              className="cpm-mini-nav-label absolute right-full pointer-events-none"
              style=
                {{marginRight: '10px',
                whiteSpace: 'nowrap',
                fontSize: '9px',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.2em',
                color: isActive ? '#3D5A35' : '#5C4033',
                opacity: 0,
                transform: 'translateX(4px)',
                transition: 'opacity 0.12s ease-out, transform 0.12s ease-out',}}
              
            >
              {step.label}
            </span>
            {/* Bar */}
            <span
              className="cpm-mini-nav-bar block rounded-full"
              style=
                {{width: isActive ? '19px' : '9px',
                height: isActive ? '3px' : '2px',
                backgroundColor: isActive ? '#3D5A35' : '#5C4033',
                opacity: isActive ? 0.85 : 0.18,
                transition: 'width 0.15s ease-out, height 0.15s ease-out, opacity 0.15s ease-out, background-color 0.15s ease-out',}}
              
            />
          </button>
        )
      })}
    </div>
  )
}

function StepIndicator({
  steps,
  activeStep,
  onStepClick,
}: {
  steps: { label: string; number: number }[]
  activeStep: number
  onStepClick: (idx: number) => void
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [slider, setSlider] = useState({ left: 3, width: 100 })

  // Measure actual button widths to position slider precisely
  useEffect(() => {
    const btn = btnRefs.current[activeStep]
    if (!btn?.parentElement) return
    const containerLeft = btn.parentElement.getBoundingClientRect().left
    const btnRect = btn.getBoundingClientRect()
    setSlider({
      left: btnRect.left - containerLeft,
      width: btnRect.width,
    })
  }, [activeStep, steps.length])

  return (
    <div
      className="relative z-30"
      style={{
        background: 'rgba(255,248,240,0.6)',
        backdropFilter: 'blur(28px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
        animation: 'cpm-fade-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.22s both',
      }}
    >
      <div className="mx-auto flex max-w-[1480px] items-start py-3">
        {/* Segmented pill — left-aligned, content-width segments */}
        <div
          className="relative inline-flex"
          style={{
            borderRadius: '999px',
            border: '1px solid rgba(61,90,53,0.12)',
            background: 'rgba(255,248,240,0.5)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            padding: '3px',
            boxShadow: '0 2px 10px rgba(59,47,47,0.05)',
          }}
        >
          {/* Sliding active background — positioned by measurement */}
          <div
            style={{
              position: 'absolute',
              top: '3px',
              bottom: '3px',
              left: `${slider.left}px`,
              width: `${slider.width}px`,
              borderRadius: '999px',
              background: 'rgba(255,248,240,0.95)',
              boxShadow: '0 1px 6px rgba(59,47,47,0.08)',
              transition: 'left 0.35s cubic-bezier(0.16,1,0.3,1), width 0.35s cubic-bezier(0.16,1,0.3,1)',
              pointerEvents: 'none',
            }}
          />
          {steps.map((step, idx) => {
            const isActive = activeStep === idx
            const isForum = step.label.toLowerCase() === 'forum'
            return (
              <button
                key={step.number}
                ref={el => { btnRefs.current[idx] = el }}
                type="button"
                onClick={() => onStepClick(idx)}
                className="relative z-10 flex items-center gap-2 rounded-full py-[7px] px-5 transition-all duration-300"
              >
                {/* Live dot — active segments */}
                {isActive && (
                  <span
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: '#3D5A35',
                      flexShrink: 0,
                      animation: 'cpm-dot-breathe 2.5s ease-in-out infinite',
                    }}
                  />
                )}
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.2em] whitespace-nowrap transition-colors duration-300 ${
                    isActive ? 'text-[#3B2F2F]' : 'text-[#5C4033]/35'
                  }`}
                >
                  {step.label}
                </span>
                {/* New badge — warm amber shimmer, always visible on forum */}
                {isForum && (
                  <span
                    style={{
                      fontSize: '6px',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase' as const,
                      color: 'rgba(255,248,240,0.96)',
                      background: 'linear-gradient(120deg, rgba(196,148,90,0.95) 0%, rgba(186,94,60,0.90) 45%, rgba(196,148,90,0.95) 100%)',
                      backgroundSize: '250% 100%',
                      borderRadius: '3px',
                      padding: '1.5px 4px',
                      lineHeight: 1.2,
                      flexShrink: 0,
                      marginTop: '-1px',
                      boxShadow: '0 1px 8px rgba(186,94,60,0.22), inset 0 1px 0 rgba(255,255,255,0.15)',
                      animation: 'cpm-badge-shimmer 2.8s ease-in-out infinite',
                    }}
                  >
                    new
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function useSwipeNavigation(navigate: (dir: 'next' | 'prev') => void) {
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const wheelAccumulator = useRef(0)
  const wheelTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTransitioning = useRef(false)

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isTransitioning.current) return
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.8) return
      if (Math.abs(e.deltaX) < 3) return

      wheelAccumulator.current += e.deltaX

      if (wheelTimeout.current) clearTimeout(wheelTimeout.current)
      wheelTimeout.current = setTimeout(() => { wheelAccumulator.current = 0 }, 200)

      if (wheelAccumulator.current > 80) {
        wheelAccumulator.current = 0
        isTransitioning.current = true
        navigate('next')
        setTimeout(() => { isTransitioning.current = false }, 800)
      } else if (wheelAccumulator.current < -80) {
        wheelAccumulator.current = 0
        isTransitioning.current = true
        navigate('prev')
        setTimeout(() => { isTransitioning.current = false }, 800)
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (isTransitioning.current) return
      if (touchStartX.current === null || touchStartY.current === null) return
      const deltaX = e.changedTouches[0].clientX - touchStartX.current
      const deltaY = e.changedTouches[0].clientY - touchStartY.current
      if (Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return
      if (Math.abs(deltaX) < 60) return
      isTransitioning.current = true
      if (deltaX < 0) navigate('next')
      else navigate('prev')
      setTimeout(() => { isTransitioning.current = false }, 800)
      touchStartX.current = null
      touchStartY.current = null
    }

    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
      if (wheelTimeout.current) clearTimeout(wheelTimeout.current)
    }
  }, [navigate])
}

/* ═══════════════════════════════════════════════════════════
   Shared core render hook — used by both Preview and Interviewer
   ═══════════════════════════════════════════════════════════ */

type ScoreState = { structure: number; understanding: number; delivery: number; creativity: number }

export type CaseInterviewerMasterProps = Omit<CasePreviewMasterProps, 'previewMode' | 'ForumSection'> & {
  notes: string
  setNotes: (v: string) => void
  scores: ScoreState
  setScores: (s: ScoreState) => void
  onEndCase: () => void
}

const EVAL_CRITERIA: Array<{ id: keyof ScoreState; label: string }> = [
  { id: 'structure',     label: 'Framework & Structure' },
  { id: 'understanding', label: 'Problem Understanding' },
  { id: 'delivery',      label: 'Delivery & Communication' },
  { id: 'creativity',    label: 'Creativity' },
]

export default function CasePreviewMaster({
  caseData, previewMode, transcriptDisplayLines, parsedFramework,
  promptLines, caseTypeLabel, industryLabel, difficultyLabel,
  companyLabel, roundLabel, ForumSection, frameworkTree,
}: CasePreviewMasterProps) {
  // ─── Sync module-level tree data from props ──────────
  const tree = frameworkTree ?? BANKING_ON_YOU_TREE
  NODES = tree.nodes
  PARENTS = {}
  for (const [id, node] of Object.entries(tree.nodes)) {
    for (const ch of node.children) PARENTS[ch] = id
  }
  ROOT_ID = Object.keys(NODES).find(id => !PARENTS[id]) ?? ''
  DEFAULT_EXPANDED = new Set(tree.defaultExpanded)
  DEFAULT_FOCUSED_ID = tree.defaultFocusedId
  NOTES = tree.notes
  const hasTree = ROOT_ID !== ''
  const maxTreeDepth = hasTree ? Math.max(...Object.keys(NODES).map(nodeDepth), 0) : 0

  const router = useRouter()
  const chartRef = useRef<HTMLDivElement>(null)
  const walkthroughRef = useRef<HTMLElement>(null)
  const drilldownRef = useRef<HTMLElement>(null)
  const activeStepRef = useRef(0)

  // ─── Engagement state — shows FABs after 1% interaction ─
  // Fires on first scroll past 30px OR after 3s on page
  const [fabVisible, setFabVisible] = useState(false)
  useEffect(() => {
    let triggered = false
    const show = () => { if (triggered) return; triggered = true; setFabVisible(true) }
    const onScroll = () => { if (window.scrollY > 30) show() }
    const timer = setTimeout(show, 3000)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(timer) }
  }, [])

  // ─── Responsive ──────────────────────────────
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(mq.matches)
    sync(); mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // ─── Mini step nav on scroll ──────────────────
  const stepIndicatorRef = useRef<HTMLDivElement>(null)
  const [showMiniNav, setShowMiniNav] = useState(false)

  useEffect(() => {
    const el = stepIndicatorRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setShowMiniNav(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-70px 0px 0px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])


  // ─── Chart reveal (depth-by-depth tree animation) ─
  const [revealDepth, setRevealDepth] = useState(-1)
  const treeFullyRevealed = revealDepth >= maxTreeDepth
  const [activeStep, setActiveStep] = useState(0)
  const inForum = activeStep === 2
  useEffect(() => { activeStepRef.current = activeStep }, [activeStep])


  const STEPS = [
    { label: 'Walkthrough', number: 1 },
    { label: 'Drill Down', number: 2 },
    ...(ForumSection ? [{ label: 'Forum', number: 3 }] : []),
  ]

  // ─── Chart reveal — fires once when chart scrolls into view ─
  useEffect(() => {
    const el = chartRef.current; if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setRevealDepth(0); obs.disconnect() } },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.05 }
    )
    obs.observe(el); return () => obs.disconnect()
  }, [])

useEffect(() => {
  if (revealDepth < 0 || revealDepth >= maxTreeDepth) return
  const timer = setTimeout(() => setRevealDepth(d => d + 1), 420)
  return () => clearTimeout(timer)
}, [revealDepth])

  // ─── Chart state ─────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(tree.defaultExpanded))
  const [focusedId, setFocusedId] = useState<string | null>(() => tree.defaultFocusedId || null)
  const [edgeAnimKey, setEdgeAnimKey] = useState(0)
  // Add this after the focusedId state declaration:
useEffect(() => {
const handleClickOutside = (e: MouseEvent) => {
const target = e.target as HTMLElement
// Only keep selection if clicking directly on a node button
if (!target.closest('[data-node-button]')) {
setFocusedId(null)
}
}
document.addEventListener('mousedown', handleClickOutside)
return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])

  // ─── Offset-aware scroll helper ──────────────────────────
  // Accounts for Navbar (70px) + StepIndicator (~58px) + breathing room (16px) = 144px
  const HEADER_OFFSET = 144
  const scrollToRef = useCallback((ref: React.RefObject<HTMLElement | null>) => {
    const el = ref.current; if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [])

  // ─── navigate — stable ref-based callback ────────────────
  // Swipe left from Walkthrough → scroll to Drill Down
  // Swipe left from Drill Down  → open Forum (separate container)
  // Swipe right from Drill Down → scroll to Walkthrough
  // Swipe right from Forum      → return to scroll view
  const navigate = useCallback((dir: 'next' | 'prev') => {
    const step = activeStepRef.current
    if (dir === 'next') {
      if (step === 0) scrollToRef(drilldownRef)
      else if (step === 1) { setActiveStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    } else {
      if (step === 1) scrollToRef(walkthroughRef)
      else if (step === 2) { setActiveStep(0); setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50) }
    }
  }, [scrollToRef])

  // ─── handleStepClick — used by StepIndicator + MiniStepNav ─
  const handleStepClick = useCallback((idx: number) => {
    if (idx === 2) {
      setActiveStep(2); window.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (activeStepRef.current === 2) {
      // Returning from Forum — switch view then scroll to section
      setActiveStep(idx)
      setTimeout(() => scrollToRef(idx === 0 ? walkthroughRef : drilldownRef), 50)
    } else {
      scrollToRef(idx === 0 ? walkthroughRef : drilldownRef)
    }
  }, [scrollToRef])

  // ─── Track active step by scroll position (0 ↔ 1) ─────────
  // Uses scroll event (same approach as inContentSection) so the threshold
  // is consistent: step flips to 1 only when drilldown top has passed the header.
  useEffect(() => {
    if (inForum) return
    let rafId = 0
    const check = () => {
      const el = drilldownRef.current; if (!el) return
      const { top } = el.getBoundingClientRect()
      setActiveStep(top < window.innerHeight * 0.5 ? 1 : 0)
    }
    const onScroll = () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(check) }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(rafId) }
  }, [inForum])

  // ─── Keyboard arrow navigation ────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') navigate('next')
      else if (e.key === 'ArrowLeft') navigate('prev')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  // ─── Horizontal swipe / trackpad navigation ───────────────
  useSwipeNavigation(navigate)

  const [mobileExpIds, setMobileExpIds] = useState<Set<string>>(() => new Set(tree.defaultExpanded))
  const [mobileFocId, setMobileFocId] = useState(() => tree.defaultFocusedId || '')

  // ─── Derived data ────────────────────────────
  const allLines = useMemo<TranscriptDisplayLine[]>(() => [
    ...promptLines.map(l => ({ text: l, speaker: 'interviewer' as const })),
    ...transcriptDisplayLines,
  ], [promptLines, transcriptDisplayLines])

  const blocks = useMemo(() => buildBlocks(allLines), [allLines])

  const recommendations = parsedFramework.recommendations

  const metadata = useMemo(
    () => [caseTypeLabel, industryLabel, difficultyLabel, companyLabel, roundLabel]
      .filter(v => v && v !== 'Client Not Specified' && v !== 'Round Not Specified'),
    [caseTypeLabel, companyLabel, difficultyLabel, industryLabel, roundLabel],
  )

  const difficultyLevel = useMemo(() => {
    const v = difficultyLabel.toLowerCase()
    if (v.includes('easy') || v.includes('beginner')) return 1
    if (v.includes('medium') || v.includes('intermediate')) return 2
    if (v.includes('hard') || v.includes('advanced')) return 3
    return 0
  }, [difficultyLabel])

  // ─── Chart node visibility ───────────────────
  const visibleIds = useMemo(() => { const s = new Set<string>(); if (ROOT_ID) collectVisible(ROOT_ID, expandedIds, s); return [...s] }, [expandedIds])
  const chartMaxDepth = useMemo(() => Math.max(...visibleIds.map(nodeDepth), 0), [visibleIds])
  // Overlay only when all default branches are still expanded (full state)
  const isChartFullyExpanded = useMemo(
    () => [...DEFAULT_EXPANDED].every(id => expandedIds.has(id)),
    [expandedIds]
  )

  const handleSelect = (id: string) => {
setFocusedId(id)
const node = NODES[id]
if (node?.children.length && expandedIds.has(id)) {
// Already expanded — collapse it (same as toggle)
setExpandedIds(prev => {
const next = new Set(prev)
next.delete(id)
descendants(id).forEach(d => next.delete(d))
return next
})
} else {
// Expand path to this node
setExpandedIds(prev => {
const next = new Set(prev)
pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) })
return next
})
}
setEdgeAnimKey(k => k + 1)   
}

  const handleToggle = (id: string) => {
    const node = NODES[id]; if (!node?.children.length) return
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id); descendants(id).forEach(d => next.delete(d))
              if (focusedId && pathTo(focusedId).includes(id)) setFocusedId(id)
      } else {
        next.add(id)
        const parent = PARENTS[id]
        if (parent) NODES[parent].children.forEach(sib => {
          if (sib !== id) { next.delete(sib); descendants(sib).forEach(d => next.delete(d)) }
        })
      }
      return next
    })
      setEdgeAnimKey(k => k + 1)   // ← ADD THIS LINE
  }

  const handleMobileSelect = (id: string) => {
    setMobileFocId(id)
    setMobileExpIds(prev => {
      const next = new Set(prev)
      pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) })
      return next
    })
  }

  const handleMobileToggle = (id: string) => {
    const node = NODES[id]; if (!node?.children.length) return
    setMobileExpIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id); descendants(id).forEach(d => next.delete(d))
        if (pathTo(mobileFocId).includes(id)) setMobileFocId(id)
      } else {
        next.add(id)
        const parent = PARENTS[id]
        if (parent) NODES[parent].children.forEach(sib => {
          if (sib !== id) { next.delete(sib); descendants(sib).forEach(d => next.delete(d)) }
        })
      }
      return next
    })
  }

  /* ═══════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════ */
  return (
    <div style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="min-h-screen bg-[#fff8f0] text-[#3B2F2F] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]">

      {/* ─── Keyframes ────────────────────────── */}
      <style>{`
      html, body { overscroll-behavior-x: none; }
        @keyframes cpm-fade-up { from { opacity:0; transform:translateY(22px); filter:blur(6px) } to { opacity:1; transform:translateY(0); filter:blur(0) } }
        @keyframes cpm-glow { 0%,100% { opacity:.42; transform:translate3d(0,0,0) scale(1) } 50% { opacity:.7; transform:translate3d(12px,-8px,0) scale(1.04) } }
        @keyframes cpm-connector { from { opacity:0; stroke-dashoffset:1 } to { opacity:1; stroke-dashoffset:0 } }
        @keyframes cpm-node-in { from { opacity:0; transform:translateY(16px) scale(.96); filter:blur(6px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
        @keyframes cpm-helper-breathe { 0%,100% { opacity:.42; transform:translateY(0) } 50% { opacity:.78; transform:translateY(-1px) } }
        @keyframes cpm-sidebar-card-in {
  from { opacity: 0; transform: translateY(16px) scale(0.97); filter: blur(5px); }
  to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes cpm-card-warmth { 0% { box-shadow: inset 0 0 0 rgba(61,90,53,0), 0 0 0 rgba(61,90,53,0) } 40% { box-shadow: inset 0 0 24px rgba(61,90,53,0.04), 0 0 20px -10px rgba(61,90,53,0.08) } 100% { box-shadow: inset 0 0 0 rgba(61,90,53,0), 0 0 0 rgba(61,90,53,0) } }
@keyframes cpm-sidebar-glow {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50%      { opacity: 0.7; transform: scale(1.05); }
}
@keyframes cpm-step-in {
  from { opacity: 0; transform: translateX(30px); filter: blur(4px); }
  to   { opacity: 1; transform: translateX(0); filter: blur(0); }
}

@keyframes cpm-badge-shimmer {
  0%, 100% { background-position: 0% 50%; }
  50%       { background-position: 100% 50%; }
}

@keyframes cpm-dot-breathe {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%       { opacity: 1;    transform: scale(1.35); }
}

@keyframes cpm-fab-ping {
  0%   { transform: scale(1);   opacity: 0.4; }
  70%  { transform: scale(1.6); opacity: 0;   }
  100% { transform: scale(1.6); opacity: 0;   }
}

@keyframes cpm-step-pulse {
  0%, 100% { transform: scale(1); opacity: 0.35; }
  50% { transform: scale(1.5); opacity: 0.08; }
} 

/* ── Mini nav: smooth cascading hover ── */
.cpm-mini-nav-btn {
  cursor: pointer;
}

/* Label: instant slide-in */
.cpm-mini-nav-btn:hover .cpm-mini-nav-label {
  opacity: 1 !important;
  transform: translateX(0) !important;
}

/* Bar: smooth expand on direct hover */
.cpm-mini-nav-btn:hover .cpm-mini-nav-bar {
  width: 22px !important;
  height: 3px !important;
  opacity: 0.65 !important;
  transition: width 0.18s cubic-bezier(0.22, 1, 0.36, 1),
              height 0.18s cubic-bezier(0.22, 1, 0.36, 1),
              opacity 0.18s cubic-bezier(0.22, 1, 0.36, 1) !important;
}

/* Sibling cascade: when hovering ANY bar, adjacent bars also react subtly */
.cpm-mini-nav-btn:hover + .cpm-mini-nav-btn .cpm-mini-nav-bar {
  width: 16px !important;
  opacity: 0.35 !important;
  transition: width 0.22s cubic-bezier(0.22, 1, 0.36, 1) 40ms,
              opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1) 40ms !important;
}

/* Two-away sibling: even lighter ripple */
.cpm-mini-nav-btn:hover + .cpm-mini-nav-btn + .cpm-mini-nav-btn .cpm-mini-nav-bar {
  width: 14px !important;
  opacity: 0.25 !important;
  transition: width 0.25s cubic-bezier(0.22, 1, 0.36, 1) 70ms,
              opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1) 70ms !important;
}

/* ── Hide browser scrollbar — keep scroll functional ── */
html {
  scrollbar-width: none;           /* Firefox */
  -ms-overflow-style: none;        /* IE / Edge */
}
html::-webkit-scrollbar {
  display: none;                   /* Chrome / Safari / Opera */
}
      `}
      </style>

      <Navbar currentPage="repository" />

      {/* ─── Sticky subheader ─────────────────── */}
      <div className="pt-[70px]">
        <main className="relative mx-auto max-w-[1480px] px-4 pb-28 pt-10 lg:px-6">

          {/* ─── Ambient glow ──────────────────── */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-[10%] top-[14%] h-[280px] w-[280px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(61,90,53,0.08) 0%, rgba(61,90,53,0.04) 30%, transparent 72%)', animation: 'cpm-glow 14s ease-in-out infinite' }} />
            <div className="absolute right-[8%] top-[20%] h-[240px] w-[240px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(196,168,130,0.1) 0%, rgba(196,168,130,0.04) 28%, transparent 68%)', animation: 'cpm-glow 16s ease-in-out infinite reverse' }} />
          </div>

          {/* ══════════════════════════════════════
    HERO
    ══════════════════════════════════════ */}
<section className="relative z-10 pb-3 pt-2">
  {/* ── Breadcrumb + context ── */}
  <div
    className="mb-2.5 flex items-center gap-2"
    style={{ animation: 'cpm-fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both' }}
  >
    <Link
      href="/repository"
      className="inline-flex items-center gap-1 transition-opacity duration-200 opacity-70 hover:opacity-100"
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
        <path d="M7 2L3.5 5.5L7 9" stroke="#3D5A35" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-[#3D5A35]">Repository</span>
    </Link>
  </div>

  <h1 className="-ml-[2px] font-light leading-[1.02] tracking-tight text-[#453a2a]"
    style={{ fontFamily: "'Newsreader', serif", fontSize: isDesktop ? '4.2rem' : '2.8rem', animation: 'cpm-fade-up 0.75s cubic-bezier(0.22,1,0.36,1) 0.06s both' }}>
    {caseData.title.trim()}
  </h1>
</section>


          {/* ── Step Indicator ── */}
<div ref={stepIndicatorRef}>
  <StepIndicator steps={STEPS} activeStep={activeStep} onStepClick={handleStepClick} />
</div>

{/* ── Mini step nav — Notion-style right-side bars on scroll ── */}
{showMiniNav && (
  <MiniStepNav steps={STEPS} activeStep={activeStep} onStepClick={handleStepClick} />
)}

          {/* ══════════════════════════════════════
             WALKTHROUGH + DRILL DOWN (vertical scroll)
             ══════════════════════════════════════ */}
          {!inForum && (<>
          <section ref={walkthroughRef} className="relative z-10 pt-6">

            {/* Mobile meta tags (pills) */}
            <div className="mb-6 flex flex-wrap gap-2.5 lg:hidden">
              {[
                { label: 'Type', value: caseTypeLabel },
                { label: 'Industry', value: industryLabel },
                { label: 'Level', value: difficultyLabel },
                ...(companyLabel !== 'Client Not Specified' ? [{ label: 'Company', value: companyLabel }] : []),
                ...(roundLabel !== 'Round Not Specified' ? [{ label: 'Round', value: roundLabel }] : []),
              ].map(t => (
                <div key={t.label} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#5C4033]/50">{t.label}</span>
                  <span className="rounded-md border border-[#5C4033]/12 bg-[#D9D0C4]/25 px-2.5 py-[3px] text-[10px] font-medium text-[#5C4033]/70">{t.value}</span>
                </div>
              ))}
            </div>

            {/* Containment frame — walkthrough */}
            <div className="hidden rounded-2xl border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px] lg:block">
<div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">                {/* ── Desktop sidebar: case metadata ── */}
                <aside className="hidden lg:block">
  <div
className="sticky top-[128px] flex flex-col gap-3.5 px-3 py-4"   style={{height: 'calc(100vh - 168px)'}}
  >
    {/* ── B: Ambient green glow behind sidebar ── */}
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style=
        {{background: 'radial-gradient(ellipse at 50% 40%, rgba(61,90,53,0.07) 0%, rgba(61,90,53,0.02) 50%, transparent 80%)',
        animation: 'cpm-sidebar-glow 14s ease-in-out infinite',}}
      
    />

    {[
      { label: 'CASE TYPE', value: caseTypeLabel },
      ...(companyLabel !== 'Client Not Specified' ? [{ label: 'COMPANY', value: companyLabel }] : []),
      ...(roundLabel !== 'Round Not Specified' ? [{ label: 'ROUND', value: roundLabel }] : []),
      { label: 'INDUSTRY', value: industryLabel },
    ].map((item, idx) => (
      <div
        key={item.label}
        className="group relative flex-1 flex flex-col items-center justify-center rounded-[4px] border border-[rgba(61,90,53,0.10)] transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-[rgba(61,90,53,0.18)] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.10)]"
        style={{
  background: 'rgba(255,248,240,0.80)',
  animation: `cpm-sidebar-card-in 0.5s cubic-bezier(0.22,1,0.36,1) ${idx * 100}ms both, cpm-card-warmth 1.6s ease-out ${0.4 + idx * 0.12}s 1 both`,
  zIndex: 1,
}}
      >
        
        <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#5C4033]/50 leading-none text-center">
          {item.label}
        </p>
        <p
          className="text-[22px] font-medium text-[#3B2F2F] tracking-tight mt-2 leading-none text-center relative z-10"
          style={{fontFamily: "'Newsreader', serif"}}
        >
          {item.value}
        </p>
      </div>
    ))}

    {/* Difficulty card */}
<div
  className="group relative flex-1 flex flex-col items-center justify-center rounded-[4px] border border-[rgba(61,90,53,0.10)] transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-[rgba(61,90,53,0.18)] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.10)]"
  style={{
    background: 'rgba(255,248,240,0.80)',
    animation: `cpm-sidebar-card-in 0.5s cubic-bezier(0.22,1,0.36,1) 400ms both, cpm-card-warmth 1.6s ease-out 0.88s 1 both`,
    zIndex: 1,}}
  
>
      
      <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#5C4033]/50 leading-none text-center">
        DIFFICULTY
      </p>
      <div className="flex items-center justify-center gap-2.5 mt-2.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 w-5 rounded-[2px] transition-all duration-500"
            style=
             {{ backgroundColor: i <= difficultyLevel ? '#3D5A35' : 'rgba(217,208,196,0.3)',}}
            
          />
        ))}
      </div>
    </div>
  </div>
</aside>
                {/* ── Gradient divider between sidebar and content ── */}
                <div className="relative min-w-0">
                  <div className="absolute left-0 top-0 hidden h-full w-px lg:block">
  <div
    className="sticky top-[128px] w-full"
    style={{
      height: 'calc(100vh - 168px)',
      background: 'linear-gradient(180deg, transparent 0%, rgba(92,64,51,0.14) 12%, rgba(92,64,51,0.14) 88%, transparent 100%)',}}
    
  />
</div>

                  {/* ── Transcript content (right-shifted) ── */}
                  <div className="custom-scrollbar relative pl-7 pr-5 py-6">
                    {/* Glass blur overlay — sticks to viewport bottom */}
                    <div className="pointer-events-none z-20"
  style={{
    position: 'sticky',
    top: 'calc(100vh - 120px)',
    height: '120px',
    marginBottom: '-120px',
    background: 'linear-gradient(to top, rgba(255,248,240,1) 0%, rgba(255,248,240,0.88) 40%, rgba(255,248,240,0) 100%)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)',
    maskImage: 'linear-gradient(to top, black 20%, transparent)',
  }}
/>

                    <div>
                      {blocks.map((block, index) => (
                        <div key={block.key} className={walkthroughSpacingClass(block, index > 0 ? blocks[index - 1] : undefined)}>
                          <Reveal>
                            <WalkthroughBlockView block={block} />
                          </Reveal>
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
              </div>
            </div>

            {/* Mobile fallback — no containment frame */}
            <div className="lg:hidden">
              <div>
                {blocks.map((block, index) => (
                  <div key={block.key} className={walkthroughSpacingClass(block, index > 0 ? blocks[index - 1] : undefined)}>
                    <Reveal>
                      <WalkthroughBlockView block={block} />
                    </Reveal>
                  </div>
                ))}
              </div>
              </div>
</section>

          {/* ══════════════════════════════════════
             FRAMEWORK & RECOMMENDATIONS
             ══════════════════════════════════════ */}
          <section ref={drilldownRef} className="relative z-10 mt-12">

            <div className="hidden lg:block">

<div className="rounded-2xl border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px]">
<div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
                  {/* ── Desktop sidebar: notes ─────────── */}
                  <aside className="hidden lg:block">
  <div
    className="sticky top-[128px] flex flex-col gap-3.5 px-3 py-4"
    style= {{height: 'calc(100vh - 168px)' }}
  >
    {/* Ambient green glow behind sidebar */}
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style=
        {{background: 'radial-gradient(ellipse at 50% 40%, rgba(61,90,53,0.07) 0%, rgba(61,90,53,0.02) 50%, transparent 80%)',
        animation: 'cpm-sidebar-glow 14s ease-in-out infinite',}}
      
    />

    {NOTES.map((n, idx) => (
      <div
        key={n.title}
        className="group relative flex-1 flex flex-col items-center justify-center rounded-[4px] border border-[rgba(61,90,53,0.10)] transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-[rgba(61,90,53,0.18)] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.10)]"
        style={{
          background: 'rgba(255,248,240,0.80)',
          animation: `cpm-sidebar-card-in 0.5s cubic-bezier(0.22,1,0.36,1) ${idx * 100}ms both, cpm-card-warmth 1.6s ease-out ${0.4 + idx * 0.12}s 1 both`,
          zIndex: 1,
        }}
      >
        {/* Card heading */}
        <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#5C4033]/50 leading-none text-center mb-3">
          {n.title}
        </p>

        {/* Bullet items */}
        <ul className="w-full px-3">
          {n.items.map(item => (
            <li key={item} className="flex items-start gap-2 mb-2 last:mb-0">
              <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#3B2F2F]/60" />
<span className="flex-1 text-[14px] leading-relaxed font-medium text-[#3B2F2F]" style= {{fontFamily: "'Newsreader', serif" }}>
  {item}
</span>                
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
</aside>

                  {/* ── Gradient divider + chart/recommendations ── */}
                  <div className="relative min-w-0">
                    <div className="absolute left-0 top-0 hidden h-full w-px lg:block">
  <div
    className="sticky top-[128px] w-full"
    style=
      {{height: 'calc(100vh - 168px)',
      background: 'linear-gradient(180deg, transparent 0%, rgba(92,64,51,0.14) 12%, rgba(92,64,51,0.14) 88%, transparent 100%)',
      }}
  />
</div>

                    <div className="relative flex flex-col pl-7 pr-5 py-6" style={{ minHeight: 'calc(100vh - 216px)' }}>
                      {/* Glass blur overlay — only when framework is in full default-expanded state */}
                      {isChartFullyExpanded && treeFullyRevealed && (
                        <div className="pointer-events-none z-20"
                          style={{
                            position: 'sticky',
                            top: 'calc(100vh - 110px)',
                            height: '110px',
                            marginBottom: '-110px',
                            background: 'linear-gradient(to top, rgba(255,248,240,1) 0%, rgba(255,248,240,0.88) 40%, rgba(255,248,240,0) 100%)',
                            backdropFilter: `blur(${treeFullyRevealed ? 3 : 6}px)`,
                            WebkitBackdropFilter: `blur(${treeFullyRevealed ? 3 : 6}px)`,
                            WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)',
                            maskImage: 'linear-gradient(to top, black 20%, transparent)',
                            transition: 'all 0.8s cubic-bezier(0.22,1,0.36,1)',
                          }}
                        />
                      )}

                      {/* Desktop chart — flex-1 fills remaining space; centers node when single */}
                      <div
                        ref={chartRef}
                        className={chartMaxDepth === 0 ? 'flex-1 flex items-center' : 'flex-1'}
                        style={{ transform: 'scale(1.05)', transformOrigin: 'top center' }}
                      >
                        <DesktopChart visibleIds={visibleIds} expandedIds={expandedIds}
  focusedId={focusedId} onSelect={handleSelect} onToggle={handleToggle} revealDepth={revealDepth} edgeAnimKey={edgeAnimKey} />
                      </div>

                      {/* ── Recommendations ─────────────── */}
                      {recommendations.length > 0 && (
                        <div className="pt-16">
                          <Reveal>
                            <div className="mb-4 flex items-center gap-4">
                              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Recommendations</span>
                              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                            </div>
                          </Reveal>
                          <ul className="space-y-2">
                            {recommendations.map((item, i) => (
                              <Reveal key={`rec-${i}`}>
                                <li className="flex items-start gap-2">
                                  <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#3B2F2F]/60" />
                                  <span className="flex-1 text-[14px] leading-relaxed font-medium text-[#3B2F2F]" style={{ fontFamily: "'Newsreader', serif" }}>{item}</span>
                                </li>
                              </Reveal>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:hidden">

              {/* Mobile notes (above chart) */}
              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                {NOTES.map(n => <NoteCard key={n.title} title={n.title} items={n.items} />)}
              </div>

              <Reveal>
                <div className="space-y-3">
                  <MobileTreeNode nodeId={ROOT_ID} focusedId={mobileFocId} expandedIds={mobileExpIds}
                    onSelect={handleMobileSelect} onToggle={handleMobileToggle} />
                </div>
              </Reveal>
              {recommendations.length > 0 && (
                <div className="mt-12">
                  <Reveal>
                    <div className="mb-4 flex items-center gap-4">
                      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Recommendations</span>
                      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                    </div>
                  </Reveal>
                  <ul className="space-y-2">
                    {recommendations.map((item, i) => (
                      <Reveal key={`rec-m-${i}`}>
                        <li className="flex items-start gap-2">
                          <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#3B2F2F]/60" />
                          <span className="flex-1 text-[14px] leading-relaxed font-medium text-[#3B2F2F]" style={{ fontFamily: "'Newsreader', serif" }}>{item}</span>
                        </li>
                      </Reveal>
                    ))}
                  </ul>
                </div>
              )}
  </div>
</section>
          </>)}

{/* ── Forum ──────────────────────────── */}
{inForum && ForumSection && (
  <section key="forum" className="relative z-10 pt-8" style={{ animation: 'cpm-step-in 0.5s cubic-bezier(0.22,1,0.36,1) both' }}>
    <Reveal>{ForumSection}</Reveal>
  </section>
)}
        </main>
        <CompactFooter />

        {/* ── Floating action buttons ── */}
        {previewMode && <PracticeFab visible={fabVisible} onClick={() => router.push('/practice')} />}

      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   CaseInterviewerMaster — same UI as preview, no forum,
   with sticky notes/ratings panel on the right
   ═══════════════════════════════════════════════════════════ */

export function CaseInterviewerMaster({
  caseData, transcriptDisplayLines, parsedFramework,
  promptLines, caseTypeLabel, industryLabel, difficultyLabel,
  companyLabel, roundLabel, frameworkTree,
  notes, setNotes, scores, setScores, onEndCase,
}: CaseInterviewerMasterProps) {
  // ─── Sync tree data (same as preview) ────────────────
  const tree = frameworkTree ?? BANKING_ON_YOU_TREE
  NODES = tree.nodes
  PARENTS = {}
  for (const [id, node] of Object.entries(tree.nodes)) {
    for (const ch of node.children) PARENTS[ch] = id
  }
  ROOT_ID = Object.keys(NODES).find(id => !PARENTS[id]) ?? ''
  DEFAULT_EXPANDED = new Set(tree.defaultExpanded)
  DEFAULT_FOCUSED_ID = tree.defaultFocusedId
  NOTES = tree.notes
  const hasTree = ROOT_ID !== ''
  const maxTreeDepth = hasTree ? Math.max(...Object.keys(NODES).map(nodeDepth), 0) : 0

  const chartRef = useRef<HTMLDivElement>(null)
  const activeStepRef = useRef(0)

  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(mq.matches)
    sync(); mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const [revealDepth, setRevealDepth] = useState(-1)
  const treeFullyRevealed = revealDepth >= maxTreeDepth
  const [activeStep, setActiveStep] = useState(0)
  useEffect(() => { activeStepRef.current = activeStep }, [activeStep])

  const STEPS = [
    { label: 'Walkthrough', number: 1 },
    { label: 'Drill Down',  number: 2 },
  ]

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(tree.defaultExpanded))
  const [focusedId, setFocusedId]     = useState<string | null>(() => tree.defaultFocusedId || null)
  const [edgeAnimKey, setEdgeAnimKey] = useState(0)
  const [mobileExpIds, setMobileExpIds] = useState<Set<string>>(() => new Set(tree.defaultExpanded))
  const [mobileFocId, setMobileFocId]   = useState(() => tree.defaultFocusedId || '')

  useEffect(() => {
    const el = chartRef.current; if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setRevealDepth(0); obs.disconnect() } },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.05 }
    )
    obs.observe(el); return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (revealDepth < 0 || revealDepth >= maxTreeDepth) return
    const timer = setTimeout(() => setRevealDepth(d => d + 1), 420)
    return () => clearTimeout(timer)
  }, [revealDepth, maxTreeDepth])

  const HEADER_OFFSET = 144
  const visibleIds = useMemo(() => { const s = new Set<string>(); if (ROOT_ID) collectVisible(ROOT_ID, expandedIds, s); return [...s] }, [expandedIds])
  const chartMaxDepth = useMemo(() => Math.max(...visibleIds.map(nodeDepth), 0), [visibleIds])
  const isChartFullyExpanded = useMemo(() => [...DEFAULT_EXPANDED].every(id => expandedIds.has(id)), [expandedIds])
  const recommendations = parsedFramework.recommendations
  const promptDisplayLines = useMemo<TranscriptDisplayLine[]>(
    () => promptLines.map(text => ({ text, speaker: 'interviewer' as const })),
    [promptLines]
  )
  const allLines = useMemo<TranscriptDisplayLine[]>(
    () => [...promptDisplayLines, ...transcriptDisplayLines],
    [promptDisplayLines, transcriptDisplayLines]
  )
  const blocks = useMemo(() => buildBlocks(allLines), [allLines])
  const difficultyLevel = useMemo(() => {
    const d = difficultyLabel.toLowerCase()
    if (d.includes('hard') || d.includes('challenging')) return 3
    if (d.includes('medium') || d.includes('moderate')) return 2
    return 1
  }, [difficultyLabel])

  const walkthroughRef2 = useRef<HTMLElement>(null)
  const drilldownRef2   = useRef<HTMLElement>(null)
  const scrollToRef = useCallback((ref: React.RefObject<HTMLElement | null>) => {
    const el = ref.current; if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [])

  const navigate = useCallback((dir: 'next' | 'prev') => {
    const step = activeStepRef.current
    if (dir === 'next' && step === 0) scrollToRef(drilldownRef2)
    if (dir === 'prev' && step === 1) scrollToRef(walkthroughRef2)
  }, [scrollToRef])

  useSwipeNavigation(navigate)

  useEffect(() => {
    const handleScroll = () => {
      const dd = drilldownRef2.current; if (!dd) return
      const top = dd.getBoundingClientRect().top
      setActiveStep(top < window.innerHeight * 0.5 ? 1 : 0)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleStepClick = useCallback((idx: number) => {
    if (idx === 0) scrollToRef(walkthroughRef2)
    if (idx === 1) scrollToRef(drilldownRef2)
  }, [scrollToRef])

  // Click-outside deselects focused node
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-node-button]')) setFocusedId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Node select — collapse if already expanded, expand path otherwise
  const handleSelect = (id: string) => {
    setFocusedId(id)
    const node = NODES[id]
    if (node?.children.length && expandedIds.has(id)) {
      setExpandedIds(prev => {
        const next = new Set(prev)
        next.delete(id); descendants(id).forEach(d => next.delete(d))
        return next
      })
    } else {
      setExpandedIds(prev => {
        const next = new Set(prev)
        pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) })
        return next
      })
    }
    setEdgeAnimKey(k => k + 1)
  }
  const handleToggle  = (id: string) => {
    setEdgeAnimKey(k => k + 1)
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); descendants(id).forEach(d => next.delete(d)) }
      else { next.add(id); const parent = PARENTS[id]; if (parent) NODES[parent].children.forEach(sib => { if (sib !== id) { next.delete(sib); descendants(sib).forEach(d => next.delete(d)) } }) }
      return next
    })
    setEdgeAnimKey(k => k + 1)
  }
  const handleMobileSelect = (id: string) => { setMobileFocId(id); setMobileExpIds(prev => { const next = new Set(prev); pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) }); return next }) }
  const handleMobileToggle = (id: string) => {
    setMobileExpIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); descendants(id).forEach(d => next.delete(d)); if (pathTo(mobileFocId).includes(id)) setMobileFocId(id) }
      else { next.add(id); const parent = PARENTS[id]; if (parent) NODES[parent].children.forEach(sib => { if (sib !== id) { next.delete(sib); descendants(sib).forEach(d => next.delete(d)) } }) }
      return next
    })
  }

  return (
    <div style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="min-h-screen bg-[#fff8f0] text-[#3B2F2F] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]">

      <style>{`
        html, body { overscroll-behavior-x: none; }
        @keyframes cpm-fade-up { from { opacity:0; transform:translateY(22px); filter:blur(6px) } to { opacity:1; transform:translateY(0); filter:blur(0) } }
        @keyframes cpm-glow { 0%,100% { opacity:.42; transform:translate3d(0,0,0) scale(1) } 50% { opacity:.7; transform:translate3d(12px,-8px,0) scale(1.04) } }
        @keyframes cpm-connector { from { opacity:0; stroke-dashoffset:1 } to { opacity:1; stroke-dashoffset:0 } }
        @keyframes cpm-node-in { from { opacity:0; transform:translateY(16px) scale(.96); filter:blur(6px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
        @keyframes cpm-sidebar-card-in { from { opacity:0; transform:translateY(16px) scale(0.97); filter:blur(5px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
        @keyframes cpm-card-warmth { 0% { box-shadow:inset 0 0 0 rgba(61,90,53,0) } 40% { box-shadow:inset 0 0 24px rgba(61,90,53,0.04) } 100% { box-shadow:inset 0 0 0 rgba(61,90,53,0) } }
        @keyframes cpm-sidebar-glow { 0%,100% { opacity:0.4; transform:scale(1) } 50% { opacity:0.7; transform:scale(1.05) } }
        @keyframes cpm-dot-breathe { 0%,100% { opacity:0.55; transform:scale(1) } 50% { opacity:1; transform:scale(1.35) } }
        @keyframes cpm-badge-shimmer { 0%,100% { background-position:0% 50% } 50% { background-position:100% 50% } }
        html { scrollbar-width:none; -ms-overflow-style:none; }
        html::-webkit-scrollbar { display:none; }
      `}</style>

      <Navbar currentPage="repository" />

      <div className="pt-[70px]">
        {/* Outer flex: main content + right notes panel */}
        <div className="relative mx-auto flex max-w-[1760px] items-start px-4 lg:px-6">

          {/* ── Main content (same as preview, no forum) ── */}
          <main className="relative min-w-0 flex-1 pb-28 pt-10">

            {/* Ambient glow */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute left-[10%] top-[14%] h-[280px] w-[280px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(61,90,53,0.08) 0%, rgba(61,90,53,0.04) 30%, transparent 72%)', animation: 'cpm-glow 14s ease-in-out infinite' }} />
              <div className="absolute right-[8%] top-[20%] h-[240px] w-[240px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(196,168,130,0.1) 0%, rgba(196,168,130,0.04) 28%, transparent 68%)', animation: 'cpm-glow 16s ease-in-out infinite reverse' }} />
            </div>

            {/* Hero */}
            <section className="relative z-10 pb-3 pt-2">
              <h1 className="-ml-[2px] font-light leading-[1.02] tracking-tight text-[#453a2a]"
                style={{ fontFamily: "'Newsreader', serif", fontSize: isDesktop ? '4.2rem' : '2.8rem', animation: 'cpm-fade-up 0.75s cubic-bezier(0.22,1,0.36,1) 0.06s both' }}>
                {caseData.title.trim()}
              </h1>
            </section>

            {/* Step indicator */}
            <div>
              <StepIndicator steps={STEPS} activeStep={activeStep} onStepClick={handleStepClick} />
            </div>

            {/* Walkthrough */}
            <section ref={walkthroughRef2} className="relative z-10 pt-6">
              <div className="mb-6 flex flex-wrap gap-2.5 lg:hidden">
                {[
                  { label: 'Type', value: caseTypeLabel },
                  { label: 'Industry', value: industryLabel },
                  { label: 'Level', value: difficultyLabel },
                  ...(companyLabel !== 'Client Not Specified' ? [{ label: 'Company', value: companyLabel }] : []),
                  ...(roundLabel !== 'Round Not Specified'   ? [{ label: 'Round',   value: roundLabel }]   : []),
                ].map(t => (
                  <div key={t.label} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#5C4033]/50">{t.label}</span>
                    <span className="rounded-md border border-[#5C4033]/12 bg-[#D9D0C4]/25 px-2.5 py-[3px] text-[10px] font-medium text-[#5C4033]/70">{t.value}</span>
                  </div>
                ))}
              </div>

              <div className="hidden rounded-2xl border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px] lg:block">
                <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
                  <aside className="hidden lg:block">
                    <div className="sticky top-[128px] flex flex-col gap-3.5 px-3 py-4" style={{ height: 'calc(100vh - 168px)' }}>
                      <div className="pointer-events-none absolute inset-0 z-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(61,90,53,0.07) 0%, rgba(61,90,53,0.02) 50%, transparent 80%)', animation: 'cpm-sidebar-glow 14s ease-in-out infinite' }} />
                      {[
                        { label: 'CASE TYPE', value: caseTypeLabel },
                        ...(companyLabel !== 'Client Not Specified' ? [{ label: 'COMPANY',  value: companyLabel }] : []),
                        ...(roundLabel   !== 'Round Not Specified'  ? [{ label: 'ROUND',    value: roundLabel   }] : []),
                        { label: 'INDUSTRY', value: industryLabel },
                      ].map((item, idx) => (
                        <div key={item.label} className="group relative flex-1 flex flex-col items-center justify-center rounded-[4px] border border-[rgba(61,90,53,0.10)] transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-[rgba(61,90,53,0.18)] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.10)]"
                          style={{ background: 'rgba(255,248,240,0.80)', animation: `cpm-sidebar-card-in 0.5s cubic-bezier(0.22,1,0.36,1) ${idx * 100}ms both, cpm-card-warmth 1.6s ease-out ${0.4 + idx * 0.12}s 1 both`, zIndex: 1 }}>
                          <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#5C4033]/50 leading-none text-center">{item.label}</p>
                          <p className="text-[22px] font-medium text-[#3B2F2F] tracking-tight mt-2 leading-none text-center relative z-10" style={{ fontFamily: "'Newsreader', serif" }}>{item.value}</p>
                        </div>
                      ))}
                      <div className="group relative flex-1 flex flex-col items-center justify-center rounded-[4px] border border-[rgba(61,90,53,0.10)] transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-[rgba(61,90,53,0.18)] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.10)]"
                        style={{ background: 'rgba(255,248,240,0.80)', animation: 'cpm-sidebar-card-in 0.5s cubic-bezier(0.22,1,0.36,1) 400ms both, cpm-card-warmth 1.6s ease-out 0.88s 1 both', zIndex: 1 }}>
                        <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#5C4033]/50 leading-none text-center">DIFFICULTY</p>
                        <div className="flex items-center justify-center gap-2.5 mt-2.5">
                          {[1,2,3].map(i => <div key={i} className="h-8 w-5 rounded-[2px] transition-all duration-500" style={{ backgroundColor: i <= difficultyLevel ? '#3D5A35' : 'rgba(217,208,196,0.3)' }} />)}
                        </div>
                      </div>
                    </div>
                  </aside>
                  <div className="relative min-w-0">
                    <div className="absolute left-0 top-0 hidden h-full w-px lg:block">
                      <div className="sticky top-[128px] w-full" style={{ height: 'calc(100vh - 168px)', background: 'linear-gradient(180deg, transparent 0%, rgba(92,64,51,0.14) 12%, rgba(92,64,51,0.14) 88%, transparent 100%)' }} />
                    </div>
                    <div className="custom-scrollbar relative pl-7 pr-5 py-6">
                      <div className="pointer-events-none z-20" style={{ position: 'sticky', top: 'calc(100vh - 120px)', height: '120px', marginBottom: '-120px', background: 'linear-gradient(to top, rgba(255,248,240,1) 0%, rgba(255,248,240,0.88) 40%, rgba(255,248,240,0) 100%)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)', maskImage: 'linear-gradient(to top, black 20%, transparent)' }} />
                      <div>
                        {blocks.map((block, index) => (
                          <div key={block.key} className={walkthroughSpacingClass(block, index > 0 ? blocks[index - 1] : undefined)}>
                            <Reveal><WalkthroughBlockView block={block} /></Reveal>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile */}
              <div className="lg:hidden">
                {blocks.map((block, index) => (
                  <div key={block.key} className={walkthroughSpacingClass(block, index > 0 ? blocks[index - 1] : undefined)}>
                    <Reveal><WalkthroughBlockView block={block} /></Reveal>
                  </div>
                ))}
              </div>
            </section>

            {/* Drill Down */}
            <section ref={drilldownRef2} className="relative z-10 mt-12">
              <div className="hidden lg:block">
                <div className="rounded-2xl border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px]">
                  <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
                    <aside className="hidden lg:block">
                      <div className="sticky top-[128px] flex flex-col gap-3.5 px-3 py-4" style={{ height: 'calc(100vh - 168px)' }}>
                        <div className="pointer-events-none absolute inset-0 z-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(61,90,53,0.07) 0%, rgba(61,90,53,0.02) 50%, transparent 80%)', animation: 'cpm-sidebar-glow 14s ease-in-out infinite' }} />
                        {NOTES.map((n, idx) => (
                          <div key={n.title} className="group relative flex-1 flex flex-col items-center justify-center rounded-[4px] border border-[rgba(61,90,53,0.10)] transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-[rgba(61,90,53,0.18)] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.10)]"
                            style={{ background: 'rgba(255,248,240,0.80)', animation: `cpm-sidebar-card-in 0.5s cubic-bezier(0.22,1,0.36,1) ${idx * 100}ms both, cpm-card-warmth 1.6s ease-out ${0.4 + idx * 0.12}s 1 both`, zIndex: 1 }}>
                            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#5C4033]/50 leading-none text-center mb-3">{n.title}</p>
                            <ul className="w-full px-3">
                              {n.items.map(item => (
                                <li key={item} className="flex items-start gap-2 mb-2 last:mb-0">
                                  <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#3B2F2F]/60" />
                                  <span className="flex-1 text-[14px] leading-relaxed font-medium text-[#3B2F2F]" style={{ fontFamily: "'Newsreader', serif" }}>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </aside>
                    <div className="relative min-w-0">
                      <div className="absolute left-0 top-0 hidden h-full w-px lg:block">
                        <div className="sticky top-[128px] w-full" style={{ height: 'calc(100vh - 168px)', background: 'linear-gradient(180deg, transparent 0%, rgba(92,64,51,0.14) 12%, rgba(92,64,51,0.14) 88%, transparent 100%)' }} />
                      </div>
                      <div className="relative flex flex-col pl-7 pr-5 py-6" style={{ minHeight: 'calc(100vh - 216px)' }}>
                        {isChartFullyExpanded && treeFullyRevealed && (
                          <div className="pointer-events-none z-20" style={{ position: 'sticky', top: 'calc(100vh - 110px)', height: '110px', marginBottom: '-110px', background: 'linear-gradient(to top, rgba(255,248,240,1) 0%, rgba(255,248,240,0.88) 40%, rgba(255,248,240,0) 100%)', backdropFilter: `blur(${treeFullyRevealed ? 3 : 6}px)`, WebkitBackdropFilter: `blur(${treeFullyRevealed ? 3 : 6}px)`, WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)', maskImage: 'linear-gradient(to top, black 20%, transparent)', transition: 'all 0.8s cubic-bezier(0.22,1,0.36,1)' }} />
                        )}
                        <div ref={chartRef} className={chartMaxDepth === 0 ? 'flex-1 flex items-center' : 'flex-1'} style={{ transform: 'scale(1.05)', transformOrigin: 'top center' }}>
                          <DesktopChart visibleIds={visibleIds} expandedIds={expandedIds} focusedId={focusedId} onSelect={handleSelect} onToggle={handleToggle} revealDepth={revealDepth} edgeAnimKey={edgeAnimKey} />
                        </div>
                        {recommendations.length > 0 && (
                          <div className="pt-16">
                            <Reveal>
                              <div className="mb-4 flex items-center gap-4">
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Recommendations</span>
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                              </div>
                            </Reveal>
                            <ul className="space-y-2">
                              {recommendations.map((item, i) => (
                                <Reveal key={`rec-${i}`}>
                                  <li className="flex items-start gap-2">
                                    <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#3B2F2F]/60" />
                                    <span className="flex-1 text-[14px] leading-relaxed font-medium text-[#3B2F2F]" style={{ fontFamily: "'Newsreader', serif" }}>{item}</span>
                                  </li>
                                </Reveal>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile drill down */}
              <div className="lg:hidden">
                <div className="mb-6 grid gap-3 sm:grid-cols-3">
                  {NOTES.map(n => <NoteCard key={n.title} title={n.title} items={n.items} />)}
                </div>
                <Reveal>
                  <div className="space-y-3">
                    <MobileTreeNode nodeId={ROOT_ID} focusedId={mobileFocId} expandedIds={mobileExpIds} onSelect={handleMobileSelect} onToggle={handleMobileToggle} />
                  </div>
                </Reveal>
                {recommendations.length > 0 && (
                  <div className="mt-12">
                    <Reveal>
                      <div className="mb-4 flex items-center gap-4">
                        <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Recommendations</span>
                        <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                      </div>
                    </Reveal>
                    <ul className="space-y-2">
                      {recommendations.map((item, i) => (
                        <Reveal key={`rec-m-${i}`}>
                          <li className="flex items-start gap-2">
                            <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#3B2F2F]/60" />
                            <span className="flex-1 text-[14px] leading-relaxed font-medium text-[#3B2F2F]" style={{ fontFamily: "'Newsreader', serif" }}>{item}</span>
                          </li>
                        </Reveal>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </main>

          {/* ── Right panel: notes + ratings + end case ── */}
          <aside
            className="hidden lg:flex flex-col gap-5 flex-shrink-0 pt-10 pb-10"
            style={{
              width: '280px',
              position: 'sticky',
              top: '70px',
              height: 'calc(100vh - 70px)',
              overflowY: 'auto',
              paddingLeft: '20px',
            }}
          >
            {/* Notes */}
            <div className="rounded-2xl border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px] p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="h-[5px] w-[5px] rounded-full bg-[#3D5A35]" style={{ animation: 'cpm-dot-breathe 2.5s ease-in-out infinite' }} />
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50">Interviewer Notes</p>
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Record observations..."
                className="w-full resize-none rounded-[12px] border border-[#5C4033]/10 bg-[rgba(255,248,240,0.6)] p-3 text-[13px] leading-relaxed text-[#3B2F2F] placeholder:text-[#5C4033]/30 focus:border-[#3D5A35]/30 focus:outline-none focus:ring-1 focus:ring-[#3D5A35]/20 transition-all"
                style={{ height: '120px', fontFamily: "'Work Sans', sans-serif" }}
              />
            </div>

            {/* Ratings */}
            <div className="rounded-2xl border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px] p-4 flex flex-col gap-4 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50">Live Evaluation</p>
              {EVAL_CRITERIA.map(c => {
                const score = scores[c.id]
                return (
                  <div key={c.id} className="rounded-[12px] border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.6)] px-3 py-2.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[#3B2F2F]">{c.label}</span>
                      <span className="rounded-full border border-[#5C4033]/15 bg-[rgba(255,248,240,0.9)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#5C4033]/60">
                        {score > 0 ? `${score}/5` : 'NR'}
                      </span>
                    </div>
                    <input
                      type="range" min="0" max="5" step="1" value={score}
                      onChange={e => setScores({ ...scores, [c.id]: parseInt(e.target.value, 10) })}
                      className="w-full cursor-pointer appearance-none rounded-full accent-[#3D5A35]"
                      style={{ height: '5px', background: `linear-gradient(to right, #3D5A35 ${score * 20}%, rgba(92,64,51,0.15) ${score * 20}%)` }}
                    />
                    <div className="flex justify-between text-[8px] font-semibold uppercase tracking-[0.1em] text-[#5C4033]/35">
                      <span>NR</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* End case */}
            <button
              onClick={onEndCase}
              className="w-full rounded-2xl border border-[#3D5A35]/20 bg-[#3D5A35] py-3.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#f0f5ee] transition-all hover:bg-[#2e4428] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.35)]"
            >
              End Case & Evaluate →
            </button>
          </aside>

        </div>
        <CompactFooter />
      </div>
    </div>
  )
}

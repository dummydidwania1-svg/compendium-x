'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
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
}

/* ═══════════════════════════════════════════════════════════
   Framework Tree — Banking on You
   ═══════════════════════════════════════════════════════════ */

type FrameworkNode = {
  id: string
  label: string
  tone: 'root' | 'branch' | 'support' | 'leaf'
  children: readonly string[]
}

const NODES: Record<string, FrameworkNode> = {
  revenue:                 { id: 'revenue',                label: 'Revenue',               tone: 'root',    children: ['interest-on-loans','fees-and-penalties','interest-on-investments','locker-charges','ancillary-services'] },
  'interest-on-loans':     { id: 'interest-on-loans',      label: 'Interest on Loans',     tone: 'branch',  children: ['amount-of-loans','interest-rate','percent-collected'] },
  'fees-and-penalties':    { id: 'fees-and-penalties',      label: 'Fees & Penalties',      tone: 'support', children: [] },
  'interest-on-investments':{ id: 'interest-on-investments',label: 'Interest on Investments',tone: 'support', children: [] },
  'locker-charges':        { id: 'locker-charges',          label: 'Locker Charges',        tone: 'support', children: [] },
  'ancillary-services':    { id: 'ancillary-services',      label: 'Ancillary Services',    tone: 'support', children: [] },
  'amount-of-loans':       { id: 'amount-of-loans',         label: 'Amount of Loans',       tone: 'branch',  children: ['availability-of-funds','limited-demand'] },
  'interest-rate':         { id: 'interest-rate',            label: 'Interest Rate',         tone: 'support', children: [] },
  'percent-collected':     { id: 'percent-collected',        label: '% Collected',           tone: 'support', children: [] },
  'availability-of-funds': { id: 'availability-of-funds',   label: 'Availability of Funds', tone: 'branch',  children: ['number-of-people','deposit-per-person'] },
  'limited-demand':        { id: 'limited-demand',           label: 'Limited Demand',        tone: 'support', children: [] },
  'number-of-people':      { id: 'number-of-people',         label: 'No. of People',         tone: 'support', children: [] },
  'deposit-per-person':    { id: 'deposit-per-person',       label: 'Deposit per Person',    tone: 'branch',  children: ['amount-earned','percent-deposited'] },
  'amount-earned':         { id: 'amount-earned',            label: 'Amount Earned',         tone: 'support', children: [] },
  'percent-deposited':     { id: 'percent-deposited',        label: '% Deposited',           tone: 'branch',  children: ['alternates','policies','consumption'] },
  alternates:              { id: 'alternates',               label: 'Alternates',            tone: 'leaf',    children: [] },
  policies:                { id: 'policies',                 label: 'Policies',              tone: 'leaf',    children: [] },
  consumption:             { id: 'consumption',              label: 'Consumption',           tone: 'leaf',    children: [] },
}

const PARENTS: Record<string, string> = {
  'interest-on-loans': 'revenue', 'fees-and-penalties': 'revenue', 'interest-on-investments': 'revenue',
  'locker-charges': 'revenue', 'ancillary-services': 'revenue',
  'amount-of-loans': 'interest-on-loans', 'interest-rate': 'interest-on-loans', 'percent-collected': 'interest-on-loans',
  'availability-of-funds': 'amount-of-loans', 'limited-demand': 'amount-of-loans',
  'number-of-people': 'availability-of-funds', 'deposit-per-person': 'availability-of-funds',
  'amount-earned': 'deposit-per-person', 'percent-deposited': 'deposit-per-person',
  alternates: 'percent-deposited', policies: 'percent-deposited', consumption: 'percent-deposited',
}

const DEFAULT_EXPANDED = new Set([
  'revenue', 'interest-on-loans', 'amount-of-loans',
  'availability-of-funds', 'deposit-per-person', 'percent-deposited',
])
const DEFAULT_FOCUSED_ID = 'alternates'

const NOTES = [
  { title: 'Clarifying Questions', items: ['Which revenue stream?', 'Where are the branches concentrated?'] },
  { title: 'Brownie Points', items: ['Increased consumption expenditure', 'Salary-account tie-ups and policy nudges'] },
  { title: 'Keep In Mind', items: ['Banking cases reward value-chain awareness and product fluency.'] },
]

const FALLBACK_RECOMMENDATIONS = [
  'Build a mutual fund and SIP offering inside the bank.',
  'Introduce adjacent investment products such as gold-linked options.',
  'Retarget deposit growth toward customer groups beyond the 21-35 bracket.',
]

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

  measure('revenue')
  assign('revenue', hPad, hPad + Math.max(width - hPad * 2, 1))

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

      const rowLeft = parentId === 'revenue' ? laneL : aL
      const rowRight = parentId === 'revenue' ? laneR : aR
      const rowWidth = Math.max(rowRight - rowLeft, 1)
      const defaultGap = gapFor(children.length, nodeDepth(parentId))
      const footprintSum = children.reduce((sum, childId) => sum + effectiveFootprint(childId), 0)
      const packedGap =
        children.length > 1
          ? parentId === 'revenue'
            ? Math.max(defaultGap, (rowWidth - footprintSum) / (children.length - 1))
            : Math.max(8, Math.min(defaultGap, (rowWidth - footprintSum) / (children.length - 1)))
          : defaultGap
      const groupWidth = footprintSum + packedGap * Math.max(children.length - 1, 0)
      const desiredLeft =
        parentId === 'revenue'
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

    const rootPoint = pos.get('revenue')
    const visibleRootChildren = NODES.revenue.children.filter((childId) => vis.has(childId))
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
        const rootWidth = effW.get('revenue') ?? estNodeW('revenue')
        const rootFootprint = rootWidth + (NODES.revenue.children.length > 0 ? 34 : 0)
        const minRootX = laneL + rootWidth / 2
        const maxRootX = laneR - rootFootprint + rootWidth / 2
        const targetRootX = Math.max(minRootX, Math.min((childBounds.minX + childBounds.maxX) / 2, maxRootX))
        pos.set('revenue', { x: targetRootX, y: rootPoint.y })
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
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#5C4033]/8 bg-[rgba(255,248,240,0.82)] shadow-[0_8px_18px_-18px_rgba(58,45,35,0.28)] backdrop-blur-sm transition-colors duration-300">
      <span className="relative block h-2 w-2">
        <span className="absolute left-0 top-1/2 h-[1.15px] w-full -translate-y-1/2 rounded-full bg-[#3D5A35]/72" />
        <span className={`absolute left-1/2 top-0 h-full w-[1.15px] -translate-x-1/2 rounded-full bg-[#3D5A35]/72 transition-all duration-300 ${expanded ? 'scale-y-0 opacity-0' : 'scale-y-100 opacity-100'}`} />
      </span>
    </span>
  )
}

/* ─── Sidebar: Meta field card ─────────────────────── */

function MetaField({ label, value, tone = 'light' }: { label: string; value: string; tone?: 'dark' | 'mid' | 'light' }) {
  const headerCls = tone === 'dark'
    ? 'bg-[#5C4033] text-[#f4ede3]'
    : tone === 'mid'
      ? 'bg-[#C4A882]/75 text-[#f4ede3]'
      : 'bg-[#D9D0C4]/70 text-[#5C4033]'
  return (
    <div className="overflow-hidden rounded-xl border border-[#D9D0C4]/40 shadow-[0_8px_24px_-20px_rgba(58,45,35,0.15)]">
      <div className={`px-4 py-2.5 text-center ${headerCls}`}>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]">{label}</span>
      </div>
      <div className="bg-[#f4ede3]/80 px-4 py-3.5 text-center">
        <span className="text-[15px] font-medium uppercase tracking-[0.03em] text-[#3B2F2F]">{value}</span>
      </div>
    </div>
  )
}

/* ─── Sidebar: Difficulty bar chart ────────────────── */

function DifficultyBar({ level, label }: { level: number; label: string }) {
  const active = Math.max(0, Math.min(3, level))
  return (
    <div className="overflow-hidden rounded-xl border border-[#D9D0C4]/40 shadow-[0_8px_24px_-20px_rgba(58,45,35,0.15)]">
      <div className="px-5 py-5">
        <div className="flex items-end justify-center gap-3">
          {[28, 40, 54].map((h, i) => (
            <div
              key={`bar-${i}`}
              className={`w-7 rounded-sm border transition-colors duration-500 ${
                i < active ? 'border-[#5C4033]/30 bg-[#5C4033]/60' : 'border-[#5C4033]/12 bg-transparent'
              }`}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      </div>
      <div className="bg-[#D9D0C4]/50 px-4 py-2 text-center">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5C4033]">Difficulty</span>
      </div>
      <div className="bg-[#f4ede3]/80 px-4 py-2 text-center">
        <span className="text-[13px] font-medium text-[#5C4033]/80">{label}</span>
      </div>
    </div>
  )
}

/* ─── Sidebar: Note card (framework section) ───────── */

function NoteCard({ title, items, className = '' }: { title: string; items: string[]; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-[#5C4033]/8 bg-[rgba(255,248,240,0.82)] shadow-[0_10px_28px_-22px_rgba(58,45,35,0.18)] backdrop-blur-sm ${className}`}>
      <div className="bg-[#D9D0C4]/50 px-4 py-2.5">
        <span className="block text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#5C4033]">{title}</span>
      </div>
      <div className="h-full px-4 py-4">
        <ul className="mx-auto flex max-w-[13.25rem] flex-col space-y-3">
          {items.map(item => (
            <li key={item} className="flex items-start justify-center gap-2.5 text-[13px] leading-relaxed text-[#434840]">
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
      ? 'font-normal text-[#434840]'
      : 'font-normal text-[#5C4033]'
}

function WalkthroughBlockView({ block }: { block: WalkthroughBlock }) {
  if (block.kind === 'heading') {
    return (
      <div className="pt-3 pb-0.5">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#3D5A35]/55">{block.text}</h4>
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
  visibleIds, expandedIds, focusedId, onSelect, onToggle, revealDepth,
}: {
  visibleIds: string[]
  expandedIds: Set<string>
  focusedId: string
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  revealDepth: number
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [cW, setCW] = useState(980)
  const started = revealDepth >= 0
  const defaultPath = useMemo(() => pathTo(DEFAULT_FOCUSED_ID), [])
  const maxD = useMemo(() => Math.max(...visibleIds.map(nodeDepth), 0), [visibleIds])

  const metrics = useMemo(() => {
    if (maxD <= 0) return { h: 160, tp: 80, bp: 20 }
    if (maxD <= 1) return { h: 220, tp: 56, bp: 28 }
    if (maxD <= 2) return { h: 300, tp: 50, bp: 34 }
    if (maxD <= 4) return { h: 420, tp: 46, bp: 38 }
    return { h: 520, tp: 42, bp: 36 }
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

  const labelFs = 11.4
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
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
        <div
          className="absolute left-[12%] top-[18%] h-[240px] w-[240px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(61,90,53,0.08) 0%, rgba(61,90,53,0.03) 36%, transparent 72%)',
          }}
        />
      </div>

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
              <path key={`${pid}-${cid}`} d={`M ${pp.x} ${sY} V ${mY} H ${cp.x} V ${eY}`}
                fill="none" stroke="#6c5746" strokeWidth="1.9" strokeLinecap="square"
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
            ? 'border-[#564233]/88 bg-[#665241] text-[#f8f1e8] shadow-[0_16px_30px_-26px_rgba(86,66,51,0.26)]'
            : isSelected
              ? 'border-[#3D5A35]/34 bg-[rgba(250,246,238,0.96)] text-[#4f4335] shadow-[0_0_0_1px_rgba(61,90,53,0.12),0_0_28px_-18px_rgba(61,90,53,0.3)]'
              : 'border-[rgba(92,64,51,0.08)] bg-[rgba(255,248,240,0.6)] text-[#5C4033] shadow-[0_4px_14px_rgba(59,47,47,0.035)] backdrop-blur-[28px]'
          return (
            <div key={id} className="absolute z-20 flex items-center gap-2 transition-all duration-500"
              style={{ left: p.x, top: p.y, transform: 'translate(-50%,-50%)', opacity: isRevealed ? 1 : 0, transitionDelay: `${stagger}ms` }}>
              <div className="relative inline-flex items-center"
                style={{ animation: isRevealed ? `cpm-node-in 420ms cubic-bezier(0.22,1,0.36,1) ${stagger}ms both` : 'none' }}>
                <button type="button" onClick={() => onSelect(id)}
                  className={`flex items-center justify-center rounded-[6px] border px-4 py-3 text-center font-medium tracking-[0.01em] transition-all duration-300 hover:-translate-y-0.5 ${cls}`}
                  style={{ width: `${lw}px`, minHeight: `${labelMinH}px`, fontSize: `${labelFs}px`, lineHeight: '1.18', whiteSpace: 'normal' }}>
                  {node.label}
                </button>
                {hasCh && (
                  <button type="button" onClick={e => { e.stopPropagation(); onToggle(id) }}
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
      <div className={`rounded-[22px] border px-4 py-4 transition-all ${
        isFoc ? 'border-[#3D5A35]/16 bg-[rgba(255,248,240,0.88)] shadow-[0_18px_40px_-34px_rgba(61,90,53,0.18)]'
              : 'border-[#5C4033]/8 bg-[rgba(255,248,240,0.74)]'
      }`}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onSelect(nodeId)}
            className={`flex-1 text-left text-[13px] leading-relaxed ${isFoc ? 'font-semibold text-[#3B2F2F]' : 'font-medium text-[#5C4033]/78'}`}>
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
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#3D5A35]">{text}</span>
        <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(61,90,53,0.18), transparent)' }} />
      </div>
    </Reveal>
  )
}

/* ═══════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */

export default function CasePreviewMaster({
  caseData, previewMode, transcriptDisplayLines, parsedFramework,
  promptLines, caseTypeLabel, industryLabel, difficultyLabel,
  companyLabel, roundLabel, ForumSection,
}: CasePreviewMasterProps) {
  const router = useRouter()
  const chartRef = useRef<HTMLDivElement>(null)

  // ─── Responsive ──────────────────────────────
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(mq.matches)
    sync(); mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // ─── Chart reveal (depth-by-depth tree animation) ─
  const [revealDepth, setRevealDepth] = useState(-1)
  const treeFullyRevealed = revealDepth >= 6

  useEffect(() => {
    const el = chartRef.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setRevealDepth(0); obs.disconnect() }
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.05 })
    obs.observe(el); return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (revealDepth < 0 || revealDepth >= 6) return
    const timer = setTimeout(() => setRevealDepth(d => d + 1), 420)
    return () => clearTimeout(timer)
  }, [revealDepth])

  // ─── Chart state ─────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(DEFAULT_EXPANDED))
  const [focusedId, setFocusedId] = useState(DEFAULT_FOCUSED_ID)
  const [mobileExpIds, setMobileExpIds] = useState<Set<string>>(new Set(DEFAULT_EXPANDED))
  const [mobileFocId, setMobileFocId] = useState(DEFAULT_FOCUSED_ID)

  // ─── Derived data ────────────────────────────
  const allLines = useMemo<TranscriptDisplayLine[]>(() => [
    ...promptLines.map(l => ({ text: l, speaker: 'interviewer' as const })),
    ...transcriptDisplayLines,
  ], [promptLines, transcriptDisplayLines])

  const blocks = useMemo(() => buildBlocks(allLines), [allLines])

  const recommendations = useMemo(
    () => parsedFramework.recommendations.length > 0 ? parsedFramework.recommendations : FALLBACK_RECOMMENDATIONS,
    [parsedFramework.recommendations],
  )

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
  const visibleIds = useMemo(() => { const s = new Set<string>(); collectVisible('revenue', expandedIds, s); return [...s] }, [expandedIds])

  // ─── Handlers ────────────────────────────────
  const handleSelect = (id: string) => {
    setFocusedId(id)
    setExpandedIds(prev => {
      const next = new Set(prev)
      pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) })
      return next
    })
  }

  const handleToggle = (id: string) => {
    const node = NODES[id]; if (!node?.children.length) return
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id); descendants(id).forEach(d => next.delete(d))
        if (pathTo(focusedId).includes(id)) setFocusedId(id)
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
      className="min-h-screen bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]">

      {/* ─── Keyframes ────────────────────────── */}
      <style>{`
        @keyframes cpm-fade-up { from { opacity:0; transform:translateY(22px); filter:blur(6px) } to { opacity:1; transform:translateY(0); filter:blur(0) } }
        @keyframes cpm-glow { 0%,100% { opacity:.42; transform:translate3d(0,0,0) scale(1) } 50% { opacity:.7; transform:translate3d(12px,-8px,0) scale(1.04) } }
        @keyframes cpm-connector { from { opacity:0; stroke-dashoffset:1 } to { opacity:1; stroke-dashoffset:0 } }
        @keyframes cpm-node-in { from { opacity:0; transform:translateY(16px) scale(.96); filter:blur(6px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
        @keyframes cpm-helper-breathe { 0%,100% { opacity:.42; transform:translateY(0) } 50% { opacity:.78; transform:translateY(-1px) } }
      `}</style>

      <Navbar currentPage="repository" />

      {/* ─── Sticky subheader ─────────────────── */}
      <div className="pt-[70px]">
        <div className="sticky top-[70px] z-40 border-b border-[#5C4033]/6"
          style={{ background: 'rgba(255,248,240,0.9)', backdropFilter: 'blur(20px) saturate(1.4)', WebkitBackdropFilter: 'blur(20px) saturate(1.4)' }}>
          <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
            <Link href="/repository" className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#5C4033]/52 transition hover:text-[#3D5A35]">
              ← Exit Case
            </Link>
            <div className="flex items-center gap-3">
              {previewMode && (
                <button type="button" onClick={() => router.push('/practice')}
                  className="rounded-full border border-[#3D5A35]/14 bg-[#3D5A35]/4 px-4 py-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#3D5A35]/62 transition-all hover:bg-[#3D5A35]/8">
                  Practice This Case
                </button>
              )}
              <span className="rounded-sm border border-[#C4A882]/28 bg-[#C4A882]/8 px-1.5 py-[2px] text-[7px] font-semibold uppercase tracking-[0.1em] text-[#C4A882]">
                {previewMode ? 'Preview' : 'Interviewer'}
              </span>
            </div>
          </div>
        </div>

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
          <section className="relative z-10 pb-8 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#3D5A35]/60"
              style={{ animation: 'cpm-fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}>
              Case Preview
            </p>
            <h1 className="mt-3 font-light leading-[1.02] tracking-tight text-[#453a2a]"
              style={{ fontFamily: "'Newsreader', serif", fontSize: isDesktop ? '3.6rem' : '2.8rem', animation: 'cpm-fade-up 0.8s cubic-bezier(0.22,1,0.36,1) 0.1s both' }}>
              {caseData.title.trim()}
            </h1>

            <div className="mt-6" style={{ animation: 'cpm-fade-up 0.7s cubic-bezier(0.22,1,0.36,1) 0.3s both' }}>
              <div className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-full border border-[#5C4033]/10 bg-[rgba(255,248,240,0.82)] px-5 py-2.5 shadow-[0_18px_42px_-38px_rgba(92,64,51,0.2)] backdrop-blur-sm">
                {metadata.map((item, i) => (
                  <div key={item} className="flex items-center gap-3">
                    {i > 0 && <span className="h-1 w-1 rounded-full bg-[#C4A882]/50" />}
                    <span className="text-[12px] font-medium tracking-[0.01em] text-[#5C4033]/72">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-5"
              style={{ animation: 'cpm-fade-up 0.6s cubic-bezier(0.22,1,0.36,1) 0.5s both' }}>
              <div className="flex items-center gap-2">
                <div className="h-[6px] w-3 rounded-sm bg-[#3B2F2F]" />
                <span className="text-[10px] text-[#5C4033]/45">Interviewer</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-[6px] w-3 rounded-sm bg-[#434840]/30" />
                <span className="text-[10px] text-[#5C4033]/45">Candidate</span>
              </div>
            </div>
          </section>

          {/* ── Top divider before walkthrough ── */}
          <div className="relative z-10 hidden lg:block" style={{ height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(92,64,51,0.12) 20%, rgba(92,64,51,0.18) 50%, rgba(92,64,51,0.12) 80%, transparent 100%)' }} />

          {/* ══════════════════════════════════════
             WALKTHROUGH
             ══════════════════════════════════════ */}
          <section className="relative z-10 pt-8">
            <SectionHeading text="Walkthrough" />

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
                  <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#5C4033]/40">{t.label}</span>
                  <span className="rounded-md border border-[#5C4033]/12 bg-[#D9D0C4]/25 px-2.5 py-[3px] text-[10px] font-medium text-[#5C4033]/70">{t.value}</span>
                </div>
              ))}
            </div>

            {/* Containment frame — walkthrough */}
            <div className="hidden rounded-2xl border border-[#D9D0C4]/30 lg:block" style={{ boxShadow: '0 0 0 1px rgba(217,208,196,0.08)' }}>
              <div className="lg:grid lg:grid-cols-[minmax(218px,238px)_minmax(0,1fr)]">
                {/* ── Desktop sidebar: case metadata ── */}
                <aside className="hidden lg:block">
                  <div className="sticky top-[130px] space-y-4 px-5 py-6">
                    <MetaField label="Case Type" value={caseTypeLabel} tone="dark" />
                    {companyLabel !== 'Client Not Specified' && <MetaField label="Company" value={companyLabel} tone="light" />}
                    {roundLabel !== 'Round Not Specified' && <MetaField label="Round" value={roundLabel} tone="light" />}
                    <MetaField label="Industry" value={industryLabel} tone="mid" />
                    <DifficultyBar level={difficultyLevel} label={difficultyLabel} />
                  </div>
                </aside>

                {/* ── Gradient divider between sidebar and content ── */}
                <div className="relative min-w-0">
                  <div className="absolute left-0 top-0 hidden h-full w-px lg:block" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(92,64,51,0.14) 12%, rgba(92,64,51,0.14) 88%, transparent 100%)' }} />

                  {/* ── Transcript content (right-shifted) ── */}
                  <div className="relative pl-7 pr-5 py-6">
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
          <section className="relative z-10 mt-8 lg:mt-12">
            <div className="hidden lg:block">
              <SectionHeading text="Framework & Recommendations" />

              <div className="rounded-2xl border border-[#D9D0C4]/30" style={{ boxShadow: '0 0 0 1px rgba(217,208,196,0.08)' }}>
                <div className="lg:grid lg:grid-cols-[minmax(218px,238px)_minmax(0,1fr)]">
                  {/* ── Desktop sidebar: notes ─────────── */}
                  <aside className="hidden lg:block">
                    <div className="sticky top-[130px] flex min-h-[calc(100vh-170px)] flex-col gap-4 px-5 py-6">
                      {NOTES.map(n => <NoteCard key={n.title} title={n.title} items={n.items} className="flex-1" />)}
                    </div>
                  </aside>

                  {/* ── Gradient divider + chart/recommendations ── */}
                  <div className="relative min-w-0">
                    <div className="absolute left-0 top-0 hidden h-full w-px lg:block" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(92,64,51,0.14) 12%, rgba(92,64,51,0.14) 88%, transparent 100%)' }} />

                    <div className="relative pl-7 pr-5 py-6">
                      {/* Glass blur overlay — framework section */}
                      <div className="pointer-events-none z-20"
                        style={{
                          position: 'sticky',
                          top: `calc(100vh - ${treeFullyRevealed ? 40 : 110}px)`,
                          height: `${treeFullyRevealed ? 40 : 110}px`,
                          marginBottom: `${treeFullyRevealed ? -40 : -110}px`,
                          transition: 'all 0.8s cubic-bezier(0.22,1,0.36,1)',
                          background: `linear-gradient(to top, rgba(255,248,240,1) 0%, rgba(255,248,240,${treeFullyRevealed ? 0.5 : 0.88}) 40%, rgba(255,248,240,0) 100%)`,
                          backdropFilter: `blur(${treeFullyRevealed ? 2 : 6}px)`,
                          WebkitBackdropFilter: `blur(${treeFullyRevealed ? 2 : 6}px)`,
                          WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)',
                          maskImage: 'linear-gradient(to top, black 20%, transparent)',
                        }}
                      />

                      {/* Desktop chart — slightly zoomed for readability */}
                      <div ref={chartRef} style={{ transform: 'scale(1.05)', transformOrigin: 'top center' }}>
                        <DesktopChart visibleIds={visibleIds} expandedIds={expandedIds}
                          focusedId={focusedId} onSelect={handleSelect} onToggle={handleToggle} revealDepth={revealDepth} />
                      </div>

                      {/* ── Recommendations ─────────────── */}
                      <div className="mt-8">
                        <Reveal>
                          <div className="mb-4 flex items-center gap-4">
                            <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.14), rgba(92,64,51,0.08))' }} />
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5C4033]/55">Recommendations</span>
                            <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.08), rgba(92,64,51,0.14))' }} />
                          </div>
                        </Reveal>
                        <div className="space-y-2.5">
                          {recommendations.map((item, i) => (
                            <Reveal key={`rec-${i}`}>
                              <div className="flex items-start gap-3 py-1.5">
                                <span className="mt-0.5 text-[11px] text-[#5C4033]/50">■</span>
                                <p className="text-[14px] leading-[1.55] text-[#434840]">{item}</p>
                              </div>
                            </Reveal>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:hidden">
              <SectionHeading text="Framework & Recommendations" />

              {/* Mobile notes (above chart) */}
              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                {NOTES.map(n => <NoteCard key={n.title} title={n.title} items={n.items} />)}
              </div>

              <Reveal>
                <div className="space-y-3">
                  <MobileTreeNode nodeId="revenue" focusedId={mobileFocId} expandedIds={mobileExpIds}
                    onSelect={handleMobileSelect} onToggle={handleMobileToggle} />
                </div>
              </Reveal>
              <div className="mt-8 space-y-2.5">
                {recommendations.map((item, i) => (
                  <Reveal key={`rec-m-${i}`}>
                    <div className="flex items-start gap-3 py-1.5">
                      <span className="mt-0.5 text-[11px] text-[#5C4033]/50">■</span>
                      <p className="text-[14px] leading-[1.55] text-[#434840]">{item}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* ── Forum ──────────────────────────── */}
          {ForumSection && (
            <section className="relative z-10 mt-14">
              <Reveal>{ForumSection}</Reveal>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

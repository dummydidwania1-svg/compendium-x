'use client'

import { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/dashboard/Navbar'
import { createPortal } from 'react-dom'
import NewCaseBadge from '@/components/case/NewCaseBadge'

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
  | { key: string; kind: 'equation'; text: string; speaker: TranscriptSpeaker; level?: number }
  | { key: string; kind: 'indent'; text: string; speaker: TranscriptSpeaker; level?: number }
  | { key: string; kind: 'bullet'; marker: string; text: string; speaker: TranscriptSpeaker; level?: number }
  | { key: string; kind: 'line'; text: string; speaker: TranscriptSpeaker; level?: number }
  | { key: string; kind: 'vis-inline'; visIndex: number }

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
  defaultFocusedIds?: string[]
  notes: { title: string; items: string[] }[]
  label?: string
}

export type VisFormula = {
  type: 'formula'
  title: string
  content: string
  lhs?: string
  rhs?: string
  derivations?: { lhs: string; rhs: string }[]
}
export type VisTable = { type: 'table'; title: string; columns: string[]; rows: string[][] | string; inlineOnly?: boolean; noTitle?: boolean; summaryRows?: number[]; columnWidths?: string[]; insight?: string; header?: string }
export type VisDecisionNode = {
  id: string
  label: string
  kind: 'rect' | 'diamond' | 'terminal'
  chosen?: boolean   // true = interviewee's actual path
  children?: { edgeLabel?: string; nodeId: string }[]
}
export type VisDecision = {
  type: 'decision'
  title?: string
  nodes: VisDecisionNode[]
  rootId: string
}
export type VisCalcStep =
  | { text: string; underline?: boolean; indent?: boolean; bold?: boolean; eq?: false; label?: never; value?: never }
  | { eq: true; label: string; value: string; underline?: boolean; indent?: boolean; bold?: boolean; text?: never }
export type VisCalcPanel = { title: string; steps: VisCalcStep[] }
export type VisCalcPair = { type: 'calcpair'; header?: string; left: VisCalcPanel; right: VisCalcPanel }
export type Visualisation = VisFormula | VisTable | VisDecision | VisCalcPair

export type RecommendationsTableB = { framework: string; columns: string[]; dimensionHeader?: string; rows: { dimension: string; shortTerm: string; longTerm: string }[] }
export type RecommendationsTable  = RecommendationsTableB

export type CasePreviewMasterProps = {
  caseData: { id?: number; title: string; prompt?: string; framework?: string }
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
  additionalFrameworkTrees?: FrameworkTree[]
  visualisations?: Visualisation[]
    recommendationsTable?: RecommendationsTable
  abbreviations?: string[]
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
let DEFAULT_FOCUSED_IDS: string[] = []
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

// Union of root-to-node paths for one or more focused ids.
// Falls back to the single id when the array is empty/undefined.
function focusPathSet(ids: string[] | undefined, single: string): Set<string> {
  const list = (ids && ids.length > 0) ? ids : (single ? [single] : [])
  const out = new Set<string>()
  for (const fid of list) for (const seg of pathTo(fid)) out.add(seg)
  return out
}

// Build a parent map for an arbitrary node set (does not touch globals)
function parentsForNodes(nodes: Record<string, FrameworkNode>): Record<string, string> {
  const p: Record<string, string> = {}
  Object.values(nodes).forEach(n => n.children.forEach(c => { p[c] = n.id }))
  return p
}

// Path from a node up to its root within a specific node set
function pathToForNodes(nodes: Record<string, FrameworkNode>, parents: Record<string, string>, id: string): string[] {
  const out: string[] = []
  let cur: string | undefined = id
  while (cur) { out.push(cur); cur = parents[cur] }
  return out.reverse()
}

// Union of focus paths for a specific node set
function focusPathSetForNodes(nodes: Record<string, FrameworkNode>, ids: string[], single: string): Set<string> {
  const parents = parentsForNodes(nodes)
  const all = (ids && ids.length ? ids : (single ? [single] : []))
  const set = new Set<string>()
  all.forEach(id => { if (nodes[id]) pathToForNodes(nodes, parents, id).forEach(p => set.add(p)) })
  return set
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
function isEquation(v: string) { return v.includes('=') && (/[*xX×]/.test(v) || /–.+–/.test(v)) }
function fmtEquation(v: string) { return v.replace(/\s+/g, ' ').trim().replace(/\s*\*\s*/g, ' × ') }

function buildBlocks(lines: TranscriptDisplayLine[]): WalkthroughBlock[] {
  return lines.flatMap((e, i): WalkthroughBlock[] => {
    const n = e.text.trim()
    if (!n) return []

    // Indent level from leading whitespace (2 spaces = 1 level; a tab = 2 spaces)
    const lead = (e.text.match(/^[ \t]*/)?.[0] ?? '').replace(/\t/g, '  ')
    const level = Math.min(6, Math.floor(lead.length / 2))

    const visMatch = n.match(/^\[VIS:(\d+)\]$/)
    if (visMatch) return [{ key: `vis-${i}`, kind: 'vis-inline', visIndex: parseInt(visMatch[1], 10) }]
    if (isSectionHeading(n)) return [{ key: `h-${i}`, kind: 'heading', text: n }]

    // Explicit centering overrides (authored in JSON):
    //   "^ ..."  -> force CENTERED (equation style), even if not an equation
    //   "~ ..."  -> force normal LEFT line, even if it looks like an equation
    if (/^\^\s/.test(n)) return [{ key: `eq-${i}`, kind: 'equation', text: fmtEquation(n.replace(/^\^\s*/, '')), speaker: e.speaker, level }]
    if (/^~\s/.test(n)) return [{ key: `l-${i}`, kind: 'line', text: n.replace(/^~\s*/, ''), speaker: e.speaker, level }]

    if (/^=\s/.test(n)) return [{ key: `ind-${i}`, kind: 'indent', text: fmtEquation(n), speaker: e.speaker, level }]
    if (isEquation(n)) return [{ key: `eq-${i}`, kind: 'equation', text: fmtEquation(n), speaker: e.speaker, level }]
const bm = n.match(/^(\d+[\).]|[a-zA-Z]+\)|[-•])\s*(.+)$/)
if (bm) {
  const letterIndent = /^[a-zA-Z]+\)/.test(bm[1]) ? 1 : 0
  return [{ key: `b-${i}`, kind: 'bullet', marker: bm[1], text: bm[2], speaker: e.speaker, level: level + letterIndent }]
}
    return [{ key: `l-${i}`, kind: 'line', text: n, speaker: e.speaker, level }]
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

function estNodeLines(id: string): number {
  const node = NODES[id]
  if (!node) return 1
  const nw = estNodeW(id)
  const hasCh = node.children.length > 0
  const buttonW = hasCh ? nw - 18 : nw
  const inner = Math.max(1, buttonW - 40)
  const CHAR_WIDTH = 8.5
  const cpl = Math.max(1, Math.floor(inner / CHAR_WIDTH))
  const words = node.label.split(/\s+/)
  let lines = 1, lc = 0
  for (const w of words) {
    if (lc > 0 && lc + 1 + w.length > cpl) { lines++; lc = w.length }
    else { lc += (lc > 0 ? 1 : 0) + w.length }
  }
  return lines
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
      <div className="px-4 pt-1 pb-3 flex items-end gap-1.5">
        {([10, 18, 26] as const).map((h, idx) => (
          <div
            key={idx}
            className="w-3 rounded-sm transition-all duration-500"
            style={{ height: `${h}px`, backgroundColor: idx + 1 <= filled ? '#5C4033' : 'rgba(217,208,196,0.3)' }}
          />
        ))}
      </div>
    </div>
  );
};

/* ─── Sidebar: Note card (framework section) ───────── */

function NoteCard({ title, items, className = '' }: { title: string; items: string[]; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-[#5C4033]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px] transition-all duration-300 hover:shadow-[0_8px_24px_-8px_rgba(58,45,35,0.12)] hover:-translate-y-0.5 ${className}`}>
      <div className="bg-[#D9D0C4]/50 px-4 py-2.5">
        <span className="block text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#5C4033]">{title}</span>
      </div>
      <div className="h-full px-4 py-4">
        <ul className="mx-auto flex max-w-[13.25rem] flex-col space-y-3">
          {items.map(item => (
            <li key={item} className="flex items-start justify-center gap-2.5 text-[13px] leading-relaxed text-[#5C4033]/80">
              <span className="mt-[0.48rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#5C4033]/40" />
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

/** Render text with _italic_ markdown support */
function renderInline(text: string) {
  const parts = text.split(/(_[^_]+_)/)
  return parts.map((part, i) =>
    part.startsWith('_') && part.endsWith('_')
      ? <em key={i}>{part.slice(1, -1)}</em>
      : part
  )
}

function WalkthroughBlockView({ block }: { block: WalkthroughBlock }) {
  if (block.kind === 'vis-inline') return null

  const lvl = ('level' in block && block.level) ? block.level : 0
  const indentStyle = lvl ? { marginLeft: `${lvl * 24}px` } : undefined
  const bulletStyle = { marginLeft: `${20 + lvl * 24}px` }
  const dividerStyle = { background: 'linear-gradient(90deg, rgba(61,90,53,0.2), transparent)' }

  if (block.kind === 'heading') {
    return (
      <div className="pt-3 pb-0.5">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50">{renderInline(block.text)}</h4>
        <div className="mt-1.5 h-[1px] w-14" style={dividerStyle} />
      </div>
    )
  }
  if (block.kind === 'equation') {
    return (
      <p className={`text-center text-[16px] leading-[1.5] tracking-[0.01em] ${walkthroughSpeakerTone(block.speaker)}`}>
        {renderInline(block.text)}
      </p>
    )
  }
  if (block.kind === 'indent') {
    return (
      <p className={`pl-10 text-[16px] leading-[1.5] tracking-[0.01em] ${walkthroughSpeakerTone(block.speaker)}`} style={indentStyle}>
        {renderInline(block.text)}
      </p>
    )
  }
  if (block.kind === 'bullet') {
    return (
      <div className={`flex gap-3 ${walkthroughSpeakerTone(block.speaker)}`} style={bulletStyle}>
        <span className="min-w-[1.2rem] text-[16px] leading-[1.5]">{block.marker}</span>
        <p className="text-[16px] leading-[1.5]">
          {renderInline(block.text)}
        </p>
      </div>
    )
  }
  return (
    <p className={`text-[16px] leading-[1.5] ${walkthroughSpeakerTone(block.speaker)}`} style={indentStyle}>
      {renderInline(block.text)}
    </p>
  )
}

function walkthroughSpacingClass(block: WalkthroughBlock, previous?: WalkthroughBlock) {
  if (!previous) return ''

  if (block.kind === 'vis-inline' || previous.kind === 'vis-inline') return 'mt-[18px]'
  if (block.kind === 'heading') return 'mt-6'
  if (previous.kind === 'heading') return block.kind === 'equation' ? 'mt-3.5' : 'mt-3'

  if (block.kind === 'indent' && (previous.kind === 'equation' || previous.kind === 'indent')) return 'mt-1.5'
  if (block.kind === 'indent') return 'mt-3'
  if (previous.kind === 'indent') return 'mt-4'
  if (block.kind === 'equation' || previous.kind === 'equation') return 'mt-4'

  if (block.kind === 'bullet') return previous.kind === 'bullet' ? 'mt-2' : 'mt-3'
  if (previous.kind === 'bullet') return 'mt-3.5'

  if (block.kind === 'line' && previous.kind === 'line') {
    return block.speaker !== previous.speaker ? 'mt-[18px]' : 'mt-2.5'
  }

  return 'mt-3'
}

/* ═══════════════════════════════════════════════════════════
   Vertical (left-to-right) Layout — for deep/wide trees
   ═══════════════════════════════════════════════════════════ */

/** Use vertical layout when either:
 *  1. Any depth row has threshold+ total nodes in the full tree, OR
 *  2. Any parent has siblings where at least one sibling is expanded (has
 *     visible children) AND at least one other sibling can also be expanded
 *     (has children but is currently collapsed). This mixed active/inactive
 *     drill-down state causes overlap in horizontal layout.
 */

function shouldUseVerticalLayout(mode: 'preview' | 'interviewer' = 'preview'): boolean {
  const threshold = 9

  // Build the DEFAULT-VISIBLE set: green path expanded, inactive subtrees collapsed
  const defaultPath = Array.from(focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID))
  const defaultExpanded = new Set(
    Array.from(DEFAULT_EXPANDED).filter(id => defaultPath.includes(id))
  )
  const visible = new Set<string>()
  collectVisible(ROOT_ID, defaultExpanded, visible)

  // Check 1: any depth row among the VISIBLE nodes hits threshold+
  const byDepth: Record<number, number> = {}
  Array.from(visible).forEach(id => {
    const d = pathTo(id).length - 1
    byDepth[d] = (byDepth[d] ?? 0) + 1
  })
  return Object.values(byDepth).some(count => count >= threshold)
}

const V_GAP_V = 16     // vertical gap between leaf rows
const H_PAD_V = 16     // left/right padding inside canvas

/** Compute node dimensions that always fit within containerWidth — no scrolling.
 *  Font size is derived from nodeW so text always wraps within the box. */
function verticalNodeMetrics(maxDepth: number, containerWidth: number) {
  const cols = maxDepth + 1
  // Cap column width at 160px so nodes don't drift apart horizontally
  const colW = Math.min(160, Math.max(60, (containerWidth - H_PAD_V * 2) / cols))
  const nodeW = Math.min(148, Math.floor(colW * 0.88))
  const hStep = Math.floor(colW)
  const nodeH = cols <= 3 ? 40 : cols <= 5 ? 48 : cols <= 7 ? 54 : 60
  // Font is 13% of nodeW, hard floor at 12px so it's always readable
  const fontSize = Math.min(13.5, Math.max(12, Math.floor(nodeW * 0.13)))
  return { nodeW, nodeH, hStep, fontSize }
}

/** Estimate how many lines a label will wrap to inside nodeW px. */
function estimateLabelLines(label: string, nodeW: number, fontSize: number): number {
  // Work Sans medium: generous ratio to account for wide glyphs (M, W, S, m, w)
  // and browser wrapping earlier than strict math — err on the side of more lines
  const charW = fontSize * 0.68
  const innerW = nodeW - 16 // px-2 = 8px each side
  const charsPerLine = Math.max(1, Math.floor(innerW / charW))
  const words = label.split(/\s+/)
  let lines = 1, lineLen = 0
  for (const w of words) {
    const wLen = w.length
    if (lineLen === 0) { lineLen = wLen; continue }
    if (lineLen + 1 + wLen <= charsPerLine) { lineLen += 1 + wLen }
    else { lines++; lineLen = wLen }
  }
  return lines
}

/** Compute actual pixel height a node will render at. */
function estimateNodeH(label: string, nodeW: number, nodeH: number, fontSize: number): number {
  const lines = estimateLabelLines(label, nodeW, fontSize)
  const lineH = fontSize * 1.35   // line-height: 1.3 + small rounding buffer
  const textH = Math.ceil(lines * lineH)
  const padV  = 16                // py-2 = 8px top + 8px bottom
  return Math.max(nodeH, textH + padV)
}

function layoutVertical(
  visibleIds: string[],
  hStep: number,
  nodeW: number,
  nodeH: number,
  fontSize: number,
): {
  positions: Map<string, { x: number; y: number }>
  rowHeights: Map<number, number>   // cursor-row → actual height used
  totalHeight: number
  totalWidth: number
} {
  const vis = new Set(visibleIds)
  const positions = new Map<string, { x: number; y: number }>()
  // cursor → actual pixel height of that row (may exceed nodeH for long labels)
  const rowHeights = new Map<number, number>()
  // cursor → cumulative Y offset
  const rowY: number[] = []

  // First pass: place leaf rows and record which cursor slot each leaf occupies
  const leafRow = new Map<string, number>() // id → cursor slot
  let cursor = 0

  const placeLeaves = (id: string) => {
    if (!vis.has(id)) return
    const vc = (NODES[id]?.children ?? []).filter(c => vis.has(c))
    if (!vc.length) {
      leafRow.set(id, cursor)
      const actualH = estimateNodeH(NODES[id]?.label ?? '', nodeW, nodeH, fontSize)
      const prev = rowHeights.get(cursor) ?? 0
      rowHeights.set(cursor, Math.max(prev, actualH))
      cursor++
      return
    }
    vc.forEach(c => placeLeaves(c))
  }
  placeLeaves(ROOT_ID)

  // Build cumulative Y from row heights + gap
  let cumY = 0
  for (let r = 0; r < cursor; r++) {
    rowY[r] = cumY
    cumY += (rowHeights.get(r) ?? nodeH) + V_GAP_V
  }
  const totalHeight = cumY + 24

  // Second pass: assign positions using cumulative Y
  const place = (id: string, depth: number) => {
    if (!vis.has(id)) return
    const vc = (NODES[id]?.children ?? []).filter(c => vis.has(c))
    if (!vc.length) {
      const row = leafRow.get(id) ?? 0
      positions.set(id, { x: H_PAD_V + depth * hStep, y: rowY[row] })
      return
    }
    vc.forEach(c => place(c, depth + 1))
    const firstY = positions.get(vc[0])?.y ?? 0
    const lastY  = positions.get(vc[vc.length - 1])?.y ?? 0
    positions.set(id, { x: H_PAD_V + depth * hStep, y: (firstY + lastY) / 2 })
  }
  place(ROOT_ID, 0)

  const maxD = Math.max(...visibleIds.map(nodeDepth), 0)
  const totalWidth = H_PAD_V + (maxD + 1) * hStep + nodeW + H_PAD_V

  return { positions, rowHeights, totalHeight, totalWidth }
}

function VerticalChart({
  visibleIds, expandedIds, focusedId, onSelect, onToggle, revealDepth, edgeAnimKey, multiActive = false, tree,
}: {
  visibleIds: string[]
  expandedIds: Set<string>
  focusedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  revealDepth: number
  edgeAnimKey: number
  multiActive?: boolean
  tree?: FrameworkTree
}) {
  if (tree) loadTree(tree)
  const outerRef = useRef<HTMLDivElement>(null)
  const [cW, setCW] = useState(0)
  const [cWReady, setCWReady] = useState(false)
  const started = revealDepth >= 0
  const defaultPath = useMemo(() => Array.from(focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID)), [])

  // Measure container width — hide chart until first real measurement
  useEffect(() => {
    const el = outerRef.current; if (!el) return
    let fid = 0
    const measure = () => {
      if (fid) return
      fid = requestAnimationFrame(() => {
        fid = 0
        if (outerRef.current) { setCW(outerRef.current.clientWidth); setCWReady(true) }
      })
    }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    return () => { if (fid) cancelAnimationFrame(fid); ro.disconnect() }
  }, [])

  const maxD = useMemo(() => Math.max(...visibleIds.map(nodeDepth), 0), [visibleIds])

  const metrics = useMemo(() => verticalNodeMetrics(maxD, cW || 800), [cW, maxD])

  const { nodeW, nodeH, hStep, fontSize } = metrics

  const { positions, rowHeights, totalHeight, totalWidth } = useMemo(
    () => layoutVertical(visibleIds, hStep, nodeW, nodeH, fontSize),
    [visibleIds, hStep, nodeW, nodeH, fontSize]
  )

  // Centre the tree: totalWidth already includes H_PAD_V on both sides,
  // so subtract them to get the bare tree width for centering math
  const leftOffset = useMemo(() => {
    if (!cW) return 0
    const treeContentW = totalWidth - H_PAD_V * 2
    if (treeContentW >= cW) return 0
    return Math.floor((cW - treeContentW) / 2) - H_PAD_V
  }, [cW, totalWidth])

  const edges = useMemo(() => {
    const vs = new Set(visibleIds)
    return visibleIds.flatMap(pid =>
      (NODES[pid]?.children ?? []).filter(c => vs.has(c)).map(c => ({ pid, cid: c }))
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

  const TOP_PAD = 16

  return (
    <div
      ref={outerRef}
      className="relative w-full transition-all duration-700"
      style={{
        opacity: (started && cWReady) ? 1 : 0,
        transform: (started && cWReady) ? 'translateY(0)' : 'translateY(24px)',
        filter: (started && cWReady) ? 'blur(0)' : 'blur(8px)',
      }}
    >
      <div
        className="relative"
        style={{
          height: `${totalHeight + TOP_PAD * 2}px`,
          width: '100%',
        }}
      >
        {/* SVG connector lines — absolutely behind nodes */}
        <svg
          className="absolute inset-0 overflow-visible z-10 pointer-events-none"
          width="100%"
          height={totalHeight + TOP_PAD * 2}
          aria-hidden="true"
        >
          {edges.map(({ pid, cid }) => {
            const pp = positions.get(pid), cp = positions.get(cid)
            if (!pp || !cp) return null
            const childDepth = nodeDepth(cid)
            const edgeRevealed = childDepth <= revealDepth
            const stagger = (depthStagger.get(cid) ?? 0) * 30
            // Connector exits from right edge of parent, enters left edge of child
            // Use estimated actual height so connectors hit the visual centre of tall nodes
            const parentH = estimateNodeH(NODES[pid]?.label ?? '', nodeW, nodeH, fontSize)
            const childH  = estimateNodeH(NODES[cid]?.label ?? '', nodeW, nodeH, fontSize)
            const px = leftOffset + pp.x + nodeW
            const py = TOP_PAD + pp.y + parentH / 2
            const cx = leftOffset + cp.x
            const cy = TOP_PAD + cp.y + childH / 2
            const midX = px + (cx - px) / 2
            return (
              <path
                key={`${pid}-${cid}-${edgeAnimKey}`}
                d={`M ${px} ${py} H ${midX} V ${cy} H ${cx}`}
                fill="none"
                stroke="#5C4033"
                strokeWidth="2"
                strokeLinecap="round"
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

        {visibleIds.map(id => {
          const node = NODES[id], p = positions.get(id)
          if (!p || !node) return null
          const depth = nodeDepth(id)
          const isRevealed = depth <= revealDepth
          const stagger = (depthStagger.get(id) ?? 0) * 40
          const isExp = expandedIds.has(id)
          const isSelected = focusedId === id
          const isDefaultPath = defaultPath.includes(id)
          const hasChildren = (NODES[id]?.children.length ?? 0) > 0
          const isDrilledParent = expandedIds.has(id) && hasChildren
          const isActive = multiActive ? isDrilledParent : isDefaultPath
          const hasCh = node.children.length > 0

          const cls = isActive
            ? 'border-[#5C4033] bg-[#5C4033] text-[#f5f0ea] shadow-[0_8px_20px_-10px_rgba(92,64,51,0.30)]'
            : isSelected
              ? 'border-[#C4A882]/50 bg-[rgba(255,248,240,0.96)] text-[#4f4335] shadow-[0_0_0_1px_rgba(196,168,130,0.2)]'
              : 'border-[rgba(92,64,51,0.25)] bg-[#EAE2D5] text-[#3B2F2F] shadow-[0_2px_8px_rgba(59,47,47,0.04)]'

          return (
            <div
              key={id}
              className="absolute z-20 transition-all duration-500"
              style={{
                left: leftOffset + p.x,
                top: TOP_PAD + p.y,
                opacity: isRevealed ? 1 : 0,
                transitionDelay: `${stagger}ms`,
              }}
            >
              <div
                style={{
                  paddingTop: '0px',
                  animation: isRevealed
                    ? `cpm-node-in 420ms cubic-bezier(0.22,1,0.36,1) ${stagger}ms both`
                    : 'none',
                }}
                className="relative"
              >
                {/* Node button — full width, connector exits from right edge */}
                <button
                  type="button"
                  data-node-button
                    data-node-id={id}
                  onClick={() => onSelect(id)}
                  className={`flex items-center justify-center rounded-[4px] border px-2 py-2 text-center font-medium tracking-[0.01em] transition-all duration-300 hover:-translate-y-0.5 ${cls}`}
                  style={{
                    width: `${nodeW}px`,
                    minHeight: `${estimateNodeH(node.label, nodeW, nodeH, fontSize)}px`,
                    fontSize: `${fontSize}px`,
                    lineHeight: '1.3',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    overflow: 'hidden',
                  }}
                >
                  {node.label}
                </button>

                {/* Chevron: rightmost column → right of node;
                    other columns → below by default, but flip above if a sibling
                    node is close enough below to hide the chevron */}
                {hasCh && (() => {
                  let chevronStyle: React.CSSProperties
                  if (depth === maxD) {
                    chevronStyle = { top: '50%', left: `${nodeW + 6}px`, transform: 'translateY(-50%)' }
                  } else {
                    // Check if any visible node at the same depth sits just below this one
                    const siblingsBelow = visibleIds.filter(other => {
                      if (other === id) return false
                      const op = positions.get(other)
                      if (!op) return false
                      const otherDepth = nodeDepth(other)
                      // Same depth column, positioned below within danger zone
                      const thisH = estimateNodeH(node.label, nodeW, nodeH, fontSize)
                      return otherDepth === depth && op.y > p.y && op.y < p.y + thisH + V_GAP_V + 16
                    })
                    const thisNodeH = estimateNodeH(node.label, nodeW, nodeH, fontSize)
                    const hasNodeBelow = siblingsBelow.length > 0
                    chevronStyle = hasNodeBelow
                      ? { top: '-20px', left: '50%', transform: 'translateX(-50%)' }   // above — clear of node border
                      : { top: `${thisNodeH + 4}px`, left: '50%', transform: 'translateX(-50%)' } // below
                  }
                  return (
                  <button
                    type="button"
                    data-node-button
                    onClick={e => { e.stopPropagation(); if (!multiActive && !isDefaultPath && hasCh) { e.currentTarget.dispatchEvent(new CustomEvent('cpm-drill', { bubbles: true, detail: { id } })) } else { onToggle(id) } }}
                    className="absolute transition-all duration-300 hover:scale-110 z-30 opacity-70 hover:opacity-100"
                    data-node-id={id} data-cpm-drill={!multiActive && !isDefaultPath && hasCh ? 'true' : undefined} style={chevronStyle}
                    aria-label={`${isExp ? 'Collapse' : 'Expand'} ${node.label}`}
                  >
                    <ChevronChip expanded={isExp} />
                  </button>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Desktop Framework Chart
   ═══════════════════════════════════════════════════════════ */

function DesktopChart({
  visibleIds, expandedIds, focusedId, onSelect, onToggle, revealDepth, edgeAnimKey, multiActive = false, tree,
}: {
  visibleIds: string[]
  expandedIds: Set<string>
  focusedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  revealDepth: number
  edgeAnimKey: number
  multiActive?: boolean
  tree?: FrameworkTree
}) {
  if (tree) loadTree(tree)
  const outerRef = useRef<HTMLDivElement>(null)
  const [cW, setCW] = useState(980)
  const [cWReady, setCWReady] = useState(false)
  const started = revealDepth >= 0
  const defaultPath = useMemo(() => Array.from(focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID)), [])
  const maxD = useMemo(() => Math.max(...visibleIds.map(nodeDepth), 0), [visibleIds])

  // Fixed vStep matched to original 6-level tree: (520-42-36)/6 ≈ 74px
  const FIXED_V_STEP = 74
  const extraHeightForTallNodes = useMemo(() => {
  const LINE_H = 38
  let maxExtraLines = 0
  visibleIds.forEach(id => {
    const lines = estNodeLines(id)
    if (lines > 2) maxExtraLines = Math.max(maxExtraLines, lines - 2)
  })
  return maxExtraLines * LINE_H * maxD
}, [visibleIds, maxD])

  const metrics = useMemo(() => {
    const e = extraHeightForTallNodes
     if (maxD <= 0) return { h: 160, tp: 80, bp: 20 }
  if (maxD <= 1) return { h: 220 + e, tp: 56, bp: 28 }
  if (maxD <= 2) return { h: 300 + e, tp: 50, bp: 34 }
  if (maxD <= 4) return { h: 420 + e, tp: 46, bp: 38 }
  if (maxD <= 6) return { h: 520 + e, tp: 42, bp: 36 }
  return { h: 42 + FIXED_V_STEP * maxD + 36 + e, tp: 42, bp: 36 }
}, [maxD, extraHeightForTallNodes])

  useEffect(() => {
    const el = outerRef.current; if (!el) return
    let fid = 0
    const m = () => { if (fid) return; fid = requestAnimationFrame(() => { fid = 0; if (outerRef.current) { setCW(Math.max(outerRef.current.clientWidth - 6, 400)); setCWReady(true) } }) }
    m()
    const ro = new ResizeObserver(m); ro.observe(el)
    return () => { if (fid) cancelAnimationFrame(fid); ro.disconnect() }
  }, [])

  const layout = useMemo(() => layoutDesktop(visibleIds, cW, metrics.h, metrics.tp, metrics.bp), [visibleIds, cW, metrics])
  const { positions, nodeWidths } = layout

  // Detect if any node overflows the right edge and compute a corrective scale
  const chartScale = useMemo(() => {
    let maxRight = 0
    visibleIds.forEach(id => {
      const p = positions.get(id)
      const nw = nodeWidths.get(id) ?? estNodeW(id)
      const hasCh = NODES[id]?.children.length > 0
      // Right edge = centre x + half node width + chevron if has children
      const rightEdge = (p?.x ?? 0) + nw / 2 + (hasCh ? 20 : 0)
      maxRight = Math.max(maxRight, rightEdge)
    })
    const margin = 24 // extra breathing room from container edge
    if (maxRight + margin <= cW) return 1
    return Math.max(0.7, (cW - margin) / maxRight)
  }, [positions, nodeWidths, visibleIds, cW])

  const labelFs = 12.25
  const labelMinH = 54

  const edgeRenderData = useMemo(() => {
    const LMH = 54
    const halfH = (id: string) => Math.round(LMH / 2 + Math.max(0, estNodeLines(id) - 2) * 9)
    const vs = new Set(visibleIds)
    const raw = visibleIds.flatMap(pid =>
      (NODES[pid]?.children ?? []).filter(c => vs.has(c)).map(cid => ({ pid, cid }))
    )
    // Pass 1: per-parent busY using the tallest child's top so all siblings share one elbow level
    const acc = new Map<string, { sY: number; minEY: number }>()
    raw.forEach(({ pid, cid }) => {
      const pp = positions.get(pid), cp = positions.get(cid)
      if (!pp || !cp) return
      const sY = pp.y + halfH(pid), eY = cp.y - halfH(cid)
      const cur = acc.get(pid)
      acc.set(pid, cur ? { sY: cur.sY, minEY: Math.min(cur.minEY, eY) } : { sY, minEY: eY })
    })
    const busY = new Map<string, number>()
    acc.forEach(({ sY, minEY }, pid) => busY.set(pid, Math.round(sY + (minEY - sY) / 2)))
    // Pass 2: build render data with consistent mY per parent
    return raw.map(({ pid, cid }) => {
      const pp = positions.get(pid), cp = positions.get(cid)
      if (!pp || !cp) return null
      const sY = pp.y + halfH(pid), eY = cp.y - halfH(cid)
      const mY = busY.get(pid) ?? Math.round(sY + (eY - sY) / 2)
      return { pid, cid, px: pp.x, cx: cp.x, sY, eY, mY }
    })
  }, [visibleIds, positions])

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
      style={{ opacity: (started && cWReady) ? 1 : 0, transform: (started && cWReady) ? 'translateY(0)' : 'translateY(24px)', filter: (started && cWReady) ? 'blur(0)' : 'blur(8px)' }}>
      <div className="relative overflow-visible pb-4 pl-4 pr-2 pt-4" style={{ minHeight: `${metrics.h}px`, transform: chartScale < 1 ? `scale(${chartScale})` : undefined, transformOrigin: 'top center' }}>

        <svg className="absolute inset-0 h-full w-full overflow-visible z-10" viewBox={`0 0 ${cW} ${metrics.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {(() => {
            // Group edges by parent → one <path> per parent (trunk + bus + stubs in single element)
            const byParent = new Map<string, NonNullable<typeof edgeRenderData[0]>[]>()
            edgeRenderData.forEach(e => {
              if (!e) return
              const arr = byParent.get(e.pid) ?? []
              arr.push(e)
              byParent.set(e.pid, arr)
            })
            const elems: React.ReactNode[] = []
            byParent.forEach((valid, pid) => {
              if (!valid.length) return
              const { px, sY, mY } = valid[0]
              const childDepth = nodeDepth(valid[0].cid)
              const edgeRevealed = childDepth <= revealDepth
              const stagger = (depthStagger.get(valid[0].cid) ?? 0) * 40
              const rpx = Math.round(px)
              const rsY = Math.round(sY)
              const rmY = Math.round(mY)
              const xs = valid.map(e => Math.round(e.cx))
              const busX1 = Math.min(...xs, rpx)
              const busX2 = Math.max(...xs, rpx)
              // Single path: trunk + horizontal bus + per-child stubs — no inter-element gaps
              const d = [
                `M ${rpx} ${rsY} V ${rmY}`,
                `M ${busX1} ${rmY} H ${busX2}`,
                ...valid.map(e => `M ${Math.round(e.cx)} ${rmY} V ${Math.round(e.eY)}`),
              ].join(' ')
              elems.push(
                <path
                  key={`${pid}-${edgeAnimKey}`}
                  d={d}
                  fill="none"
                  stroke="#8B6B5A"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    opacity: edgeRevealed ? 1 : 0,
                    transition: `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${stagger}ms`,
                  }}
                />
              )
            })
            return elems
          })()}
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
          const hasChildren = (NODES[id]?.children.length ?? 0) > 0
          const isDrilledParent = expandedIds.has(id) && hasChildren
          const isActive = multiActive ? isDrilledParent : isDefaultPath
          const hasCh = node.children.length > 0
          const nw = nodeWidths.get(id) ?? estNodeW(id)
          const lw = hasCh ? nw - 18 : nw
          const cls = isActive
  ? 'border-[#5C4033] bg-[#5C4033] text-[#f5f0ea] shadow-[0_16px_30px_-26px_rgba(92,64,51,0.30)]'
  : isSelected
    ? 'border-[#C4A882]/50 bg-[rgba(255,248,240,0.96)] text-[#4f4335] shadow-[0_0_0_1px_rgba(196,168,130,0.2),0_0_20px_-10px_rgba(196,168,130,0.18)]'
    : 'border-[rgba(92,64,51,0.25)] bg-[#EAE2D5] text-[#3B2F2F] shadow-[0_4px_14px_rgba(59,47,47,0.035)]'
          return (
            <div key={id} className="absolute z-20 flex items-center gap-2 transition-all duration-500"
              style={{ left: p.x, top: p.y, transform: 'translate(-50%,-50%)', opacity: isRevealed ? 1 : 0, transitionDelay: `${stagger}ms` }}>
              <div className="relative inline-flex items-center"
                style={{ animation: isRevealed ? `cpm-node-in 420ms cubic-bezier(0.22,1,0.36,1) ${stagger}ms both` : 'none' }}>
                <button type="button" data-node-button  data-node-id={id} onClick={() => onSelect(id)}
  className={`flex items-center justify-center rounded-[4px] border px-4 py-3 text-center font-medium tracking-[0.01em] transition-all duration-300 hover:-translate-y-0.5 ${cls}`}
  style={{ width: `${lw}px`, minHeight: `${labelMinH}px`, fontSize: `${labelFs}px`, lineHeight: '1.18', whiteSpace: 'normal' }}>
  {node.label}
</button>
                {hasCh && (
                  <button type="button" data-node-button data-node-id={id} data-cpm-drill={!multiActive && !isDefaultPath && hasCh ? 'true' : undefined} onClick={e => { e.stopPropagation(); if (!multiActive && !isDefaultPath && hasCh) { e.currentTarget.dispatchEvent(new CustomEvent('cpm-drill', { bubbles: true, detail: { id } })) } else { onToggle(id) } }} className="absolute left-full ml-1.5 transition-all duration-300 hover:scale-105"
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
   Inactive-node drill-down — hover/tap glass overlay
   Renders the FULL static subtree of an off-path ("inactive")
   node in a floating glass panel. No in-chart expansion, so the
   main flowchart never reflows, shifts, or collides.
   Binds externally via [data-node-button] index → visibleIds,
   so the chart components need ZERO JSX changes.
   ═══════════════════════════════════════════════════════════ */

   /* ═══════════════════════════════════════════════════════════
   Inactive-node drill-down — hover/tap glass overlay
   Renders the hovered inactive node's FULL subtree as a static
   top-to-bottom mini-flowchart (DesktopChart styling) inside a
   floating glass panel. Auto-scales to fit — never scrolls.
   Binds by data-node-id, so it triggers ONLY on the hovered node.
   ═══════════════════════════════════════════════════════════ */


/** Static top-to-bottom layout for an inactive node's full subtree.
 *  Mirrors the main DesktopChart node sizing (estNodeW / estimateNodeH). */
/** Static subtree layout, orientation-aware.
 *  'TB' = top-to-bottom (like the main chart); 'LR' = left-to-right (narrower/taller).
 *  Node sizing mirrors the main DesktopChart (estNodeW / estimateNodeH). */
/** Static subtree layout, orientation-aware (TB = top-to-bottom like the main chart, LR = left-to-right). */
function buildSubtreeLayout(rootId: string, orient: 'TB' | 'LR' = 'TB') {
  const FS = 12.25
  const BASE_H = 54
  const PAD = 16
  const GAP_MAIN = orient === 'TB' ? 30 : 34
  const GAP_CROSS = orient === 'TB' ? 18 : 16

  const widthOf = (id: string) => Math.max(96, estNodeW(id))
  const heightOf = (id: string) => estimateNodeH(NODES[id]?.label ?? '', widthOf(id), BASE_H, FS)

  const depth = new Map<string, number>()
  const walk = (id: string, d: number) => { depth.set(id, d); (NODES[id]?.children ?? []).forEach(c => walk(c, d + 1)) }
  walk(rootId, 0)
  const maxDepth = Math.max(0, ...Array.from(depth.values()))
  const pos = new Map<string, { cx: number; cy: number }>()

  if (orient === 'TB') {
    const rowMaxH: number[] = []
    depth.forEach((d, id) => { rowMaxH[d] = Math.max(rowMaxH[d] ?? 0, heightOf(id)) })
    const rowCY: number[] = []
    let acc = PAD
    for (let d = 0; d <= maxDepth; d++) { rowCY[d] = acc + (rowMaxH[d] ?? BASE_H) / 2; acc += (rowMaxH[d] ?? BASE_H) + GAP_MAIN }
    const totalH = acc - GAP_MAIN + PAD
    const sub = new Map<string, number>()
    const measure = (id: string): number => {
      const kids = NODES[id]?.children ?? []
      const own = widthOf(id)
      if (!kids.length) { sub.set(id, own); return own }
      const cw = kids.reduce((s, c, i) => s + measure(c) + (i > 0 ? GAP_CROSS : 0), 0)
      const tw = Math.max(own, cw); sub.set(id, tw); return tw
    }
    measure(rootId)
    const assign = (id: string, sx: number, ex: number) => {
      const cy = rowCY[depth.get(id) ?? 0]
      const kids = NODES[id]?.children ?? []
      if (!kids.length) { pos.set(id, { cx: (sx + ex) / 2, cy }); return }
      const cw = kids.reduce((s, c, i) => s + (sub.get(c) ?? widthOf(c)) + (i > 0 ? GAP_CROSS : 0), 0)
      const tw = Math.max(ex - sx, cw)
      let cur = sx + (tw - cw) / 2
      kids.forEach(c => { const w = sub.get(c) ?? widthOf(c); assign(c, cur, cur + w); cur += w + GAP_CROSS })
      const cxs = kids.map(c => pos.get(c)?.cx).filter((v): v is number => typeof v === 'number')
      pos.set(id, { cx: cxs.length ? cxs.reduce((a, b) => a + b, 0) / cxs.length : (sx + ex) / 2, cy })
    }
    assign(rootId, PAD, PAD + (sub.get(rootId) ?? widthOf(rootId)))
    let minX = Infinity, maxX = -Infinity
    pos.forEach((p, id) => { const w = widthOf(id); minX = Math.min(minX, p.cx - w / 2); maxX = Math.max(maxX, p.cx + w / 2) })
    const dx = PAD - minX
    pos.forEach(p => { p.cx += dx })
    return { pos, widthOf, heightOf, depth, w: (maxX - minX) + PAD * 2, h: totalH, fs: FS, orient }
  }

  const colMaxW: number[] = []
  depth.forEach((d, id) => { colMaxW[d] = Math.max(colMaxW[d] ?? 0, widthOf(id)) })
  const colCX: number[] = []
  let accx = PAD
  for (let d = 0; d <= maxDepth; d++) { colCX[d] = accx + (colMaxW[d] ?? 96) / 2; accx += (colMaxW[d] ?? 96) + GAP_MAIN }
  const totalW = accx - GAP_MAIN + PAD
  const sub = new Map<string, number>()
  const measure = (id: string): number => {
    const kids = NODES[id]?.children ?? []
    const own = heightOf(id)
    if (!kids.length) { sub.set(id, own); return own }
    const ch = kids.reduce((s, c, i) => s + measure(c) + (i > 0 ? GAP_CROSS : 0), 0)
    const th = Math.max(own, ch); sub.set(id, th); return th
  }
  measure(rootId)
  const assign = (id: string, sy: number, ey: number) => {
    const cx = colCX[depth.get(id) ?? 0]
    const kids = NODES[id]?.children ?? []
    if (!kids.length) { pos.set(id, { cx, cy: (sy + ey) / 2 }); return }
    const ch = kids.reduce((s, c, i) => s + (sub.get(c) ?? heightOf(c)) + (i > 0 ? GAP_CROSS : 0), 0)
    const th = Math.max(ey - sy, ch)
    let cur = sy + (th - ch) / 2
    kids.forEach(c => { const h = sub.get(c) ?? heightOf(c); assign(c, cur, cur + h); cur += h + GAP_CROSS })
    const cys = kids.map(c => pos.get(c)?.cy).filter((v): v is number => typeof v === 'number')
    pos.set(id, { cx, cy: cys.length ? cys.reduce((a, b) => a + b, 0) / cys.length : (sy + ey) / 2 })
  }
  assign(rootId, PAD, PAD + (sub.get(rootId) ?? heightOf(rootId)))
  let minY = Infinity, maxY = -Infinity
  pos.forEach((p, id) => { const h = heightOf(id); minY = Math.min(minY, p.cy - h / 2); maxY = Math.max(maxY, p.cy + h / 2) })
  const dy = PAD - minY
  pos.forEach(p => { p.cy += dy })
  return { pos, widthOf, heightOf, depth, w: totalW, h: (maxY - minY) + PAD * 2, fs: FS, orient }
}

function InactiveDrilldownOverlay({
  hostRef, visibleIds, mode = 'preview', tree,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>
  visibleIds?: string[]
  mode?: 'preview' | 'interviewer'
  tree?: FrameworkTree
}) {
  const localNodes = tree?.nodes ?? NODES
  const defaultPath = useMemo(
    () => tree
      ? Array.from(focusPathSetForNodes(tree.nodes, tree.defaultFocusedIds ?? [], tree.defaultFocusedId))
      : Array.from(focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID)),
    [tree]
  )
  const [active, setActive] = useState<{
    id: string
    rect: { top: number; left: number; right: number; bottom: number; width: number; height: number }
  } | null>(null)
  const pinnedRef = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverEl = useRef<Element | null>(null)
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null } }
  const cancelHover = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    if (hoverEl.current) { hoverEl.current.classList.remove('cpm-drill-hover'); hoverEl.current = null }
  }
  const scheduleClose = () => { if (pinnedRef.current) return; cancelClose(); closeTimer.current = setTimeout(() => setActive(null), 160) }
  const closeNow = () => { pinnedRef.current = false; cancelClose(); setActive(null) }
  const isDrillable = (id: string | null | undefined): id is string =>
    !!id && !!localNodes[id] && !defaultPath.includes(id) && (localNodes[id].children?.length ?? 0) > 0
  const openEl = (el: Element, pin: boolean) => {
  const id = el.getAttribute('data-node-id')
  if (!isDrillable(id)) return
  // First deep dive of the session retires the discovery dots everywhere.
  try {
    if (!sessionStorage.getItem('cpm-drill-seen')) {
      sessionStorage.setItem('cpm-drill-seen', '1')
      document.documentElement.classList.add('cpm-drill-seen')
    }
  } catch {}
  cancelClose()
    const r = el.getBoundingClientRect()
    pinnedRef.current = pin
    if (tree) loadTree(tree) // re-assert this panel's tree so OverlaySubtree reads the right nodes
    setActive({ id, rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height } })
  }
  useEffect(() => {
  try {
    if (sessionStorage.getItem('cpm-drill-seen')) document.documentElement.classList.add('cpm-drill-seen')
  } catch {}
}, [])
  useEffect(() => {
    const styleId = 'cpm-drill-discovery-css'
    if (document.getElementById(styleId)) return
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      [data-node-id].cpm-drill-hover {
        box-shadow: 0 0 0 2.5px rgba(131,104,77,0.55), 0 0 14px rgba(131,104,77,0.2) !important;
        transition: box-shadow 100ms ease;
      }
    `
    document.head.appendChild(style)
  }, [])
useEffect(() => {
  const host = hostRef.current
  if (!host) return
  const onOver = (e: Event) => {
      const t = (e.target as HTMLElement)?.closest('[data-node-id]')
      if (t && isDrillable(t.getAttribute('data-node-id'))) {
        if (hoverEl.current !== t) {
          cancelHover()
          hoverEl.current = t
          t.classList.add('cpm-drill-hover')
          hoverTimer.current = setTimeout(() => { cancelHover(); openEl(t, false) }, 800)
        }
      }
    }
    const onOut = (e: Event) => {
      const to = (e as MouseEvent).relatedTarget as HTMLElement | null
      if (to && (to.closest('[data-cpm-overlay]') || to.closest('[data-node-id]'))) return
      cancelHover()
      scheduleClose()
    }
    const onDrill = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined
      if (!id || !isDrillable(id)) return
      const sel = (window.CSS && CSS.escape) ? CSS.escape(id) : id
      const el = host.querySelector(`[data-node-id="${sel}"]`)
      if (el) openEl(el, true)
    }
    const onDocClick = (e: Event) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-cpm-overlay]') || t.closest('[data-cpm-drill="true"]')) return
      closeNow()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNow() }
    host.addEventListener('mouseover', onOver)
    host.addEventListener('mouseout', onOut)
    host.addEventListener('cpm-drill', onDrill as EventListener)
    document.addEventListener('click', onDocClick)
    window.addEventListener('keydown', onKey)
    return () => {
      host.removeEventListener('mouseover', onOver)
      host.removeEventListener('mouseout', onOut)
      host.removeEventListener('cpm-drill', onDrill as EventListener)
      document.removeEventListener('click', onDocClick)
      window.removeEventListener('keydown', onKey)
      cancelHover()
    }
  }, [hostRef, defaultPath])
  useEffect(() => {
    if (!active) return
    const close = () => closeNow()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [active])
  if (typeof document === 'undefined' || !active) return null

const vw = window.innerWidth
const vh = window.innerHeight
const MARGIN = 24
const PANEL_PAD = 18
const reservedRight = mode === 'interviewer' ? 360 : 0
// Reserve the fixed top navbar's height so the panel (and its top border) is never
// clipped behind it. Measured from the page header, with a safe fallback.
const navEl = typeof document !== 'undefined' ? document.querySelector('header') : null
const navH = navEl ? Math.min(200, Math.round(navEl.getBoundingClientRect().bottom)) : 80
const TOP_SAFE = navH + 14
// Centre the panel within the safe band *below* the navbar and size it to fit fully —
// never clipped, never touching edges, never needing a scroll.
const availW = Math.max(280, (vw - reservedRight) - MARGIN * 2 - PANEL_PAD * 2)
const availH = Math.max(220, (vh - TOP_SAFE - MARGIN) - PANEL_PAD * 2)
  // Pick whichever orientation zooms in more (TB matches the main chart; LR wins for deep/narrow trees).
  const tb = buildSubtreeLayout(active.id, 'TB')
  const lr = buildSubtreeLayout(active.id, 'LR')
  const fit = (l: { w: number; h: number }) => Math.min(1, availW / l.w, availH / l.h)
  const tbS = fit(tb), lrS = fit(lr)
  const useLR = lrS > tbS * 1.05
  const L = useLR ? lr : tb
  const scale = useLR ? lrS : tbS
  const panelW = L.w * scale + PANEL_PAD * 2
  const panelH = L.h * scale + PANEL_PAD * 2
 // Centre horizontally; centre vertically *within the band below the navbar*.
const left = Math.round(Math.max(MARGIN, (vw - reservedRight - panelW) / 2))
const bandH = vh - TOP_SAFE - MARGIN
const top = Math.round(TOP_SAFE + Math.max(0, (bandH - panelH) / 2))

  return createPortal(
    <div data-cpm-overlay onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      {/* Full-window dim + blur scrim. Purely visual (pointer-events off) so the
          existing hover / click-away logic keeps working untouched. */}
      <div
        className="cpm-sub-backdrop"
        style=
          {{

            position: 'fixed', inset: 0, zIndex: 70, pointerEvents: 'none',
background: 'rgba(52,44,34,0.16)',
backdropFilter: 'blur(10px) saturate(115%)', WebkitBackdropFilter: 'blur(10px) saturate(115%)',

          }}
        
      />
      {/* Glass panel — centred, fully on screen, clean and minimal. */}
      <div
        className="cpm-sub-pop"
        style=
          {{position: 'fixed', left, top, width: panelW, height: panelH, zIndex: 80,
padding: PANEL_PAD, borderRadius: 22, overflow: 'hidden',
border: '1px solid rgba(255,255,255,0.5)',
background: 'linear-gradient(135deg, rgba(249,244,236,0.55), rgba(246,240,231,0.44))',
backdropFilter: 'blur(30px) saturate(118%) brightness(1.05)', WebkitBackdropFilter: 'blur(30px) saturate(118%) brightness(1.05)',
boxShadow: '0 30px 80px -30px rgba(46,38,32,0.26), 0 0 60px rgba(196,168,130,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',}}
        
      >
        <div
  style=
    {{    position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', zIndex: 2,
    fontSize: 9, fontWeight: 600, letterSpacing: '0.3em',
    textTransform: 'uppercase', color: 'rgba(61,90,53,0.5)',
    pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',}}
  
>
  Deep Dive
</div>
<OverlaySubtree id={active.id} orient={L.orient} scale={scale} />
        <style>{`
          @keyframes cpm-sub-backdrop { from { opacity: 0; } to { opacity: 1; } }
          @keyframes cpm-sub-pop  { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
          @keyframes cpm-sub-node { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes cpm-sub-draw { to { stroke-dashoffset: 0; } }
          .cpm-sub-backdrop { animation: cpm-sub-backdrop 220ms ease-out both; }
          .cpm-sub-pop  { animation: cpm-sub-pop 240ms cubic-bezier(0.22,1,0.36,1) both; }
          .cpm-sub-node { animation: cpm-sub-node 360ms cubic-bezier(0.22,1,0.36,1) both; }
          .cpm-sub-edge { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cpm-sub-draw 460ms ease-out both; }
          @media (prefers-reduced-motion: reduce) {
            .cpm-sub-backdrop, .cpm-sub-pop, .cpm-sub-node { animation: none !important; }
            .cpm-sub-edge { stroke-dashoffset: 0 !important; animation: none !important; }
          }
        `}</style>
      </div>
    </div>,
    document.body
  )
}

/** Static subtree, rendered like the main chart — cream nodes + clean per-parent
 *  bus connectors (no overlapping strokes), with a draw-on + cascade load animation. */
function OverlaySubtree({
  id, orient = 'TB', scale = 1,
}: { id: string; orient?: 'TB' | 'LR'; scale?: number; depth?: number; idxRef?: { n: number } }) {
  const L = useMemo(() => buildSubtreeLayout(id, orient), [id, orient])
  const ids = Array.from(L.pos.keys())
  const parents = ids.filter(pid => (NODES[pid]?.children ?? []).some(c => L.pos.has(c)))
  const idxByDepth = new Map<number, number>()

  return (
    <div style={{ position: 'relative', width: L.w, height: L.h, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
      <svg width={L.w} height={L.h} style= {{position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {parents.map(pid => {
          const pp = L.pos.get(pid)!
          const kids = (NODES[pid]?.children ?? []).filter(c => L.pos.has(c))
          let d = ''
          if (L.orient === 'TB') {
            const pB = pp.cy + L.heightOf(pid) / 2
            const tops = kids.map(c => { const cp = L.pos.get(c)!; return { cx: cp.cx, top: cp.cy - L.heightOf(c) / 2 } })
            const busY = pB + (Math.min(...tops.map(t => t.top)) - pB) / 2
            const xs = [pp.cx, ...tops.map(t => t.cx)]
            d += `M ${pp.cx} ${pB} L ${pp.cx} ${busY} `
            d += `M ${Math.min(...xs)} ${busY} L ${Math.max(...xs)} ${busY} `
            tops.forEach(t => { d += `M ${t.cx} ${busY} L ${t.cx} ${t.top} ` })
          } else {
            const pR = pp.cx + L.widthOf(pid) / 2
            const lefts = kids.map(c => { const cp = L.pos.get(c)!; return { cy: cp.cy, left: cp.cx - L.widthOf(c) / 2 } })
            const busX = pR + (Math.min(...lefts.map(l => l.left)) - pR) / 2
            const ys = [pp.cy, ...lefts.map(l => l.cy)]
            d += `M ${pR} ${pp.cy} L ${busX} ${pp.cy} `
            d += `M ${busX} ${Math.min(...ys)} L ${busX} ${Math.max(...ys)} `
            lefts.forEach(l => { d += `M ${busX} ${l.cy} L ${l.left} ${l.cy} ` })
          }
          const delay = (L.depth.get(pid) ?? 0) * 90 + 40
          return (
            <path key={pid} d={d} fill="none" stroke="#8B6B5A" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" pathLength={1}
              className="cpm-sub-edge" style={{ animationDelay: `${delay}ms` }} />
          )
        })}
      </svg>

      {ids.map(nid => {
        const p = L.pos.get(nid)!
        const w = L.widthOf(nid), h = L.heightOf(nid)
        const dd = L.depth.get(nid) ?? 0
        const k = idxByDepth.get(dd) ?? 0
        idxByDepth.set(dd, k + 1)
        const delay = dd * 90 + 90 + k * 24
        return (
          <div key={nid} className="cpm-sub-node"
            style={{ position: 'absolute', left: p.cx - w / 2, top: p.cy - h / 2, width: w, animationDelay: `${delay}ms` }}>
            <div
              className="flex items-center justify-center rounded-[4px] border px-4 py-3 text-center font-medium tracking-[0.01em] border-[rgba(92,64,51,0.08)] bg-[rgba(255,248,240,1)] text-[#5C4033] shadow-[0_2px_8px_rgba(59,47,47,0.04)]"
              style={{ width: `${w}px`, minHeight: `${h}px`, fontSize: `${L.fs}px`, lineHeight: '1.3', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              {NODES[nid]?.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
/* ═══════════════════════════════════════════════════════════
   Mobile/touch variant — tap an inactive node to open the same
   static glass subtree panel. Binds globally via data-mnode-id,
   so no host ref / index mapping is needed.
   ═══════════════════════════════════════════════════════════ */
function MobileDrilldownOverlay() {
  const defaultPath = useMemo(() => Array.from(focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID)), [])
  const [active, setActive] = useState<{
    id: string
    rect: { top: number; left: number; right: number; bottom: number; width: number; height: number }
  } | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-cpm-overlay]')) return // tap inside panel → keep open
      const btn = t.closest<HTMLElement>('[data-mnode-id]')
      if (!btn) { setActive(null); return }
      const id = btn.getAttribute('data-mnode-id') || ''
      const node = NODES[id]
      if (!node || defaultPath.includes(id) || node.children.length === 0) { setActive(null); return }
      const r = btn.getBoundingClientRect()
      setActive(prev => (prev?.id === id ? null : {
        id, rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
      }))
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [defaultPath])

  useEffect(() => {
    if (!active) return
    const close = () => setActive(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [active])

  if (typeof document === 'undefined' || !active) return null

  const MARGIN = 12
  const vw = window.innerWidth
  const vh = window.innerHeight
  const r = active.rect
  const PANEL_W = Math.min(320, vw - MARGIN * 2)
  const layout = buildSubtreeLayout(active.id)
  const scale = Math.min(1, Math.max(0.5, (PANEL_W - 28) / layout.w))
  const left = Math.min(Math.max(MARGIN, r.left), vw - MARGIN - PANEL_W)
  const placeAbove = (r.bottom + 180 > vh) && (r.top > vh - r.bottom)
  const top = placeAbove ? Math.max(MARGIN, r.top - MARGIN - 220) : r.bottom + MARGIN
  const maxHeight = placeAbove ? r.top - MARGIN * 2 : Math.max(140, vh - top - MARGIN)

  return createPortal(
    <div
      data-cpm-overlay
      className="cpm-overlay-pop"
      style={{
        position: 'fixed', top: `${top}px`, left: `${left}px`,
        width: `${PANEL_W}px`, maxHeight: `${maxHeight}px`, overflow: 'auto',
        zIndex: 80, padding: '14px 14px 16px', borderRadius: '14px',
        background: 'rgba(255,248,240,0.78)',
        backdropFilter: 'blur(22px) saturate(1.6)', WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
        border: '1px solid rgba(61,90,53,0.18)',
        boxShadow: '0 24px 60px -20px rgba(59,47,47,0.35), 0 1px 0 rgba(255,255,255,0.7) inset',
      }}
    >
      <div style=
        {{fontFamily: "'Work Sans', sans-serif", fontSize: '9.5px', fontWeight: 600,
        letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(92,64,51,0.55)', marginBottom: '10px',}}
      >
        Drill-down preview
      </div>
      <OverlaySubtree id={active.id} scale={scale} />
    </div>,
    document.body,
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
        isFoc ? 'border-[#5C4033]/15 bg-[rgba(255,248,240,0.88)] shadow-[0_4px_12px_rgba(59,47,47,0.04)]'
              : 'border-[#5C4033]/10 bg-[rgba(255,248,240,0.8)]'
      }`}>
        <div className="flex items-center gap-3">
          <button data-node-button type="button" onClick={() => onSelect(nodeId)}
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
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]">{text}</span>
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
              { href: '/about-ccx', label: 'The Platform' },
              { href: '/our-story', label: 'The Team' },
              { href: '/collaborators', label: 'Acknowledgements' },
            ].map(({ href, label }) => (
              <Link key={href} href={href} style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
                {label}
              </Link>
            ))}
            <a href="mailto:saksham@casecompendiumx.in?subject=Compendium%20X%20Privacy%20Request" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
              Contact Us
            </a>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(213,196,177,0.12)', paddingTop: '12px' }} className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <a href="https://www.linkedin.com/company/casecompendiumx" target="_blank" rel="noreferrer" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="LinkedIn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" /></svg>
            </a>
            <a href="mailto:saksham@casecompendiumx.in" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="Email Us">
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
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: hovered ? 'rgba(61,90,53,0.95)' : 'rgba(61,90,53,0.18)',
          border: '1px solid rgba(61,90,53,0.30)',
          boxShadow: hovered ? '0 8px 22px -6px rgba(61,90,53,0.45)' : '0 2px 10px -4px rgba(61,90,53,0.18)',
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
              border: '1px solid rgba(61,90,53,0.35)',
              animation: 'cpm-fab-ping 2.8s cubic-bezier(0.215,0.61,0.355,1) infinite',
            }}
          />
        )}
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"
          style={{ marginLeft: '1.5px', position: 'relative', zIndex: 1 }}>
          <path
            d="M5.5 3.5L12 8L5.5 12.5V3.5Z"
            fill={hovered ? '#FFF8F0' : 'rgba(61,90,53,0.85)'}
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
  onReplaceCase?: () => void
  onCancelSession?: () => void
}

const EVAL_CRITERIA: Array<{ id: keyof ScoreState; label: string }> = [
  { id: 'structure',     label: 'Framework & Structure' },
  { id: 'understanding', label: 'Problem Understanding' },
  { id: 'delivery',      label: 'Delivery & Communication' },
  { id: 'creativity',    label: 'Creativity' },
]

/* ═══════════════════════════════════════════════════════════
   Synced Notes Sidebar — scroll-synced with window, fades at bottom
   ═══════════════════════════════════════════════════════════ */
function SyncedNotesSidebar({ notes }: { notes: { title: string; items: string[] }[] }) {
  return (
    <div className="h-full">
      <div
        className="sticky top-[128px] relative flex flex-col gap-3.5 px-3 py-4"
        style={{
          minHeight: 'calc(100vh - 168px)',
          height: 'auto',
          overflow: 'visible',
        }}
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0 z-0"
          style={{background: 'radial-gradient(ellipse at 50% 40%, rgba(61,90,53,0.07) 0%, rgba(61,90,53,0.02) 50%, transparent 80%)'}} />

        {notes.map((n, idx) => (
          <div key={n.title}
            className="group relative flex-1 min-h-0 flex flex-col justify-center rounded-[4px] border border-[rgba(61,90,53,0.10)] transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-[rgba(61,90,53,0.18)] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.10)]"
            style={{ background: 'rgba(255,248,240,0.80)', animation: `cpm-sidebar-card-in 0.5s cubic-bezier(0.22,1,0.36,1) ${idx * 100}ms both, cpm-card-warmth 1.6s ease-out ${0.4 + idx * 0.12}s 1 both`, zIndex: 1 }}
          >
            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#5C4033]/50 leading-none text-center pt-4 pb-2 px-3 shrink-0">{n.title}</p>
            <ul className="w-full px-3 pb-3">
              {n.items.map(item => (
                <li key={item} className="flex items-start gap-2 mb-2 last:mb-0">
                  <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#3B2F2F]/60" />
                  <span className="flex-1 text-[14px] leading-relaxed font-medium text-[#3B2F2F]" style={{fontFamily: "'Newsreader', serif"}}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Visualization: Section divider (shared)
   ═══════════════════════════════════════════════════════════ */
function VisDivider({ label }: { label: string }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">{label}</span>
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <div className="h-px flex-1" style= {{background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))'}} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">
        {children}
      </span>
      <div className="h-px flex-1" style= {{background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)'}} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Visualization: Formula block (drilldown, between chart and recs)
   ═══════════════════════════════════════════════════════════ */
function VisFormulaBlock({ formulas }: { formulas: VisFormula[] }) {
  const serif: React.CSSProperties = { fontFamily: "'Newsreader', serif" }
  const termColor = '#3B2F2F'

  const termStyle: React.CSSProperties = { ...serif, color: termColor, fontSize: 14, fontWeight: 500 }
  const opStyle: React.CSSProperties = { ...serif, color: termColor, fontSize: 18, fontWeight: 700, margin: '0 6px', lineHeight: 1 }
  const eqStyle: React.CSSProperties = { ...serif, color: termColor, fontSize: 18, fontWeight: 700, margin: '0 8px', lineHeight: 1 }

  function stripParens(text: string): string {
    const t = text.trim()
    if (!t.startsWith('(') || !t.endsWith(')')) return t
    // Only strip if the opening ( is matched by the final )
    let depth = 0
    for (let i = 0; i < t.length - 1; i++) {
      if (t[i] === '(') depth++
      else if (t[i] === ')') { depth--; if (depth === 0) return t }
    }
    return t.slice(1, -1).trim()
  }

  function splitOuterTimes(text: string): string[] {
    const parts: string[] = []
    let depth = 0, cur = ''
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '(') { depth++; cur += ch }
      else if (ch === ')') { depth--; cur += ch }
      else if (ch === '×' && depth === 0) { parts.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    if (cur.trim()) parts.push(cur.trim())
    return parts.length ? parts : [text]
  }

  function InlineTerms({ text, muted = false }: { text: string; muted?: boolean }) {
    const parts = splitOuterTimes(text)
    return (
      <>
        {parts.map((part, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {i > 0 && <span style={{ ...opStyle, opacity: muted ? 0.5 : 1 }}>×</span>}
            {part.trim() ? <span style={{ ...termStyle, opacity: muted ? 0.65 : 1 }}>{part.trim()}</span> : null}
          </span>
        ))}
      </>
    )
  }

  function outerDivIdx(text: string): number {
    let depth = 0
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
      else if (text[i] === '÷' && depth === 0) return i
    }
    return -1
  }

  function splitOuterAddSub(text: string): { op: string; term: string }[] {
    const parts: { op: string; term: string }[] = []
    let depth = 0, cur = '', op = ''
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '(') { depth++; cur += ch }
      else if (ch === ')') { depth--; cur += ch }
      else if ((ch === '+' || ch === '-') && depth === 0 && cur.trim()) {
        parts.push({ op, term: cur.trim() }); cur = ''; op = ch
      } else { cur += ch }
    }
    if (cur.trim()) parts.push({ op, term: cur.trim() })
    return parts.length ? parts : [{ op: '', term: text }]
  }

  function FractionSpan({ numerator, denominator, muted }: { numerator: string; denominator: string; muted: boolean }) {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', margin: '0 8px' }}>
        <span style={{ paddingBottom: 4, display: 'inline-flex', alignItems: 'center' }}>
          <InlineTerms text={numerator} muted={muted} />
        </span>
        <span style={{ display: 'block', height: 1.5, background: termColor, opacity: muted ? 0.3 : 0.45, width: '100%', borderRadius: 1, minWidth: 40 }} />
        <span style={{ paddingTop: 4, display: 'inline-flex', alignItems: 'center' }}>
          <InlineTerms text={denominator} muted={muted} />
        </span>
      </span>
    )
  }

  function FormulaExpr({ text, muted = false }: { text: string; muted?: boolean }) {
    // Case 1: ÷ at outer level → simple fraction, no additive terms
    const divIdx = outerDivIdx(text)
    if (divIdx !== -1) {
      return <FractionSpan numerator={stripParens(text.slice(0, divIdx).trim())} denominator={stripParens(text.slice(divIdx + 1).trim())} muted={muted} />
    }
    // Case 2: no outer ÷, but may have outer + / - after a paren-wrapped fraction group
    const addParts = splitOuterAddSub(text)
    if (addParts.length === 1) {
      return <InlineTerms text={stripParens(text)} muted={muted} />
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '0 2px' }}>
        {addParts.map((part, i) => {
          const innerDivIdx = outerDivIdx(stripParens(part.term))
          const inner = stripParens(part.term)
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {part.op && <span style={{ ...opStyle, opacity: muted ? 0.5 : 1, margin: '0 6px' }}>{part.op}</span>}
              {innerDivIdx !== -1
                ? <FractionSpan numerator={stripParens(inner.slice(0, innerDivIdx).trim())} denominator={stripParens(inner.slice(innerDivIdx + 1).trim())} muted={muted} />
                : <InlineTerms text={inner} muted={muted} />}
            </span>
          )
        })}
      </span>
    )
  }

  function FormulaItem({ vis }: { vis: VisFormula }) {
    const primaryLhs = vis.lhs ?? vis.content?.split('=')[0]?.trim() ?? ''
    const primaryRhs = vis.rhs ?? vis.content?.split('=').slice(1).join('=').split(/\.\s*Where:/i)[0]?.trim() ?? ''
    const derivations = vis.derivations ?? (() => {
      const whereMatch = vis.content?.match(/\.\s*Where:\s*(.+)/i)
      if (!whereMatch) return []
      return whereMatch[1].split(/;\s*/).map(p => {
        const [l, ...rest] = p.split('=')
        return { lhs: l?.trim() ?? '', rhs: rest.join('=').trim() }
      })
    })()
    return (
      <>
        <li className="flex items-center gap-2">
          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[#3B2F2F]/60" />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0 2px' }}>
            <FormulaExpr text={primaryLhs} />
            <span style={eqStyle}>=</span>
            <FormulaExpr text={primaryRhs} />
          </span>
        </li>
        {derivations.map((d, i) => (
          <li key={i} className="flex items-center gap-2" style={{ marginTop: 14, paddingLeft: 13 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0 2px' }}>
              {d.lhs === '+' ? (
                <>
                  <span style={{ ...opStyle, marginRight: 6 }}>+</span>
                  <FormulaExpr text={d.rhs} />
                </>
              ) : (
                <>
                  <span style={{ ...termStyle, marginRight: 6 }}>{i === 0 ? 'where,' : 'and,'}</span>
                  <FormulaExpr text={d.lhs} />
                  <span style={eqStyle}>=</span>
                  <FormulaExpr text={d.rhs} />
                </>
              )}
            </span>
          </li>
        ))}
      </>
    )
  }

  return (
    <div className="pt-16">
      <div className="mb-4 flex items-center gap-4">
        <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Key Equations</span>
        <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
      </div>
      <ul className="space-y-0">
        {formulas.map((vis, fi) => (
          <Fragment key={fi}>
            {fi > 0 && <li style={{ height: 18 }} />}
            <FormulaItem vis={vis} />
          </Fragment>
        ))}
      </ul>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════
   Visualization: Inline table (walkthrough transcript)
   No header, no divider — spacing handled by walkthroughSpacingClass
   ═══════════════════════════════════════════════════════════ */
function VisTableInline({ vis }: { vis: VisTable }) {
  const rows: string[][] = typeof vis.rows === 'string' ? JSON.parse(vis.rows) : vis.rows
  const colStyle = (w: string): React.CSSProperties => ({ width: w })

  const headerStyle: React.CSSProperties = {
    fontFamily: "'Work Sans', sans-serif",
    fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em',
    color: '#f0f5ee', background: '#5C4033',
  }
  const colCount = vis.columns.length
  const dataColCount = colCount - 1
  return (
    <div className="w-full overflow-x-auto rounded-[4px] border border-[#5C4033]/15">
      <table className="w-full border-collapse" style={{ tableLayout: vis.columnWidths ? 'fixed' : 'auto' }}>
{vis.columnWidths && (
<colgroup>
  {vis.columnWidths.map((w, i) => <col key={i} style={colStyle(w)} />)}
</colgroup>
)}
        <thead>
          <tr>
            {vis.columns.map((col, i) => (
              <th key={i} className="px-4 py-2"
                style={{
                  ...headerStyle,
                  textAlign: i === 0 ? 'left' : 'center',
                  borderLeft: i > 0 ? '1px solid rgba(240,245,238,0.15)' : undefined,
                }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: 'rgba(255,248,240,0.5)' }}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-1.5 align-middle"
                  style={{
                    fontFamily: "'Newsreader', serif", fontSize: '14px', fontWeight: ci === 0 ? 500 : 400,
                    color: '#3B2F2F', lineHeight: 1.5,
                    textAlign: ci === 0 ? 'left' : 'center',
                    borderTop: '1px solid rgba(61,90,53,0.08)',
                    borderLeft: ci > 0 ? '1px solid rgba(61,90,53,0.08)' : undefined,
                  }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Visualization: Generic table (drilldown) — same styling as VisTableInline
   ═══════════════════════════════════════════════════════════ */
function VisTableBlock({ vis }: { vis: VisTable }) {
  const rows: string[][] = typeof vis.rows === 'string' ? JSON.parse(vis.rows) : (vis.rows ?? [])
  const cols: string[] = (vis as { columns?: string[]; headers?: string[] }).columns ?? (vis as { headers?: string[] }).headers ?? []
  const summarySet = new Set(vis.summaryRows ?? [])
  // Only the first summaryRow gets the separator line above it; subsequent ones just bold
  const lastCol = cols.length - 1
  const headerStyle: React.CSSProperties = {
  fontFamily: "'Work Sans', sans-serif",
  fontSize: '10px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.2em',
  color: '#f0f5ee', background: '#5C4033',
}
  return (
    <div className="pt-10">
{vis.header && <SectionLabel>{vis.header}</SectionLabel>}
      {!vis.noTitle && <VisDivider label={vis.title} />}
      <div className="w-full overflow-x-auto rounded-[4px] border border-[#5C4033]/15">
        <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
          {vis.columnWidths && (
            <colgroup>
              {vis.columnWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
          )}
          <thead>
            <tr>
              {cols.map((col, i) => (
                <th key={i} className="px-4 py-2"
                  style={{
textAlign: i  === 0 ? 'left' : 'center',   // th
                    fontFamily: "'Work Sans', sans-serif",
                    fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em',
                    color: '#f0f5ee', background: '#5C4033', whiteSpace: 'nowrap',
                    borderLeft: i > 0 ? '1px solid rgba(240,245,238,0.15)' : undefined,
                  }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
<tbody>
  {rows.map((row, ri) => {
    const isSummary = summarySet.has(ri)

    const trStyle: React.CSSProperties = {
      background: isSummary
        ? 'linear-gradient(90deg, rgba(234,226,213,0.92) 0%, rgba(234,226,213,0.55) 100%)'
        : 'transparent',
      borderTop: isSummary ? '1px solid rgba(92,64,51,0.18)' : undefined,
      transition: 'background 0.25s cubic-bezier(0.22,1,0.36,1)',
    }

    return (
      <tr key={ri} className={isSummary ? 'cpm-sum-row' : undefined} style={trStyle}>
        {row.map((cell, ci) => {
          const tdStyle: React.CSSProperties = {
            padding: '11px 16px',
            textAlign: ci === 0 ? 'left' : 'center',                       // step 3: center the 3 data cols
            fontWeight: isSummary ? (ci === 0 ? 600 : 600) : (ci === 0 ? 500 : 400),
            color: '#3B2F2F',
            fontFamily: "'Newsreader', serif",
            whiteSpace: 'nowrap',
          }
          return (
            <td key={ci} style={tdStyle}>
              {cell}
            </td>
          )
        })}
      </tr>
    )
  })}
</tbody>
        </table>
      </div>
      {vis.insight && (
        <p className="mt-2 pl-1 text-[12px] leading-relaxed italic text-[#3B2F2F]/50" style={{ fontFamily: "'Newsreader', serif" }}>
          {vis.insight}
        </p>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Visualization: Side-by-side calculation panels
   ═══════════════════════════════════════════════════════════ */
function VisCalcPairBlock({ vis, className = 'mt-8' }: { vis: VisCalcPair; className?: string }) {
  const TX    = '#3B2F2F'        // dark — matches left sticky panel labels
  const MUTED = '#5C4033'        // muted brown for values / eq signs
  const FONT = "'Work Sans', sans-serif"
  const FS   = 'text-[13px] leading-relaxed'

  function Panel({ panel }: { panel: VisCalcPanel }) {
    return (
      <div className="flex-1 min-w-0">
        {/* Green header — full panel width, tight vertical padding */}
        <div className="px-5 py-1.5" style={{ background: '#5C4033' }}>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] leading-none"
            style={{ color: 'rgba(240,245,238,0.9)', fontFamily: FONT }}>
            {panel.title}
          </span>
        </div>
        {/* Steps */}
        <div className="px-5 pt-4 pb-5 space-y-[5px]">
          {panel.steps.map((step, i) => {
            if (step.text === '') return <div key={i} className="h-[10px]" />
            return (
              <div key={i} className={step.indent ? 'pl-4' : ''}>
                {step.eq ? (
                  // Eq row: label pinned left | = fixed-width centre | value pinned left
                  <div className="flex items-baseline">
                    <span className={`${FS} flex-1`} style={{ fontFamily: FONT, color: TX, fontWeight: step.bold ? 600 : 400 }}>
                      {step.label}
                    </span>
                    <span className={`${FS} w-6 text-center shrink-0`} style={{ fontFamily: FONT, color: `${MUTED}99` }}>=</span>
                    <span className={`${FS} flex-1`} style={{ fontFamily: FONT, color: MUTED, fontWeight: step.bold ? 600 : 400 }}>
                      {step.value}
                    </span>
                  </div>
                ) : (
                  // Plain row — fraction numerator/denominator or bold result line
                  <span className={`${FS}`}
                    style={{ fontFamily: FONT, color: step.bold ? TX : MUTED,
                      fontWeight: step.bold ? 600 : 400,
                      borderBottom: step.underline ? '1.5px solid rgba(61,90,53,0.35)' : undefined,
                      paddingBottom: step.underline ? '1px' : undefined,
                      display: 'inline-block' }}>
                    {step.text}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Section header — only shown if header string provided */}
      {vis.header && (
        <div className="mb-4 flex items-center gap-4">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(61,90,53,0.20))' }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] leading-none" style={{ color: `${TX}80`, fontFamily: FONT }}>{vis.header}</span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(61,90,53,0.20), transparent)' }} />
        </div>
      )}
      {/* Two panels side by side — no outer box */}
      <div className="flex items-stretch gap-0">
        <Panel panel={vis.left} />
        {/* Gradient vertical divider */}
        <div className="w-px mx-4 self-stretch" style={{ background: 'linear-gradient(180deg, rgba(61,90,53,0.30) 0%, rgba(61,90,53,0.06) 100%)' }} />
        <Panel panel={vis.right} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Visualization: Decision tree (flowchart)
   ═══════════════════════════════════════════════════════════ */
function VisDecisionBlock({ vis }: { vis: VisDecision }) {
  const FS = 13         // matches framework tree font-size
  const FONT = "'Work Sans', sans-serif"
  const PX = 18         // horizontal padding inside node
  const PY = 12         // vertical padding inside node
  const LINE_H = FS * 1.4
  const H_GAP = 60
  const V_GAP = 36  // clearance between parent bottom edge and child top edge
  const PAD = 24
  const GREEN    = '#5C4033'
  const MUTED_BG = 'rgba(255,248,240,1)'
  const MUTED_BD = 'rgba(92,64,51,0.28)'
  const MUTED_TX = '#7A5C4A'
  const EDGE_ON  = '#5C4033'
  const EDGE_OFF = 'rgba(92,64,51,0.30)'
  // Approx char width at 13px Work Sans
  const CW = FS * 0.54

  // Word-wrap label into lines that fit within innerW pixels
  function wrap(label: string, innerW: number): string[] {
    const cpl = Math.max(4, Math.floor(innerW / CW))
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

  // Compute node dimensions from label text
  function nodeDims(label: string, isDiamond: boolean): { w: number; h: number } {
    const maxInner = isDiamond ? 110 : 130
    const ls = wrap(label, maxInner)
    const textW = Math.max(...ls.map(l => l.length * CW))
    const textH = ls.length * LINE_H
    if (isDiamond) {
      // A diamond's inscribed rect is w/2 × h/2, so the text + padding must fit inside that
      const hw = textW / 2 + PX + 16
      const hh = textH / 2 + PY + 16
      // Enforce aspect ratio: height ≥ 82% of width so diamonds look proportional
      return { w: hw * 2, h: Math.max(hh * 2, hw * 2 * 0.82) }
    }
    return { w: Math.max(110, textW + PX * 2), h: Math.max(44, textH + PY * 2) }
  }

  // All diamonds share the same size: the largest natural size among all diamonds,
  // with both w and h independently maximised so neither dimension is ever smaller.
  const uniformDiamondDims = (() => {
    const diamonds = vis.nodes.filter(n => n.kind === 'diamond')
    if (!diamonds.length) return null
    let maxW = 0, maxH = 0
    for (const d of diamonds) {
      const { w, h } = nodeDims(d.label, true)
      if (w > maxW) maxW = w
      if (h > maxH) maxH = h
    }
    // Re-enforce aspect ratio on the unified dims so the result is still proportional
    maxH = Math.max(maxH, maxW * 0.82)
    maxW = Math.max(maxW, maxH / 0.82)
    return { w: maxW, h: maxH }
  })()

  type LN = VisDecisionNode & { x: number; y: number; w: number; h: number }
  const nodeMap = new Map<string, VisDecisionNode>(vis.nodes.map(n => [n.id, n]))

  function effectiveDims(n: VisDecisionNode): { w: number; h: number } {
    if (n.kind === 'diamond' && uniformDiamondDims) return uniformDiamondDims
    return nodeDims(n.label, n.kind === 'diamond')
  }

  function sw(id: string): number {
    const n = nodeMap.get(id)!
    const { w } = effectiveDims(n)
    if (!n.children?.length) return w
    const kids = n.children.reduce((s, c, i) => s + sw(c.nodeId) + (i ? H_GAP : 0), 0)
    return Math.max(w, kids)
  }

  function layout(id: string, cx: number, cy: number, out: Map<string, LN>) {
    const n = nodeMap.get(id)!
    const { w, h } = effectiveDims(n)
    out.set(id, { ...n, x: cx, y: cy, w, h })
    if (!n.children?.length) return
    const total = n.children.reduce((s, c, i) => s + sw(c.nodeId) + (i ? H_GAP : 0), 0)
    let lx = cx - total / 2
    for (const c of n.children) {
      const csw = sw(c.nodeId)
      const child = nodeMap.get(c.nodeId)!
      const { h: childH } = effectiveDims(child)
      // Place child so its top edge is V_GAP below parent's bottom edge
      layout(c.nodeId, lx + csw / 2, cy + h / 2 + V_GAP + childH / 2, out)
      lx += csw + H_GAP
    }
  }

  const lm = new Map<string, LN>()
  layout(vis.rootId, 0, 0, lm)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  lm.forEach(n => {
    minX = Math.min(minX, n.x - n.w / 2); minY = Math.min(minY, n.y - n.h / 2)
    maxX = Math.max(maxX, n.x + n.w / 2); maxY = Math.max(maxY, n.y + n.h / 2)
  })
  const svgW = maxX - minX + PAD * 2
  const svgH = maxY - minY + PAD * 2
  const ox = PAD - minX, oy = PAD - minY
  const chosenSet = new Set(vis.nodes.filter(n => n.chosen).map(n => n.id))

  function textLines(x: number, y: number, label: string, innerW: number, color: string, chosen: boolean) {
    const ls = wrap(label, innerW)
    const totalH = ls.length * LINE_H
    // startY positions the top of the first line so all lines are vertically centered on y
    const startY = y - totalH / 2 + LINE_H * 0.85
    return ls.map((l, i) => (
      <text key={i} x={x} y={startY + i * LINE_H}
        textAnchor="middle"
        fontSize={FS} fontFamily={FONT} fontWeight={chosen ? 500 : 400}
        fill={color}>{l}</text>
    ))
  }

  function renderNode(n: LN) {
    const x = n.x + ox, y = n.y + oy
    const on = !!n.chosen
    const hw = n.w / 2, hh = n.h / 2

    if (n.kind === 'diamond') {
      const pts = `${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`
      // Chosen diamond: cream bg + green border + green text — consistent with platform
      // Unchosen diamond: same cream bg, muted border + muted text
      return (
        <g key={n.id}>
          <polygon points={pts}
            fill={MUTED_BG}
            stroke={on ? GREEN : MUTED_BD}
            strokeWidth={on ? 1.5 : 1.2} />
          {textLines(x, y, n.label, n.w - PX * 2 - 24, on ? GREEN : MUTED_TX, on)}
        </g>
      )
    }
    return (
      <g key={n.id}>
        <rect x={x - hw} y={y - hh} width={n.w} height={n.h} rx={4}
          fill={on ? GREEN : MUTED_BG}
          stroke={on ? GREEN : MUTED_BD} strokeWidth={on ? 1.5 : 1} />
        {textLines(x, y, n.label, n.w - PX * 2, on ? '#f0f5ee' : MUTED_TX, on)}
      </g>
    )
  }

  function renderEdges() {
    const out: React.ReactNode[] = []
    lm.forEach(parent => {
      if (!parent.children) return
      parent.children.forEach(c => {
        const child = lm.get(c.nodeId)!
        const px = parent.x + ox, py = parent.y + oy
        const cx2 = child.x + ox, cy2 = child.y + oy
        const on = chosenSet.has(parent.id) && chosenSet.has(c.nodeId)
        const x1 = px, y1 = py + parent.h / 2
        const x2 = cx2, y2 = cy2 - child.h / 2
        const my = (y1 + y2) / 2
        const d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`
        const eLabelX = (x1 + x2) / 2 + (x2 > x1 ? 8 : x2 < x1 ? -8 : 0)
        const eLabelY = my - 6
        out.push(
          <g key={`${parent.id}-${c.nodeId}`}>
            <path d={d} fill="none"
              stroke={on ? EDGE_ON : EDGE_OFF}
              strokeWidth={on ? 1.5 : 1}
              strokeDasharray={on ? undefined : '3 2'} />
            <polygon points={`${x2},${y2} ${x2 - 4},${y2 - 7} ${x2 + 4},${y2 - 7}`}
              fill={on ? EDGE_ON : EDGE_OFF} />
            {c.edgeLabel && (
              <text x={eLabelX} y={eLabelY}
                textAnchor={x2 > x1 ? 'start' : x2 < x1 ? 'end' : 'middle'}
                fontSize={10} fontFamily={FONT} fontWeight={400}
                fill={on ? GREEN : 'rgba(92,64,51,0.4)'}>
                {c.edgeLabel}
              </text>
            )}
          </g>
        )
      })
    })
    return out
  }

  return (
    <div className="mt-6 w-full overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%"
        style={{ maxWidth: svgW, display: 'block', margin: '0 auto' }}>
        {renderEdges()}
        {Array.from(lm.values()).map(renderNode)}
      </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Visualization: Recommendations table (Variant B)
   ═══════════════════════════════════════════════════════════ */
function RecTableBlock({ data }: { data: RecommendationsTableB }) {
  const d = data
  const hideDimension = d.rows.every(r => !r.dimension?.trim())
  // dimensionHeader present → dimension column gets full header styling (matrix mode)
  const matrixMode = !hideDimension && !!d.dimensionHeader
  const cols = d.columns ?? ['Short-Term', 'Long-Term']
  const headerStyle: React.CSSProperties = {
    fontFamily: "'Work Sans', sans-serif",
    fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em',
    color: '#f0f5ee', background: '#5C4033', whiteSpace: 'nowrap',
  }
  const renderBullets = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return null
    return (
      <ul className="space-y-1.5">
        {lines.map((line, li) => (
          <li key={li} className="flex items-start gap-2">
            <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#3B2F2F]/60" />
            <span className="flex-1 text-[14px] leading-relaxed font-medium text-[#3B2F2F]" style={{ fontFamily: "'Newsreader', serif" }}>{line}</span>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="pt-10">
      <VisDivider label="Recommendations" />
      <div className="overflow-x-auto">
        <table className="border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
<thead>
  <tr>
    {matrixMode && (
      <th style={{
        width: '180px',
        padding: '11px 16px',
        fontFamily: "'Work Sans', sans-serif",
        fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em',
        color: '#f0f5ee', background: '#5C4033',
      }} />
    )}
    {cols.map((col, ci) => {
     const thStyle: React.CSSProperties = {
  padding: '11px 16px',
  textAlign: 'left',
  fontFamily: "'Work Sans', sans-serif",
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  color: '#f0f5ee',
  background: '#5C4033',
  borderLeft: '1px solid rgba(240,245,238,0.15)',
}
      return (
        <th key={ci} style={thStyle}>
          {col}
        </th>
      )
    })}
  </tr>
</thead>
          <tbody>
            {d.rows.map((row, ri) => (
              <tr key={ri} style={{ background: 'rgba(255,248,240,0.5)' }}>
                {!hideDimension && (
                  <td className="px-4 py-3 align-middle text-center"
                    style={matrixMode ? {
                      // Matrix mode: dimension cell — same green header styling
                      ...headerStyle,
                      whiteSpace: 'nowrap', textAlign: 'center', verticalAlign: 'middle',
                      borderTop: '1px solid rgba(240,245,238,0.15)',
                      borderRight: '1px solid rgba(240,245,238,0.15)',
                    } : {
                      fontFamily: "'Newsreader', serif", fontSize: '14px', fontWeight: 500, color: '#3B2F2F',
                      borderTop: ri > 0 ? '1px solid rgba(61,90,53,0.08)' : undefined,
                    }}>
                    {row.dimension}
                  </td>
                )}
                <td className="px-4 py-3 align-top" style={{ borderLeft: !hideDimension ? '1px solid rgba(61,90,53,0.10)' : undefined, borderTop: ri > 0 ? '1px solid rgba(61,90,53,0.08)' : undefined }}>
                  {renderBullets(row.shortTerm)}
                </td>
                <td className="px-4 py-3 align-top" style={{ borderLeft: '1px solid rgba(61,90,53,0.10)', borderTop: ri > 0 ? '1px solid rgba(61,90,53,0.08)' : undefined }}>
                  {renderBullets(row.longTerm)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Global-swap helper — allows multiple independent trees to
   render sequentially. Since React render is synchronous within
   a single JS frame, swapping the module globals before each
   tree renders and restoring them after is safe.
   ═══════════════════════════════════════════════════════════ */

function loadTree(tree: FrameworkTree) {
  NODES = tree.nodes
  PARENTS = {}
  for (const [id, node] of Object.entries(tree.nodes)) {
    for (const ch of node.children) PARENTS[ch] = id
  }
  ROOT_ID = Object.keys(NODES).find(id => !PARENTS[id]) ?? ''
  DEFAULT_EXPANDED = new Set(tree.defaultExpanded)
  DEFAULT_FOCUSED_ID = tree.defaultFocusedId
  DEFAULT_FOCUSED_IDS = tree.defaultFocusedIds ?? []
  NOTES = tree.notes
}

/* ═══════════════════════════════════════════════════════════
   AdditionalFrameworkPanel — a standalone interactive chart
   for a secondary FrameworkTree. Renders below the primary one
   with the same design: desktop/vertical chart + mobile tree +
   notes sidebar.
   ═══════════════════════════════════════════════════════════ */

export function AdditionalFrameworkPanel({ tree, label, multiActive = false, hideHeader = false, noScroll = false, forceVertical = false }: { tree: FrameworkTree; label?: string; multiActive?: boolean; hideHeader?: boolean; noScroll?: boolean; forceVertical?: boolean }) {
  // Swap globals so all layout utilities operate on this tree
  loadTree(tree)

  const maxTreeDepth = ROOT_ID ? Math.max(...Object.keys(NODES).map(nodeDepth), 0) : 0
  const useVerticalLayout = forceVertical || shouldUseVerticalLayout('preview')

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (multiActive) return new Set(tree.defaultExpanded)
    const dp = Array.from(focusPathSet(tree.defaultFocusedIds, tree.defaultFocusedId))
    return new Set([...tree.defaultExpanded].filter(id => dp.includes(id)))
  })
  const [focusedId, setFocusedId] = useState<string | null>(() => tree.defaultFocusedId || null)
  const [edgeAnimKey, setEdgeAnimKey] = useState(0)
  const [mobileExpIds, setMobileExpIds] = useState<Set<string>>(() => {
    if (multiActive) return new Set(tree.defaultExpanded)
    const dp = Array.from(focusPathSet(tree.defaultFocusedIds, tree.defaultFocusedId))
    return new Set([...tree.defaultExpanded].filter(id => dp.includes(id)))
  })
  const [mobileFocId, setMobileFocId] = useState(() => tree.defaultFocusedId || '')
  const [chartVisible, setChartVisible] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)
  const overlayHostRef = useRef<HTMLDivElement | null>(null)
  const [drilldownBottomVisible, setDrilldownBottomVisible] = useState(false)
  const drilldownBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = chartRef.current; if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setChartVisible(true); obs.disconnect() } },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.1 }
    )
    obs.observe(el); return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const el = drilldownBottomRef.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => setDrilldownBottomVisible(e.isIntersecting), { threshold: 0 })
    obs.observe(el); return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-node-button]')) setFocusedId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Before computing visibleIds we must ensure globals reflect THIS tree
  loadTree(tree)

  const visibleIds = useMemo(() => {
    loadTree(tree)
    const s = new Set<string>()
    if (ROOT_ID) collectVisible(ROOT_ID, expandedIds, s)
    return [...s]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIds, tree])

  const chartMaxDepth = useMemo(() => Math.max(...visibleIds.map(nodeDepth), 0), [visibleIds])
  const isChartFullyExpanded = useMemo(
    () => [...DEFAULT_EXPANDED].every(id => expandedIds.has(id)),
    [expandedIds]
  )
  const [, startChartTransition] = useTransition()

  const handleSelect = (id: string) => {
    loadTree(tree)
    setFocusedId(id)
    const node = NODES[id]
    if (!multiActive && !focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id) && node?.children.length) return
    startChartTransition(() => {
      if (node?.children.length && expandedIds.has(id)) {
        setExpandedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          loadTree(tree); descendants(id).forEach(d => next.delete(d))
          return next
        })
      } else {
        setExpandedIds(prev => {
          const next = new Set(prev)
          loadTree(tree); pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) })
          return next
        })
      }
      setEdgeAnimKey(k => k + 1)
    })
  }

  const handleToggle = (id: string) => {
    loadTree(tree)
    const node = NODES[id]; if (!node?.children.length) return
    if (!multiActive && !focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id)) return
    startChartTransition(() => {
      setExpandedIds(prev => {
        const next = new Set(prev)
        loadTree(tree)
        if (next.has(id)) {
          next.delete(id); descendants(id).forEach(d => next.delete(d))
          if (focusedId && pathTo(focusedId).includes(id)) setFocusedId(id)
        } else {
          next.add(id)
          if (!multiActive) {
            const parent = PARENTS[id]
            if (parent) NODES[parent].children.forEach(sib => {
              if (sib !== id) { next.delete(sib); descendants(sib).forEach(d => next.delete(d)) }
            })
          }
        }
        return next
      })
      setEdgeAnimKey(k => k + 1)
    })
  }

  const handleMobileSelect = (id: string) => {
    loadTree(tree)
    setMobileFocId(id)
    if (!multiActive && !focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id) && NODES[id]?.children.length) return
    setMobileExpIds(prev => {
      const next = new Set(prev)
      loadTree(tree); pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) })
      return next
    })
  }

  const handleMobileToggle = (id: string) => {
    loadTree(tree)
    const node = NODES[id]; if (!node?.children.length) return
    if (!multiActive && !focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id)) return
    setMobileExpIds(prev => {
      const next = new Set(prev)
      loadTree(tree)
      if (next.has(id)) {
        next.delete(id); descendants(id).forEach(d => next.delete(d))
        if (pathTo(mobileFocId).includes(id)) setMobileFocId(id)
      } else {
        next.add(id)
        if (!multiActive) {
          const parent = PARENTS[id]
          if (parent) NODES[parent].children.forEach(sib => {
            if (sib !== id) { next.delete(sib); descendants(sib).forEach(d => next.delete(d)) }
          })
        }
      }
      return next
    })
  }

  // Ensure globals are set for this tree before rendering chart components
  loadTree(tree)

  const revealDepth = maxTreeDepth

  // Renders just the chart — no outer card, no notes sidebar.
  // Callers embed this directly inside the existing right-side column (desktop)
  // or below the primary mobile tree.
  return (
    <>
      {/* Thin divider with label */}
      {!hideHeader ? (
        <div className="mt-10 mb-6 flex items-center gap-4">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">
            {label ?? 'Additional Framework'}
          </span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
        </div>
      ) : (
        <div className="mt-6" />
      )}

      {/* Chart — desktop */}
      <div className="hidden lg:block">
        {ROOT_ID && (
          <div
            ref={(el) => { chartRef.current = el; overlayHostRef.current = el }}
            style={{
              opacity: chartVisible ? 1 : 0,
              transform: `${useVerticalLayout ? 'scale(1)' : 'scale(1.05)'} translateY(${chartVisible ? '0px' : '18px'})`,
              filter: chartVisible ? 'blur(0px)' : 'blur(6px)',
              transition: 'opacity 0.72s cubic-bezier(0.22,1,0.36,1), transform 0.72s cubic-bezier(0.22,1,0.36,1), filter 0.6s ease',
            }}
          >
            {useVerticalLayout ? (
              <VerticalChart visibleIds={visibleIds} expandedIds={expandedIds} focusedId={focusedId} onSelect={handleSelect} onToggle={handleToggle} revealDepth={revealDepth} edgeAnimKey={edgeAnimKey} multiActive={multiActive} tree={tree} />
            ) : (
              <DesktopChart visibleIds={visibleIds} expandedIds={expandedIds} focusedId={focusedId} onSelect={handleSelect} onToggle={handleToggle} revealDepth={revealDepth} edgeAnimKey={edgeAnimKey} multiActive={multiActive} tree={tree} />
            )}
          </div>
        )}
        <InactiveDrilldownOverlay hostRef={overlayHostRef} visibleIds={visibleIds} mode="preview" tree={tree} />
      </div>

      {/* Chart — mobile */}
      <div className="lg:hidden">
        <Reveal>
          <div className="space-y-3">
            <MobileTreeNode nodeId={ROOT_ID} focusedId={mobileFocId} expandedIds={mobileExpIds}
              onSelect={handleMobileSelect} onToggle={handleMobileToggle} />
          </div>
        </Reveal>
      </div>
    </>
  )
}

export default function CasePreviewMaster({
  caseData, previewMode, transcriptDisplayLines, parsedFramework,
  promptLines, caseTypeLabel, industryLabel, difficultyLabel,
  companyLabel, roundLabel, ForumSection, frameworkTree, additionalFrameworkTrees,
  visualisations, recommendationsTable, abbreviations,
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
  DEFAULT_FOCUSED_IDS = tree.defaultFocusedIds ?? []
  NOTES = tree.notes
  const hasTree = ROOT_ID !== ''
  const maxTreeDepth = hasTree ? Math.max(...Object.keys(NODES).map(nodeDepth), 0) : 0

  const router = useRouter()
  const chartRef = useRef<HTMLDivElement>(null)
  const walkthroughRef = useRef<HTMLElement>(null)
  const drilldownRef = useRef<HTMLElement>(null)
  const overlayHostRef = useRef<HTMLDivElement | null>(null)
  const drilldownBottomRef = useRef<HTMLDivElement>(null)
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

  // ─── Mini step nav on scroll + auto-hide on inactivity ──────────────────
  const stepIndicatorRef = useRef<HTMLDivElement>(null)
  const [stepIndicatorHeight, setStepIndicatorHeight] = useState(76)
  const [miniNavEligible, setMiniNavEligible] = useState(false)
  const [miniNavActive, setMiniNavActive] = useState(true)
  const miniNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showMiniNav = miniNavEligible && miniNavActive

  useEffect(() => {
    const el = stepIndicatorRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setMiniNavEligible(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-70px 0px 0px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const el = stepIndicatorRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStepIndicatorHeight(el.offsetHeight))
    ro.observe(el)
    setStepIndicatorHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  // Auto-hide after 4s of inactivity; show again on interaction
  useEffect(() => {
    const resetTimer = () => {
      setMiniNavActive(true)
      if (miniNavTimerRef.current) clearTimeout(miniNavTimerRef.current)
      miniNavTimerRef.current = setTimeout(() => setMiniNavActive(false), 1000)
    }
    const events = ['mousemove', 'scroll', 'keydown', 'touchstart', 'click'] as const
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      if (miniNavTimerRef.current) clearTimeout(miniNavTimerRef.current)
    }
  }, [])


  // ─── Detect when drilldown container bottom border is visible ─
  const [drilldownBottomVisible, setDrilldownBottomVisible] = useState(false)
  useEffect(() => {
    const el = drilldownBottomRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setDrilldownBottomVisible(entry.isIntersecting),
      { threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const revealDepth = maxTreeDepth
  const treeFullyRevealed = true
  const [chartVisible, setChartVisible] = useState(false)
  const chartVisibleRef = useRef(false)
  const visitedForumRef = useRef(false)
  const [activeStep, setActiveStep] = useState(0)
  const [forumOpen, setForumOpen] = useState(false)
  const [forumExpanded, setForumExpanded] = useState(false)
  useEffect(() => {
    if (!forumExpanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setForumExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [forumExpanded])
  useEffect(() => { activeStepRef.current = activeStep }, [activeStep])

  useEffect(() => {
    const el = chartRef.current; if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { chartVisibleRef.current = true; setChartVisible(true); obs.disconnect() } },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.1 }
    )
    obs.observe(el); return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (activeStep === 2) { visitedForumRef.current = true; return }
    if (visitedForumRef.current && !chartVisibleRef.current) { chartVisibleRef.current = true; setChartVisible(true) }
  }, [activeStep])

  const STEPS = [
    { label: 'Walkthrough', number: 1 },
    { label: 'Drill Down', number: 2 },
  ]

  // ─── Chart state ─────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
  const dp = Array.from(focusPathSet(tree.defaultFocusedIds, tree.defaultFocusedId))
  return new Set([...tree.defaultExpanded].filter(id => dp.includes(id)))
})
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
    } else {
      if (step === 1) scrollToRef(walkthroughRef)
    }
  }, [scrollToRef])

  // ─── handleStepClick — used by StepIndicator + MiniStepNav ─
  const handleStepClick = useCallback((idx: number) => {
    scrollToRef(idx === 0 ? walkthroughRef : drilldownRef)
  }, [scrollToRef])

  // ─── Track active step by scroll position (0 ↔ 1) ─────────
  // Uses scroll event (same approach as inContentSection) so the threshold
  // is consistent: step flips to 1 only when drilldown top has passed the header.
  useEffect(() => {
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
  }, [])

  // ─── Keyboard arrow navigation ────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') navigate('next')
      else if (e.key === 'ArrowLeft') navigate('prev')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  // (horizontal swipe navigation intentionally removed; native browser back/forward gesture is restored here)

  const [mobileExpIds, setMobileExpIds] = useState<Set<string>>(() => {
  const dp = Array.from(focusPathSet(tree.defaultFocusedIds, tree.defaultFocusedId))
  return new Set([...tree.defaultExpanded].filter(id => dp.includes(id)))
})
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
  const visibleIds = useMemo(() => { loadTree(tree); const s = new Set<string>(); if (ROOT_ID) collectVisible(ROOT_ID, expandedIds, s); return [...s] }, [expandedIds, tree])
  const chartMaxDepth = useMemo(() => { loadTree(tree); return Math.max(...visibleIds.map(nodeDepth), 0) }, [visibleIds, tree])
  // Overlay only when all default branches are still expanded (full state)
  const isChartFullyExpanded = useMemo(
    () => { loadTree(tree); return [...DEFAULT_EXPANDED].every(id => expandedIds.has(id)) },
    [expandedIds, tree]
  )

  // Computed once — tree structure is static, no need to recompute per render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const useVerticalLayout = useMemo(() => { loadTree(tree); return shouldUseVerticalLayout('preview') }, [])

  const [, startChartTransition] = useTransition()

  const handleSelect = (id: string) => {
  loadTree(tree)
  setFocusedId(id)
  const node = NODES[id]
  if (!focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id) && node?.children.length) return // inactive → overlay only
  startChartTransition(() => {
      if (node?.children.length && expandedIds.has(id)) {
        setExpandedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          loadTree(tree); descendants(id).forEach(d => next.delete(d))
          return next
        })
      } else {
        setExpandedIds(prev => {
          const next = new Set(prev)
          loadTree(tree); pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) })
          return next
        })
      }
      setEdgeAnimKey(k => k + 1)
    })
  }

  const handleToggle = (id: string) => {
  loadTree(tree)
  const node = NODES[id]; if (!node?.children.length) return
  // Inactive (off chosen-path) nodes never expand in-chart — they use the hover/tap overlay.
  if (!focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id)) return
    startChartTransition(() => {
      setExpandedIds(prev => {
        const next = new Set(prev)
        loadTree(tree)
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
      setEdgeAnimKey(k => k + 1)
    })
  }

  const handleMobileSelect = (id: string) => {
  loadTree(tree)
  setMobileFocId(id)
  if (!focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id) && NODES[id]?.children.length) return // inactive → tap overlay only
    setMobileExpIds(prev => {
      const next = new Set(prev)
      loadTree(tree); pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) })
      return next
    })
  }

  const handleMobileToggle = (id: string) => {
  loadTree(tree)
  const node = NODES[id]; if (!node?.children.length) return
  if (!focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id)) return // inactive → tap overlay only
    setMobileExpIds(prev => {
      const next = new Set(prev)
      loadTree(tree)
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
      className="min-h-screen bg-[#fff8f0] text-[#3B2F2F] antialiased selection:bg-[#5C4033]/20 selection:text-[#3B2F2F]">

      {/* ─── Keyframes ────────────────────────── */}
      <style>{`
        @keyframes cpm-fade-up { from { opacity:0; transform:translateY(22px); filter:blur(6px) } to { opacity:1; transform:translateY(0); filter:blur(0) } }
        @keyframes cpm-glow { 0%,100% { opacity:.42; transform:translate3d(0,0,0) scale(1) } 50% { opacity:.7; transform:translate3d(12px,-8px,0) scale(1.04) } }
        @keyframes cpm-connector { from { opacity:0; stroke-dashoffset:1 } to { opacity:1; stroke-dashoffset:0 } }
        @keyframes cpm-node-in { from { opacity:0; transform:translateY(16px) scale(.96); filter:blur(6px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
@keyframes cpm-overlay-pop { from { opacity:0; transform:translateY(6px) scale(0.97); filter:blur(8px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
@keyframes cpm-overlay-node { from { opacity:0; transform:translateY(8px) scale(0.98); filter:blur(4px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
.cpm-overlay-pop { animation: cpm-overlay-pop 0.34s cubic-bezier(0.16,1,0.3,1) both; }
.cpm-overlay-node { animation: cpm-overlay-node 0.4s cubic-bezier(0.16,1,0.3,1) both; }
@media (prefers-reduced-motion: reduce) { .cpm-overlay-pop, .cpm-overlay-node { animation-duration: 0.001s !important; filter: none !important; } }
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
@keyframes cpm-forum-in {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
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

.cpm-sum-row:hover {
  background: linear-gradient(90deg, rgba(234,226,213,1) 0%, rgba(234,226,213,0.7) 100%) !important;
}

.cpm-sum-row td:first-child {
  box-shadow: inset 2px 0 0 rgba(92,64,51,0); /* hidden by default */
  transition: box-shadow 0.25s cubic-bezier(0.22,1,0.36,1);
}
.cpm-sum-row:hover td:first-child {
  box-shadow: inset 2px 0 0 rgba(92,64,51,0.4);
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

      <MobileDrilldownOverlay />


      <Navbar currentPage="repository" />

      {/* ─── Sticky subheader ─────────────────── */}
      <div className="pt-[70px]">
        <main className="relative mx-auto max-w-[1480px] px-4 pb-28 pt-4 lg:px-6">

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
<section className="relative z-10 pb-1 pt-2">
  {/* ── Breadcrumb + context ── */}
  <div
    className="mb-6 flex items-center gap-2"
    style={{ animation: 'cpm-fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both' }}
  >
    <Link
      href="/repository"
      className="inline-flex items-center gap-1 transition-opacity duration-200 opacity-70 hover:opacity-100"
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
        <path d="M7 2L3.5 5.5L7 9" stroke="#5C4033" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-[#5C4033]">Repository</span>
    </Link>
  </div>

  <h1 className="font-light leading-[1.02] tracking-tight text-[#453a2a]"
    style={{ fontFamily: "'Newsreader', serif", fontSize: isDesktop ? '3.4rem' : '2.8rem', animation: 'cpm-fade-up 0.75s cubic-bezier(0.22,1,0.36,1) 0.06s both' }}>
    <span className="inline-flex items-center justify-center gap-3 w-full">
      <NewCaseBadge caseId={caseData.id} caseKey={caseData.title} size="md" />
      <span>{caseData.title.trim()}</span>
    </span>
  </h1>
</section>


          {/* ── Step Indicator — sticky nav bar ── */}
<div
  ref={stepIndicatorRef}
  className="sticky z-40 flex items-center gap-3 py-2"
  style={{
    top: '70px',
    background: '#fff8f0',
  }}
>
  <div className="flex-1">
    <StepIndicator steps={STEPS} activeStep={activeStep} onStepClick={handleStepClick} />
  </div>
  {/* Forum button — visible only when forum is closed */}
  {ForumSection && !forumOpen && (
    <button
      onClick={() => setForumOpen(true)}
      className="hidden lg:flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all duration-200 shrink-0"
      style={{
        background: 'rgba(255,248,240,0.7)',
        border: '1px solid rgba(92,64,51,0.14)',
        color: '#5C4033',
        boxShadow: '0 1px 4px rgba(59,47,47,0.06)',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      Forum
    </button>
  )}
</div>

          {/* ══════════════════════════════════════
             WALKTHROUGH + DRILL DOWN (vertical scroll)
             ══════════════════════════════════════ */}
          <div className={forumOpen ? 'flex items-start gap-5' : ''}>
          <div className={forumOpen ? 'min-w-0 flex-1' : ''}>
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
            <div className="hidden rounded-2xl border border-[#5C4033]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px] lg:block">
<div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">                {/* ── Desktop sidebar: case metadata ── */}
                <aside className="hidden lg:block">
  <div
className="sticky top-[128px] flex flex-col gap-3.5 px-3 py-4" style={{height: 'calc(100vh - 168px)'}}
  >
    {/* ── B: Ambient green glow behind sidebar ── */}
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{background: 'radial-gradient(ellipse at 50% 40%, rgba(61,90,53,0.07) 0%, rgba(61,90,53,0.02) 50%, transparent 80%)'}}
    />

    {(() => {
      const HEADER: Record<string, { bg: string; fg: string; bottomBg: string }> = {
        'CASE TYPE': { bg: '#3b240d', fg: '#e4dacf', bottomBg: 'rgba(255,248,240,0.9)' },
        'COMPANY':   { bg: '#c5af95', fg: '#50423d', bottomBg: 'rgba(255,248,240,0.9)' },
        'ROUND':     { bg: '#c5af95', fg: '#50423d', bottomBg: 'rgba(255,248,240,0.9)' },
        'INDUSTRY':  { bg: '#83684d', fg: '#e4dacf', bottomBg: 'rgba(255,248,240,0.9)' },
      }
      return [
        { label: 'CASE TYPE', value: caseTypeLabel },
        ...(companyLabel !== 'Client Not Specified' ? [{ label: 'COMPANY', value: companyLabel }] : []),
        ...(roundLabel !== 'Round Not Specified' ? [{ label: 'ROUND', value: roundLabel }] : []),
        { label: 'INDUSTRY', value: industryLabel },
      ].map((item, idx) => {
        const h = HEADER[item.label] ?? { bg: '#3B2F2F', fg: '#e4dacf', bottomBg: 'rgba(255,248,240,0.9)' }
        return (
          <div
            key={item.label}
            className="group relative flex-1 flex flex-col gap-1.5 transition-all duration-300 ease-out hover:-translate-y-[2px]"
            style={{ animation: `cpm-sidebar-card-in 0.5s cubic-bezier(0.22,1,0.36,1) ${idx * 100}ms both, cpm-card-warmth 1.6s ease-out ${0.4 + idx * 0.12}s 1 both`, zIndex: 1 }}
          >
            <div className="shrink-0 px-3 py-3.5 text-center" style={{ background: h.bg }}>
              <p className="text-[13px] uppercase tracking-[0.2em] font-bold leading-none" style={{ color: h.fg }}>{item.label}</p>
            </div>
            <div className="flex flex-1 items-center justify-center border border-[rgba(61,90,53,0.12)] px-2 py-1.5" style={{ background: h.bottomBg }}>
              <p className="text-[20px] font-medium text-[#3B2F2F] tracking-tight text-center leading-tight" style={{ fontFamily: "'Newsreader', serif" }}>
                {item.value}
              </p>
            </div>
          </div>
        )
      })
    })()}

    {/* Difficulty card */}
    <div
      className="group relative flex-1 flex flex-col gap-1.5 transition-all duration-300 ease-out hover:-translate-y-[2px]"
      style={{ animation: 'cpm-sidebar-card-in 0.5s cubic-bezier(0.22,1,0.36,1) 400ms both, cpm-card-warmth 1.6s ease-out 0.88s 1 both', zIndex: 1 }}
    >
      <div className="shrink-0 px-3 py-3.5 text-center" style={{ background: '#c5af95' }}>
        <p className="text-[13px] uppercase tracking-[0.2em] font-bold leading-none text-[#50423d]">Difficulty</p>
      </div>
      <div className="flex flex-1 items-end justify-center gap-2.5 border border-[rgba(61,90,53,0.12)] px-2 pb-2 pt-1.5" style={{ background: 'rgba(255,248,240,0.9)' }}>
        {([22, 34, 48] as const).map((h, idx) => (
          <div key={idx} className="w-7 transition-all duration-500" style={{ height: `${h}px`, backgroundColor: idx + 1 <= difficultyLevel ? '#50423d' : 'transparent', border: idx + 1 <= difficultyLevel ? 'none' : '1.5px solid #50423d' }} />
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
    background: 'linear-gradient(to top, rgba(255,248,240,1) 0%, rgba(255,248,240,0.92) 50%, rgba(255,248,240,0) 100%)',
    WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)',
    maskImage: 'linear-gradient(to top, black 20%, transparent)',
  }}
/>

                    <div>
                      {blocks.map((block, index) => (
                        <div key={block.key} className={walkthroughSpacingClass(block, index > 0 ? blocks[index - 1] : undefined)}>
                          <Reveal>
                            {block.kind === 'vis-inline'
                              ? (() => { const v = visualisations?.[block.visIndex]; return v?.type === 'table' ? <VisTableInline vis={v as VisTable} /> : null })()
                              : <WalkthroughBlockView block={block} />}
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
                      {block.kind === 'vis-inline'
                        ? (() => { const v = visualisations?.[block.visIndex]; return v?.type === 'table' ? <VisTableInline vis={v as VisTable} /> : null })()
                        : <WalkthroughBlockView block={block} />}
                    </Reveal>
                  </div>
                ))}
              </div>
              </div>
</section>

          {/* ══════════════════════════════════════
             FRAMEWORK & RECOMMENDATIONS
             ══════════════════════════════════════ */}
          <section ref={drilldownRef} className="relative z-10 mt-12" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 800px' }}>

            <div className="hidden lg:block">

<div className="rounded-2xl border border-[#5C4033]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px]">
<div className={forumOpen ? '' : 'lg:grid lg:grid-cols-[200px_minmax(0,1fr)]'}>
                  {/* ── Desktop sidebar: notes ─────────── */}
                  {!forumOpen && (
                  <aside className="hidden lg:block h-full">
  <SyncedNotesSidebar notes={NOTES}  />
</aside>
                  )}

                  {/* ── Gradient divider + chart/recommendations ── */}
                  <div className="relative min-w-0">
                    {!forumOpen && (
                    <div className="absolute left-0 top-0 hidden h-full w-px lg:block">
  <div
    className="sticky top-[128px] w-full"
    style=
      {{height: 'calc(100vh - 168px)',
      background: 'linear-gradient(180deg, transparent 0%, rgba(92,64,51,0.14) 12%, rgba(92,64,51,0.14) 88%, transparent 100%)',
      }}
  />
</div>
                    )}

                    <div className={`relative flex flex-col ${forumOpen ? 'pl-5' : 'pl-7'} pr-5 pb-6${visualisations?.some(v => v.type === 'calcpair') ? ' pt-[28px]' : hasTree ? ' pt-6' : ' pt-2'}${recommendations.length === 0 && hasTree ? ' justify-center' : ''}`} style={{ minHeight: 'calc(100vh - 216px)' }}>
                      {/* Glass blur overlay — only when framework is fully expanded AND bottom border is not yet visible */}
                      {isChartFullyExpanded && treeFullyRevealed && !drilldownBottomVisible && (
                        <div className="pointer-events-none z-20"
                          style={{
                            position: 'sticky',
                            top: 'calc(100vh - 110px)',
                            height: '110px',
                            marginBottom: '-110px',
                            background: 'linear-gradient(to top, rgba(255,248,240,1) 0%, rgba(255,248,240,0.92) 50%, rgba(255,248,240,0) 100%)',
                            WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)',
                            maskImage: 'linear-gradient(to top, black 20%, transparent)',
                            transition: 'all 0.8s cubic-bezier(0.22,1,0.36,1)',
                          }}
                        />
                      )}

                      {/* ── Calc pair — before framework tree ── */}
                      {visualisations?.some(v => v.type === 'calcpair') && (<>
                        <Reveal>{visualisations!.filter(v => v.type === 'calcpair').map((v, i) => (
                          <VisCalcPairBlock key={i} vis={v as VisCalcPair} className="mt-0" />
                        ))}</Reveal>
                        <Reveal>
                          <div className="mt-10 mb-0 flex items-center gap-4">
                            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Decision Logic</span>
                            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                          </div>
                        </Reveal>
                      </>)}

                      {/* Desktop chart */}
                      {hasTree && (
                      <div
                        ref={(el) => { chartRef.current = el; overlayHostRef.current = el }}
                        className={(() => {
                          const hasViz = !!(recommendationsTable || visualisations?.some(v => v.type === 'table' || v.type === 'decision'))
                          const hasContent = recommendations.length > 0 || hasViz
                          if (!hasContent) return 'flex items-center'
                          if (chartMaxDepth === 0) return hasTree ? 'flex-1 flex items-center' : ''
                          return hasViz ? '' : 'flex-1'
                        })()}
                        style={{
                          ...(useVerticalLayout ? { transform: 'scale(1)', transformOrigin: 'top center' } : { transform: 'scale(1.05)', transformOrigin: 'center center' }),
                          opacity: chartVisible ? 1 : 0,
                          transform: `${useVerticalLayout ? 'scale(1)' : 'scale(1.05)'} translateY(${chartVisible ? '0px' : '18px'})`,
                          filter: chartVisible ? 'blur(0px)' : 'blur(6px)',
                          transition: 'opacity 0.72s cubic-bezier(0.22,1,0.36,1), transform 0.72s cubic-bezier(0.22,1,0.36,1), filter 0.6s ease',
                        }}
                      >
                        {useVerticalLayout ? (
                          <VerticalChart visibleIds={visibleIds} expandedIds={expandedIds}
                            focusedId={focusedId} onSelect={handleSelect} onToggle={handleToggle} revealDepth={revealDepth} edgeAnimKey={edgeAnimKey} />
                        ) : (
                          <DesktopChart visibleIds={visibleIds} expandedIds={expandedIds}
                            focusedId={focusedId} onSelect={handleSelect} onToggle={handleToggle} revealDepth={revealDepth} edgeAnimKey={edgeAnimKey} />
                        )}
                      </div>
                      )}
<InactiveDrilldownOverlay hostRef={overlayHostRef} visibleIds={visibleIds} mode="preview" tree={tree} />

                      {/* ── Additional framework trees (desktop — inside same column) ── */}
                      {additionalFrameworkTrees?.map((addTree, idx) => (
                        <AdditionalFrameworkPanel key={idx} tree={addTree} label={addTree.label ?? `Framework ${idx + 2}`} />
                      ))}

                      {/* Drilldown table visualizations */}
                      {visualisations?.filter(v => v.type === 'table' && !(v as VisTable).inlineOnly).map((v, i) => (
                        <Reveal key={`vis-tbl-d-${i}`}><VisTableBlock vis={v as VisTable} /></Reveal>
                      ))}

                      {/* ── Formula visualizations ── */}
                      {(() => { const fs = visualisations?.filter(v => v.type === 'formula') as VisFormula[] | undefined; return fs?.length ? <Reveal><VisFormulaBlock formulas={fs} /></Reveal> : null })()}

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
                          {visualisations?.some(v => v.type === 'decision') && (<>
                            {(visualisations!.find(v => v.type === 'decision') as VisDecision)?.title && (
                              <Reveal>
                                <div className="mt-10 mb-4 flex items-center gap-4">
                                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">{(visualisations!.find(v => v.type === 'decision') as VisDecision).title}</span>
                                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                                </div>
                              </Reveal>
                            )}
                            <Reveal>{visualisations!.filter(v => v.type === 'decision').map((v, i) => (
                              <VisDecisionBlock key={i} vis={v as VisDecision} />
                            ))}</Reveal>
                          </>)}
                        </div>
                      )}



                      {recommendationsTable && (
                        <Reveal><RecTableBlock data={recommendationsTable} /></Reveal>
                      )}

                                                                   {abbreviations && abbreviations.length > 0 && (
                          <div className="pt-16">
                            <Reveal>
                              <div className="mb-4 flex items-center gap-4">
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Abbreviations</span>
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                              </div>
                            </Reveal>
                            <ul className="space-y-2">
                              {(abbreviations ?? []).map((item, i) => (
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

                      {/* Sentinel for bottom-border visibility detection */}
                      <div ref={drilldownBottomRef} className="h-px w-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Notes below chart (forum open only, desktop) ── */}
              {forumOpen && NOTES.length > 0 && (
                <div className="mt-4 hidden lg:grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(NOTES.length, 3)}, 1fr)` }}>
                  {NOTES.map((n, idx) => (
                    <div
                      key={n.title}
                      className="rounded-[4px] border border-[rgba(61,90,53,0.10)] bg-[rgba(255,248,240,0.80)] px-3 py-3 transition-all duration-300 hover:-translate-y-[2px] hover:border-[rgba(61,90,53,0.18)] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.10)]"
                      style={{ animation: `cpm-sidebar-card-in 0.45s cubic-bezier(0.22,1,0.36,1) ${idx * 80}ms both` }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#5C4033]/50 text-center pb-2 shrink-0">{n.title}</p>
                      <ul>
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
              )}
            </div>

            <div className="lg:hidden">

              {/* Mobile notes (above chart) */}
              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                {NOTES.map(n => <NoteCard key={n.title} title={n.title} items={n.items} />)}
              </div>

              {/* Calc pair — before framework tree (mobile) */}
              {visualisations?.some(v => v.type === 'calcpair') && (<>
                <Reveal>{visualisations!.filter(v => v.type === 'calcpair').map((v, i) => (
                  <VisCalcPairBlock key={i} vis={v as VisCalcPair} />
                ))}</Reveal>
                <Reveal>
                  <div className="mt-10 mb-0 flex items-center gap-4">
                    <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Decision Logic</span>
                    <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                  </div>
                </Reveal>
              </>)}
              <Reveal>
                <div className="space-y-3">
                  <MobileTreeNode nodeId={ROOT_ID} focusedId={mobileFocId} expandedIds={mobileExpIds}
                    onSelect={handleMobileSelect} onToggle={handleMobileToggle} />
                </div>
              </Reveal>
              {/* ── Additional framework trees (mobile) ── */}
              {additionalFrameworkTrees?.map((addTree, idx) => (
                <AdditionalFrameworkPanel key={idx} tree={addTree} label={addTree.label ?? `Framework ${idx + 2}`} />
              ))}
              {/* Mobile drilldown table */}
              {visualisations?.filter(v => v.type === 'table' && !(v as VisTable).inlineOnly).map((v, i) => (
                <Reveal key={`vis-tbl-m-${i}`}><VisTableBlock vis={v as VisTable} /></Reveal>
              ))}
              {/* Formula — mobile */}
              {(() => { const fs = visualisations?.filter(v => v.type === 'formula') as VisFormula[] | undefined; return fs?.length ? <Reveal><VisFormulaBlock formulas={fs} /></Reveal> : null })()}
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
                  {visualisations?.some(v => v.type === 'decision') && (<>
                    {(visualisations!.find(v => v.type === 'decision') as VisDecision)?.title && (
                      <Reveal>
                        <div className="mt-10 mb-4 flex items-center gap-4">
                          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">{(visualisations!.find(v => v.type === 'decision') as VisDecision).title}</span>
                          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                        </div>
                      </Reveal>
                    )}
                    <Reveal>{visualisations!.filter(v => v.type === 'decision').map((v, i) => (
                      <VisDecisionBlock key={i} vis={v as VisDecision} />
                    ))}</Reveal>
                  </>)}
                </div>
              )}



              {recommendationsTable && (
                <Reveal><RecTableBlock data={recommendationsTable} /></Reveal>
              )}

                                     {abbreviations && abbreviations.length > 0 && (
                          <div className="pt-16">
                            <Reveal>
                              <div className="mb-4 flex items-center gap-4">
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Abbreviations</span>
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                              </div>
                            </Reveal>
                            <ul className="space-y-2">
                              {(abbreviations ?? []).map((item, i) => (
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
</section>
          </div>{/* /content column */}
          {/* ── Forum panel — flex sibling (desktop) ── */}
          {ForumSection && forumOpen && (
            <aside
              className="hidden lg:flex flex-col shrink-0 rounded-2xl overflow-hidden"
              style={{
                width: '300px',
                position: 'sticky',
                top: `${70 + stepIndicatorHeight + 8}px`,
                maxHeight: `calc(100vh - ${70 + stepIndicatorHeight + 16}px)`,
                marginTop: '24px',
                zIndex: 39,
                background: 'linear-gradient(180deg, rgba(255,250,244,0.98) 0%, rgba(250,244,236,0.96) 100%)',
                border: '1px solid rgba(61,90,53,0.14)',
                boxShadow: '0 8px 40px rgba(59,47,47,0.10), 0 2px 8px rgba(59,47,47,0.05)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                animation: 'cpm-forum-in 0.32s cubic-bezier(0.22,1,0.36,1) both',
              }}
            >
              {/* Panel header */}
              <div
                className="flex shrink-0 items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid rgba(61,90,53,0.10)', background: 'rgba(61,90,53,0.05)' }}
              >
                <div className="flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5C4033" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#5C4033]">Forum</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setForumExpanded(true)}
                    className="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-[#5C4033]/8"
                    aria-label="Expand forum"
                    title="Open in full view"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#5C4033" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 3.5V1h2.5M9 6.5V9H6.5M1 3.5L3.5 1M9 6.5L6.5 9" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setForumOpen(false)}
                    className="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-[#5C4033]/8"
                    aria-label="Close forum"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#5C4033" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M1 1l8 8M9 1l-8 8" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: 'none' }}>
                {ForumSection}
              </div>
            </aside>
          )}
          </div>{/* /flex row wrapper */}

        </main>
        <CompactFooter />

        {/* ── Mobile forum floating button ── */}
        {ForumSection && (
          <button
            onClick={() => setForumOpen(o => !o)}
            className="lg:hidden fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] shadow-lg transition-all duration-200"
            style={{
              background: forumOpen ? '#5C4033' : 'rgba(255,248,240,0.95)',
              color: forumOpen ? '#fff' : '#5C4033',
              border: '1px solid rgba(61,90,53,0.22)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {forumOpen ? 'Close' : 'Forum'}
          </button>
        )}

        {/* ── Mobile forum bottom sheet ── */}
        {ForumSection && forumOpen && (
          <div className="lg:hidden fixed inset-0 z-40" style={{ animation: 'cpm-fade-up 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>
            <div
              className="absolute inset-0 bg-[#3B2F2F]/20 backdrop-blur-sm"
              onClick={() => setForumOpen(false)}
            />
            <div
              className="absolute bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden"
              style={{
                maxHeight: '82vh',
                background: 'linear-gradient(180deg, rgba(255,250,244,0.99) 0%, rgba(250,244,236,0.98) 100%)',
                boxShadow: '0 -8px 40px rgba(59,47,47,0.12)',
              }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#5C4033]/08">
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5C4033" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]">Forum</span>
                </div>
                <button onClick={() => setForumOpen(false)} className="text-[#5C4033]/50 hover:text-[#5C4033]">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M2 2l12 12M14 2L2 14" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto px-4 pb-24 pt-3" style={{ maxHeight: 'calc(82vh - 56px)', scrollbarWidth: 'none' }}>
                {ForumSection}
              </div>
            </div>
          </div>
        )}

        {/* ── Forum expanded overlay ── */}
        {ForumSection && forumExpanded && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center pt-[70px]"
            style={{ animation: 'cpm-fade-up 0.28s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0"
              style={{ background: 'rgba(35,28,22,0.50)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
              onClick={() => setForumExpanded(false)}
            />
            {/* Panel */}
            <div
              className="relative z-10 flex flex-col rounded-2xl overflow-hidden"
              style={{
                width: 'min(740px, 90vw)',
                height: '85vh',
                background: 'linear-gradient(180deg, rgba(255,250,244,0.99) 0%, rgba(250,244,236,0.98) 100%)',
                border: '1px solid rgba(61,90,53,0.14)',
                boxShadow: '0 24px 64px rgba(35,28,22,0.22), 0 4px 16px rgba(35,28,22,0.08)',
              }}
            >
              {/* Header */}
              <div
                className="flex shrink-0 items-center justify-between px-6 py-4"
                style={{ borderBottom: '1px solid rgba(61,90,53,0.10)', background: 'rgba(61,90,53,0.05)' }}
              >
                <div className="flex items-center gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C4033" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5C4033]">Forum</span>
                </div>
                <button
                  onClick={() => setForumExpanded(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[#5C4033]/8"
                  aria-label="Close forum view"
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#5C4033" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M1 1l9 9M10 1l-9 9" />
                  </svg>
                </button>
              </div>
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(92,64,51,0.2) transparent' }}>
                {ForumSection}
              </div>
            </div>
          </div>
        )}

        {/* ── Floating action buttons ── */}
        {previewMode && <PracticeFab visible={fabVisible} onClick={() => router.push('/practice')} />}

      </div>
    </div>
  )
}

/* ── Notes textarea formatting helpers ─────────────────────── */
function toRoman(n: number): string {
  const map: [number, string][] = [[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']]
  let r = ''
  for (const [v, s] of map) { while (n >= v) { r += s; n -= v } }
  return r
}
function fromRoman(s: string): number {
  const m: Record<string,number> = { i:1, v:5, x:10, l:50, c:100, d:500, m:1000 }
  let r = 0, prev = 0
  for (const ch of [...s].reverse()) { const v = m[ch] ?? 0; r += v < prev ? -v : v; prev = v }
  return r
}

/* ═══════════════════════════════════════════════════════════
   CaseInterviewerMaster — same UI as preview, no forum,
   with sticky notes/ratings panel on the right
   ═══════════════════════════════════════════════════════════ */

export function CaseInterviewerMaster({
  caseData, transcriptDisplayLines, parsedFramework,
  promptLines, caseTypeLabel, industryLabel, difficultyLabel,
  companyLabel, roundLabel, frameworkTree, additionalFrameworkTrees,
  visualisations, recommendationsTable, abbreviations,
  notes, setNotes, scores, setScores, onEndCase, onReplaceCase, onCancelSession,
}: CaseInterviewerMasterProps) {
  // ─── Sync tree data (same as preview) ────────────────
  const tree = frameworkTree ?? BANKING_ON_YOU_TREE
  loadTree(tree)
  const hasTree = ROOT_ID !== ''
  const maxTreeDepth = hasTree ? Math.max(...Object.keys(NODES).map(nodeDepth), 0) : 0

  const chartRef = useRef<HTMLDivElement>(null)
  const drilldownBottomRef2 = useRef<HTMLDivElement>(null)
  const overlayHostRef = useRef<HTMLDivElement | null>(null)
  const activeStepRef = useRef(0)

  // ─── Detect when drilldown container bottom border is visible ─
  const [drilldownBottomVisible, setDrilldownBottomVisible] = useState(false)
  useEffect(() => {
    const el = drilldownBottomRef2.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setDrilldownBottomVisible(entry.isIntersecting),
      { threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(mq.matches)
    sync(); mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // ─── Notes textarea smart-formatting ───────────────────────
  const notesTaRef = useRef<HTMLTextAreaElement>(null)
  const [notesCtxMenu, setNotesCtxMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!notesCtxMenu) return
    const close = () => setNotesCtxMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    return () => { document.removeEventListener('click', close); document.removeEventListener('contextmenu', close) }
  }, [notesCtxMenu])

  function nextRoman(s: string): string { return toRoman(fromRoman(s) + 1) }

  type MarkerKind = 'number' | 'roman' | 'letter' | 'bullet'

  // Hierarchy cycles: 1 -> i -> a -> • -> 1 -> i -> a -> • ...
  // Starting at the current marker's position in the chain, Tab advances, Shift+Tab retreats.
  // The cycle is determined by where in the chain the TOPMOST marker on this indented block sits.
  const KIND_CHAIN: MarkerKind[] = ['number', 'roman', 'letter', 'bullet']
  function childKind(k: MarkerKind): MarkerKind { const i = KIND_CHAIN.indexOf(k); return KIND_CHAIN[(i + 1) % KIND_CHAIN.length] }
  function parentKind(k: MarkerKind): MarkerKind { const i = KIND_CHAIN.indexOf(k); return KIND_CHAIN[(i - 1 + KIND_CHAIN.length) % KIND_CHAIN.length] }

  function makeFirstMarker(kind: MarkerKind, sep: string): string {
    if (kind === 'number') return '1' + sep + ' '
    if (kind === 'roman') return 'i' + sep + ' '
    if (kind === 'letter') return 'a' + sep + ' '
    return '• '
  }

  // Detect what type and value a line's marker is.
  // Special case: single "i" is treated as roman numeral 1 (not letter i),
  // because users type "i." to start a roman list. All other single chars are letters.
  // Multi-char [ivxlcdm]+ sequences are always roman (ii, iv, ix, xiii, etc.).
  function parseMarker(rest: string): { kind: MarkerKind; sep: string; body: string; marker: string } | null {
    // number: 1. 1) 1:
    const numM = rest.match(/^(\d+)([.):])\s(.*)/)
    if (numM) return { kind: 'number', sep: numM[2], body: numM[3], marker: numM[1] + numM[2] + ' ' }
    // roman: 2+ chars OR single "i" (i. is unambiguously roman 1)
    const romM = rest.match(/^([ivxlcdm]+)([.):])\s(.*)/)
    if (romM && (romM[1].length > 1 || romM[1] === 'i') && fromRoman(romM[1]) > 0)
      return { kind: 'roman', sep: romM[2], body: romM[3], marker: romM[1] + romM[2] + ' ' }
    // single letter a-z (excluding i which is caught above)
    const letM = rest.match(/^([a-z])([.):])\s(.*)/)
    if (letM) return { kind: 'letter', sep: letM[2], body: letM[3], marker: letM[1] + letM[2] + ' ' }
    // bullet: • – -
    const bulM = rest.match(/^([•–-])\s(.*)/)
    if (bulM) return { kind: 'bullet', sep: '', body: bulM[2], marker: bulM[1] + ' ' }
    return null
  }

  function nextMarker(parsed: { kind: MarkerKind; sep: string; marker: string }): string {
    if (parsed.kind === 'number') {
      // marker is e.g. "3. " — extract the number
      const n = parseInt(parsed.marker.match(/^(\d+)/)?.[1] ?? '1')
      return (n + 1) + parsed.sep + ' '
    }
    if (parsed.kind === 'roman') {
      const base = parsed.marker.replace(/[.):\s]/g, '')
      return nextRoman(base) + parsed.sep + ' '
    }
    if (parsed.kind === 'letter') {
      const base = parsed.marker[0]
      return String.fromCharCode(base.charCodeAt(0) + 1) + parsed.sep + ' '
    }
    return parsed.marker // bullet stays same
  }

  function handleNotesKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    const val = ta.value
    const cur = ta.selectionStart
    const curEnd = ta.selectionEnd
    const lineStart = val.lastIndexOf('\n', cur - 1) + 1
    const lineEndIdx = val.indexOf('\n', cur)
    const eol = lineEndIdx === -1 ? val.length : lineEndIdx
    const fullLine = val.slice(lineStart, eol)
    const indent = (fullLine.match(/^( *)/)?.[1] ?? '')
    const level = Math.floor(indent.length / 2)
    const rest = fullLine.slice(indent.length)
    const parsed = parseMarker(rest)

    // Auto-convert dash+space to bullet
    if (e.key === ' ' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const lineUpToCursor = val.slice(lineStart, cur)
      if (/^(\s*)-$/.test(lineUpToCursor)) {
        e.preventDefault()
        const ind = (lineUpToCursor.match(/^( *)/)?.[1] ?? '')
        setNotes(val.slice(0, lineStart) + ind + '• ' + val.slice(cur))
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = lineStart + ind.length + 2 })
        return
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (!e.shiftKey) {
        // Tab: child kind is relative to current marker type, not absolute level
        if (!parsed) {
          // Plain text line — just add 2 spaces of indent
          setNotes(val.slice(0, lineStart) + indent + '  ' + rest + val.slice(eol))
          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = cur + 2 })
          return
        }
        const newKind = childKind(parsed.kind)
        const newIndent = indent + '  '
        // Use parent's separator if non-empty, else default to '.' for new list types
        const childSep = parsed.sep || '.'
        const newMarker = makeFirstMarker(newKind, newKind === 'bullet' ? '' : childSep)
        const nl = newIndent + newMarker + parsed.body
        setNotes(val.slice(0, lineStart) + nl + val.slice(eol))
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = lineStart + newIndent.length + newMarker.length })
      } else {
        // Shift+Tab: parent kind is relative to current marker type, not absolute level
        if (level === 0 || !parsed) return
        const newLevel = level - 1
        const newIndent = '  '.repeat(newLevel)
        const newKind = parentKind(parsed.kind)
        // Scan above lines to find the most recent sibling at the target level
        const aboveLines = val.slice(0, lineStart).split('\n')
        let startVal = 1
        let foundSep = parsed.sep || '.'
        for (let i = aboveLines.length - 1; i >= 0; i--) {
          const aboveIndent = (aboveLines[i].match(/^( *)/)?.[1] ?? '')
          const aboveLevel = Math.floor(aboveIndent.length / 2)
          if (aboveLevel < newLevel) break
          if (aboveLevel === newLevel) {
            const aboveRest = aboveLines[i].slice(aboveIndent.length)
            const aboveParsed = parseMarker(aboveRest)
            if (aboveParsed && aboveParsed.kind === newKind) {
              foundSep = aboveParsed.sep || '.'
              if (newKind === 'number') startVal = parseInt(aboveParsed.marker.match(/^(\d+)/)?.[1] ?? '1') + 1
              else if (newKind === 'roman') startVal = fromRoman(aboveParsed.marker.replace(/[.):\s]/g, '')) + 1
              else if (newKind === 'letter') startVal = aboveParsed.marker.charCodeAt(0) - 96 + 1
            }
            break
          }
        }
        let newMarker: string
        if (newKind === 'number') newMarker = startVal + foundSep + ' '
        else if (newKind === 'roman') newMarker = toRoman(startVal) + foundSep + ' '
        else if (newKind === 'letter') newMarker = String.fromCharCode(96 + startVal) + foundSep + ' '
        else newMarker = '• '
        const nl = newIndent + newMarker + parsed.body
        setNotes(val.slice(0, lineStart) + nl + val.slice(eol))
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = lineStart + nl.length })
      }
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const lineUpToCursor = val.slice(lineStart, cur)
      const upIndent = (lineUpToCursor.match(/^( *)/)?.[1] ?? '')
      const upRest = lineUpToCursor.slice(upIndent.length)
      const upParsed = parseMarker(upRest)

      if (upParsed) {
        e.preventDefault()
        // If body is empty (user typed `1. ` then Enter with no text) — escape list
        if (!upParsed.body.trim()) {
          // Remove the marker, leave just the indent (or blank line if at L0)
          setNotes(val.slice(0, lineStart) + val.slice(cur))
          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = lineStart })
          return
        }
        // Continue list
        const ins = '\n' + upIndent + nextMarker(upParsed)
        setNotes(val.slice(0, cur) + ins + val.slice(curEnd))
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = cur + ins.length })
        return
      }
    }
  }

  function applyNotesFormat(format: 'bullet' | 'numbered' | 'clear') {
    const ta = notesTaRef.current
    if (!ta) { setNotesCtxMenu(null); return }
    const val = ta.value
    const cur = ta.selectionStart
    const lineStart = val.lastIndexOf('\n', cur - 1) + 1
    const lineEndIdx = val.indexOf('\n', cur)
    const eol = lineEndIdx === -1 ? val.length : lineEndIdx
    const line = val.slice(lineStart, eol)
    const clean = line.replace(/^(\s*)(\d+[.):-]\s|[ivxlcdm]+[.):-]\s|[a-z][).]\s|[•–-]\s)/, '$1')
    const newLine = format === 'bullet' ? clean.replace(/^(\s*)/, '$1• ') : format === 'numbered' ? clean.replace(/^(\s*)/, '$11. ') : clean
    if (newLine !== line) {
      const delta = newLine.length - line.length
      setNotes(val.slice(0, lineStart) + newLine + val.slice(eol))
      requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = Math.max(lineStart, cur + delta) })
    }
    setNotesCtxMenu(null)
  }
  // ────────────────────────────────────────────────────────────

  const revealDepth = maxTreeDepth
  const treeFullyRevealed = true
  const [chartVisible, setChartVisible] = useState(false)
  const chartVisibleRef = useRef(false)
  const visitedForumRef = useRef(false)
  const [activeStep, setActiveStep] = useState(0)
  useEffect(() => { activeStepRef.current = activeStep }, [activeStep])

  useEffect(() => {
    const el = chartRef.current; if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { chartVisibleRef.current = true; setChartVisible(true); obs.disconnect() } },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.1 }
    )
    obs.observe(el); return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (activeStep === 2) { visitedForumRef.current = true; return }
    if (visitedForumRef.current && !chartVisibleRef.current) { chartVisibleRef.current = true; setChartVisible(true) }
  }, [activeStep])

  const STEPS = [
    { label: 'Walkthrough', number: 1 },
    { label: 'Drill Down',  number: 2 },
  ]

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
  const dp = Array.from(focusPathSet(tree.defaultFocusedIds, tree.defaultFocusedId))
  return new Set([...tree.defaultExpanded].filter(id => dp.includes(id)))
})
  const [focusedId, setFocusedId]     = useState<string | null>(() => tree.defaultFocusedId || null)
  const [edgeAnimKey, setEdgeAnimKey] = useState(0)
  const [mobileExpIds, setMobileExpIds] = useState<Set<string>>(() => {
  const dp = Array.from(focusPathSet(tree.defaultFocusedIds, tree.defaultFocusedId))
  return new Set([...tree.defaultExpanded].filter(id => dp.includes(id)))
})
  const [mobileFocId, setMobileFocId]   = useState(() => tree.defaultFocusedId || '')

  const HEADER_OFFSET = 144
  const visibleIds = useMemo(() => { loadTree(tree); const s = new Set<string>(); if (ROOT_ID) collectVisible(ROOT_ID, expandedIds, s); return [...s] }, [expandedIds, tree])
  const chartMaxDepth = useMemo(() => { loadTree(tree); return Math.max(...visibleIds.map(nodeDepth), 0) }, [visibleIds, tree])
  const isChartFullyExpanded = useMemo(() => { loadTree(tree); return [...DEFAULT_EXPANDED].every(id => expandedIds.has(id)) }, [expandedIds, tree])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const useVerticalLayout = useMemo(() => { loadTree(tree); return shouldUseVerticalLayout('interviewer') }, [])
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

  // (horizontal swipe navigation intentionally removed; gesture is inert on the interviewer page)

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

  const [, startChartTransition] = useTransition()

  // Node select — collapse if already expanded, expand path otherwise
  const handleSelect = (id: string) => {
  loadTree(tree)
  setFocusedId(id)
  const node = NODES[id]
  // Inactive nodes only focus; their drill-down is shown via the overlay, not in-chart.
  if (!focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id) && node?.children.length) return
    startChartTransition(() => {
      if (node?.children.length && expandedIds.has(id)) {
        setExpandedIds(prev => {
          const next = new Set(prev)
          loadTree(tree); next.delete(id); descendants(id).forEach(d => next.delete(d))
          return next
        })
      } else {
        setExpandedIds(prev => {
          const next = new Set(prev)
          loadTree(tree); pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) })
          return next
        })
      }
      setEdgeAnimKey(k => k + 1)
    })
  }
  const handleToggle = (id: string) => {
  loadTree(tree)
  if (!focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id)) return // inactive → overlay only
  startChartTransition(() => {
      setExpandedIds(prev => {
        const next = new Set(prev)
        loadTree(tree)
        if (next.has(id)) { next.delete(id); descendants(id).forEach(d => next.delete(d)) }
        else { next.add(id); const parent = PARENTS[id]; if (parent) NODES[parent].children.forEach(sib => { if (sib !== id) { next.delete(sib); descendants(sib).forEach(d => next.delete(d)) } }) }
        return next
      })
      setEdgeAnimKey(k => k + 1)
    })
  }
  const handleMobileSelect = (id: string) => { loadTree(tree); setMobileFocId(id); if (!focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id) && NODES[id]?.children.length) return; setMobileExpIds(prev => { const next = new Set(prev); loadTree(tree); pathTo(id).forEach(p => { if (NODES[p]?.children.length) next.add(p) }); return next }) }
  const handleMobileToggle = (id: string) => {
  loadTree(tree)
  if (!focusPathSet(DEFAULT_FOCUSED_IDS, DEFAULT_FOCUSED_ID).has(id)) return // inactive → tap overlay only
  setMobileExpIds(prev => {
      const next = new Set(prev)
      loadTree(tree)
      if (next.has(id)) { next.delete(id); descendants(id).forEach(d => next.delete(d)); if (pathTo(mobileFocId).includes(id)) setMobileFocId(id) }
      else { next.add(id); const parent = PARENTS[id]; if (parent) NODES[parent].children.forEach(sib => { if (sib !== id) { next.delete(sib); descendants(sib).forEach(d => next.delete(d)) } }) }
      return next
    })
  }

  return (
    <div style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="min-h-screen bg-[#fff8f0] text-[#3B2F2F] antialiased selection:bg-[#5C4033]/20 selection:text-[#3B2F2F]">

      <style>{`
        html, body { overscroll-behavior-x: none; }
        @keyframes cpm-fade-up { from { opacity:0; transform:translateY(22px); filter:blur(6px) } to { opacity:1; transform:translateY(0); filter:blur(0) } }
        @keyframes cpm-glow { 0%,100% { opacity:.42; transform:translate3d(0,0,0) scale(1) } 50% { opacity:.7; transform:translate3d(12px,-8px,0) scale(1.04) } }
        @keyframes cpm-connector { from { opacity:0; stroke-dashoffset:1 } to { opacity:1; stroke-dashoffset:0 } }
        @keyframes cpm-node-in { from { opacity:0; transform:translateY(16px) scale(.96); filter:blur(6px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
@keyframes cpm-overlay-pop { from { opacity:0; transform:translateY(6px) scale(0.97); filter:blur(8px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
@keyframes cpm-overlay-node { from { opacity:0; transform:translateY(8px) scale(0.98); filter:blur(4px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
.cpm-overlay-pop { animation: cpm-overlay-pop 0.34s cubic-bezier(0.16,1,0.3,1) both; }
.cpm-overlay-node { animation: cpm-overlay-node 0.4s cubic-bezier(0.16,1,0.3,1) both; }
@media (prefers-reduced-motion: reduce) { .cpm-overlay-pop, .cpm-overlay-node { animation-duration: 0.001s !important; filter: none !important; } }
        @keyframes cpm-sidebar-card-in { from { opacity:0; transform:translateY(16px) scale(0.97); filter:blur(5px) } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0) } }
        @keyframes cpm-card-warmth { 0% { box-shadow:inset 0 0 0 rgba(61,90,53,0) } 40% { box-shadow:inset 0 0 24px rgba(61,90,53,0.04) } 100% { box-shadow:inset 0 0 0 rgba(61,90,53,0) } }
        @keyframes cpm-sidebar-glow { 0%,100% { opacity:0.4; transform:scale(1) } 50% { opacity:0.7; transform:scale(1.05) } }
        @keyframes cpm-dot-breathe { 0%,100% { opacity:0.55; transform:scale(1) } 50% { opacity:1; transform:scale(1.35) } }
        @keyframes cpm-badge-shimmer { 0%,100% { background-position:0% 50% } 50% { background-position:100% 50% } }
        html { scrollbar-width:none; -ms-overflow-style:none; }
        html::-webkit-scrollbar { display:none; }
        .cpm-sum-row:hover {
          background: linear-gradient(90deg, rgba(234,226,213,1) 0%, rgba(234,226,213,0.7) 100%) !important;
        }
        .cpm-sum-row td:first-child {
          box-shadow: inset 2px 0 0 rgba(92,64,51,0);
          transition: box-shadow 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .cpm-sum-row:hover td:first-child {
          box-shadow: inset 2px 0 0 rgba(92,64,51,0.4);
        }
      `}</style>

      <MobileDrilldownOverlay />

      <header
        className="fixed top-0 z-[100] w-full"
        style={{
          height: '70px',
          background: 'rgba(255,248,240,0.9)',
          backdropFilter: 'blur(28px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
          borderBottom: '1px solid rgba(92,64,51,0.06)',
        }}
      >
        <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4 md:px-12">
          <div className="flex items-center gap-1">
            <Image src="/logo.png" alt="Case Compendium X" width={56} height={56} className="h-14 w-14 object-contain" />
            <div style={{ fontFamily: "'Newsreader', serif" }} className="text-xl font-semibold tracking-tight">
              <span className="text-[#453a2a]">Case Compendium</span>
              <span className="text-[#5C4033]">X</span>
            </div>
          </div>
          {(onReplaceCase || onCancelSession) && (
            <div className="flex items-center gap-2" style={{ fontFamily: "'Work Sans', sans-serif" }}>
              <style>{`
                @keyframes ixm-pulse-amber {
                  0%, 100% { box-shadow: 0 0 0 0 rgba(146,64,14,0); }
                  50% { box-shadow: 0 0 0 3px rgba(146,64,14,0.10); }
                }
                @keyframes ixm-pulse-red {
                  0%, 100% { box-shadow: 0 0 0 0 rgba(127,29,29,0); }
                  50% { box-shadow: 0 0 0 3px rgba(127,29,29,0.10); }
                }
              `}</style>
              {onCancelSession && (
                <button
                  type="button"
                  onClick={onCancelSession}
                  style={{
                    animation: 'ixm-pulse-red 4s ease-in-out infinite',
                    animationDelay: '2s',
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-[rgba(127,29,29,0.16)] px-3.5 py-1.5 text-[11px] font-medium text-[#7f1d1d]/50 transition-all hover:border-[rgba(127,29,29,0.32)] hover:text-[#7f1d1d]/80 hover:bg-[rgba(127,29,29,0.04)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                  Cancel session
                </button>
              )}
              {onReplaceCase && (
                <button
                  type="button"
                  onClick={onReplaceCase}
                  style={{
                    animation: 'ixm-pulse-amber 4s ease-in-out infinite',
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-[rgba(92,64,51,0.18)] px-3.5 py-1.5 text-[11px] font-medium text-[#5c4033]/60 transition-all hover:border-[rgba(92,64,51,0.35)] hover:text-[#5c4033]/90 hover:bg-[rgba(92,64,51,0.04)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Replace case
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="pt-[74px]">
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
            <section className="relative z-10 pb-4 pt-2">
              <h1 className="-ml-[2px] font-light leading-[1.02] tracking-tight text-[#453a2a]"
                style={{ fontFamily: "'Newsreader', serif", fontSize: isDesktop ? '4.2rem' : '2.8rem', animation: 'cpm-fade-up 0.75s cubic-bezier(0.22,1,0.36,1) 0.06s both' }}>
                <span className="inline-flex items-center gap-3">
                  <NewCaseBadge caseId={caseData.id} caseKey={caseData.title} size="md" />
                  <span>{caseData.title.trim()}</span>
                </span>
              </h1>
              {/* Metadata byline */}
              <p className="mt-2 text-[13px] text-[#5C4033]/55 tracking-wide" style={{ animation: 'cpm-fade-up 0.75s cubic-bezier(0.22,1,0.36,1) 0.18s both' }}>
                {[
                  caseTypeLabel,
                  `${industryLabel} Industry`,
                  difficultyLabel,
                  ...(companyLabel !== 'Client Not Specified' ? [companyLabel] : []),
                  ...(roundLabel   !== 'Round Not Specified'  ? [roundLabel]   : []),
                ].join('  •  ')}
              </p>
            </section>

            {/* Step indicator — same as preview mode */}
            <div
              className="sticky z-40 flex items-center gap-3 py-2"
              style={{ top: '70px', background: '#fff8f0' }}
            >
              <div className="flex-1">
                <StepIndicator steps={STEPS} activeStep={activeStep} onStepClick={handleStepClick} />
              </div>
            </div>

            {/* Walkthrough */}
            <section ref={walkthroughRef2} className="relative z-10 pt-6">
              <p className="mb-6 text-[12px] text-[#5C4033]/55 tracking-wide lg:hidden">
                {[
                  caseTypeLabel,
                  `${industryLabel} Industry`,
                  difficultyLabel,
                  ...(companyLabel !== 'Client Not Specified' ? [companyLabel] : []),
                  ...(roundLabel   !== 'Round Not Specified'  ? [roundLabel]   : []),
                ].join('  •  ')}
              </p>

              <div className="hidden rounded-2xl border border-[#5C4033]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px] lg:block">
                <div className="custom-scrollbar relative px-7 py-6">
                  <div className="pointer-events-none z-20" style={{ position: 'sticky', top: 'calc(100vh - 120px)', height: '120px', marginBottom: '-120px', background: 'linear-gradient(to top, rgba(255,248,240,1) 0%, rgba(255,248,240,0.92) 50%, rgba(255,248,240,0) 100%)', WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)', maskImage: 'linear-gradient(to top, black 20%, transparent)' }} />
                  <div>
                    {blocks.map((block, index) => (
                      <div key={block.key} className={walkthroughSpacingClass(block, index > 0 ? blocks[index - 1] : undefined)}>
                        <Reveal>
                          {block.kind === 'vis-inline'
                            ? (() => { const v = visualisations?.[block.visIndex]; return v?.type === 'table' ? <VisTableInline vis={v as VisTable} /> : null })()
                            : <WalkthroughBlockView block={block} />}
                        </Reveal>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mobile */}
              <div className="lg:hidden">
                {blocks.map((block, index) => (
                  <div key={block.key} className={walkthroughSpacingClass(block, index > 0 ? blocks[index - 1] : undefined)}>
                    <Reveal>
                      {block.kind === 'vis-inline'
                        ? (() => { const v = visualisations?.[block.visIndex]; return v?.type === 'table' ? <VisTableInline vis={v as VisTable} /> : null })()
                        : <WalkthroughBlockView block={block} />}
                    </Reveal>
                  </div>
                ))}
              </div>
            </section>

            {/* Drill Down */}
            <section ref={drilldownRef2} className="relative z-10 mt-12">
              <div className="hidden lg:block">
                <div className="rounded-2xl border border-[#5C4033]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px]">
                  <div>
                    <div className="relative min-w-0">
                      <div className={`relative flex flex-col px-7 pb-6${visualisations?.some(v => v.type === 'calcpair') ? ' pt-[28px]' : hasTree ? ' pt-6' : ' pt-1'}${recommendations.length === 0 && hasTree ? ' justify-center' : ''}`} style={{ minHeight: 'calc(100vh - 216px)' }}>
                        {isChartFullyExpanded && treeFullyRevealed && !drilldownBottomVisible && (
                          <div className="pointer-events-none z-20" style={{ position: 'sticky', top: 'calc(100vh - 110px)', height: '110px', marginBottom: '-110px', background: 'linear-gradient(to top, rgba(255,248,240,1) 0%, rgba(255,248,240,0.92) 50%, rgba(255,248,240,0) 100%)', WebkitMaskImage: 'linear-gradient(to top, black 20%, transparent)', maskImage: 'linear-gradient(to top, black 20%, transparent)', transition: 'all 0.8s cubic-bezier(0.22,1,0.36,1)' }} />
                        )}
                        {/* Calc pair — before framework tree (interviewer) */}
                        {visualisations?.some(v => v.type === 'calcpair') && (<>
                          <Reveal>{visualisations!.filter(v => v.type === 'calcpair').map((v, i) => (
                            <VisCalcPairBlock key={i} vis={v as VisCalcPair} className="mt-0" />
                          ))}</Reveal>
                          <Reveal>
                            <div className="mt-10 mb-0 flex items-center gap-4">
                              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Decision Logic</span>
                              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                            </div>
                          </Reveal>
                        </>)}
                        {hasTree && (
                        <div ref={(el) => { chartRef.current = el; overlayHostRef.current = el }} className={(() => {
                          const hasViz = !!(recommendationsTable || visualisations?.some(v => v.type === 'table' || v.type === 'decision'))
                          const hasContent = recommendations.length > 0 || hasViz
                          if (!hasContent) return 'flex items-center'
                          if (chartMaxDepth === 0) return hasTree ? 'flex-1 flex items-center' : ''
                          return hasViz ? '' : 'flex-1'
                        })()} style={{
                          ...(useVerticalLayout ? { transform: 'scale(1)', transformOrigin: 'top center' } : { transform: 'scale(1.05)', transformOrigin: 'center center' }),
                          opacity: chartVisible ? 1 : 0,
                          transform: `${useVerticalLayout ? 'scale(1)' : 'scale(1.05)'} translateY(${chartVisible ? '0px' : '18px'})`,
                          filter: chartVisible ? 'blur(0px)' : 'blur(6px)',
                          transition: 'opacity 0.72s cubic-bezier(0.22,1,0.36,1), transform 0.72s cubic-bezier(0.22,1,0.36,1), filter 0.6s ease',
                        }}>
                          {useVerticalLayout ? (
                            <VerticalChart visibleIds={visibleIds} expandedIds={expandedIds} focusedId={focusedId} onSelect={handleSelect} onToggle={handleToggle} revealDepth={revealDepth} edgeAnimKey={edgeAnimKey} />
                          ) : (
                            <DesktopChart visibleIds={visibleIds} expandedIds={expandedIds} focusedId={focusedId} onSelect={handleSelect} onToggle={handleToggle} revealDepth={revealDepth} edgeAnimKey={edgeAnimKey} />
                          )}
                        </div>
                        )}
                        <InactiveDrilldownOverlay hostRef={overlayHostRef} visibleIds={visibleIds} mode="interviewer" tree={tree} />
                        {/* ── Additional framework trees (interviewer desktop — inside same column) ── */}
                        {additionalFrameworkTrees?.map((addTree, idx) => (
                          <AdditionalFrameworkPanel key={idx} tree={addTree} label={addTree.label ?? `Framework ${idx + 2}`} />
                        ))}
                        {/* Drilldown table */}
                        {visualisations?.filter(v => v.type === 'table' && !(v as VisTable).inlineOnly).map((v, i) => (
                          <Reveal key={`vis-tbl-id-${i}`}><VisTableBlock vis={v as VisTable} /></Reveal>
                        ))}
                        {/* Formula */}
                        {(() => { const fs = visualisations?.filter(v => v.type === 'formula') as VisFormula[] | undefined; return fs?.length ? <Reveal><VisFormulaBlock formulas={fs} /></Reveal> : null })()}
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
                            {visualisations?.some(v => v.type === 'decision') && (<>
                              {(visualisations!.find(v => v.type === 'decision') as VisDecision)?.title && (
                                <Reveal>
                                  <div className="mt-10 mb-4 flex items-center gap-4">
                                    <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">{(visualisations!.find(v => v.type === 'decision') as VisDecision).title}</span>
                                    <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                                  </div>
                                </Reveal>
                              )}
                              <Reveal>{visualisations!.filter(v => v.type === 'decision').map((v, i) => (
                                <VisDecisionBlock key={i} vis={v as VisDecision} />
                              ))}</Reveal>
                            </>)}
                          </div>
                        )}


                        {recommendationsTable && (
                          <Reveal><RecTableBlock data={recommendationsTable} /></Reveal>
                        )}

                                                                       {abbreviations && abbreviations.length > 0 && (
                          <div className="pt-16">
                            <Reveal>
                              <div className="mb-4 flex items-center gap-4">
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Abbreviations</span>
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                              </div>
                            </Reveal>
                            <ul className="space-y-2">
                              {(abbreviations ?? []).map((item, i) => (
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


                        {/* Sentinel for bottom-border visibility detection */}
                        <div ref={drilldownBottomRef2} className="h-px w-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes — brownie points + questions (outside the card, same as preview) */}
              {NOTES.length > 0 && (
                <div className="mt-4 hidden lg:grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(NOTES.length, 3)}, 1fr)` }}>
                  {NOTES.map((n, idx) => (
                    <div
                      key={n.title}
                      className="rounded-[4px] border border-[rgba(61,90,53,0.10)] bg-[rgba(255,248,240,0.80)] px-3 py-3 transition-all duration-300 hover:-translate-y-[2px] hover:border-[rgba(61,90,53,0.18)] hover:shadow-[0_4px_16px_-4px_rgba(61,90,53,0.10)]"
                      style={{ animation: `cpm-sidebar-card-in 0.45s cubic-bezier(0.22,1,0.36,1) ${idx * 80}ms both` }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#5C4033]/50 text-center pb-2 shrink-0">{n.title}</p>
                      <ul>
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
              )}

              {/* Mobile drill down */}
              <div className="lg:hidden">
                <div className="mb-6 grid gap-3 sm:grid-cols-3">
                  {NOTES.map(n => <NoteCard key={n.title} title={n.title} items={n.items} />)}
                </div>
                {/* Calc pair — before framework tree (interviewer mobile) */}
                {visualisations?.some(v => v.type === 'calcpair') && (<>
                  <Reveal>{visualisations!.filter(v => v.type === 'calcpair').map((v, i) => (
                    <VisCalcPairBlock key={i} vis={v as VisCalcPair} />
                  ))}</Reveal>
                  <Reveal>
                    <div className="mt-10 mb-0 flex items-center gap-4">
                      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Decision Logic</span>
                      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                    </div>
                  </Reveal>
                </>)}
                <Reveal>
                  <div className="space-y-3">
                    <MobileTreeNode nodeId={ROOT_ID} focusedId={mobileFocId} expandedIds={mobileExpIds} onSelect={handleMobileSelect} onToggle={handleMobileToggle} />
                  </div>
                </Reveal>
                {/* ── Additional framework trees (interviewer mobile) ── */}
                {additionalFrameworkTrees?.map((addTree, idx) => (
                  <AdditionalFrameworkPanel key={idx} tree={addTree} label={addTree.label ?? `Framework ${idx + 2}`} />
                ))}
                {/* Mobile interviewer: table before formula before recs */}
                {visualisations?.filter(v => v.type === 'table' && !(v as VisTable).inlineOnly).map((v, i) => (
                  <Reveal key={`vis-tbl-im-${i}`}><VisTableBlock vis={v as VisTable} /></Reveal>
                ))}
                {(() => { const fs = visualisations?.filter(v => v.type === 'formula') as VisFormula[] | undefined; return fs?.length ? <Reveal><VisFormulaBlock formulas={fs} /></Reveal> : null })()}
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
                    {visualisations?.some(v => v.type === 'decision') && (<>
                      {(visualisations!.find(v => v.type === 'decision') as VisDecision)?.title && (
                        <Reveal>
                          <div className="mt-10 mb-4 flex items-center gap-4">
                            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">{(visualisations!.find(v => v.type === 'decision') as VisDecision).title}</span>
                            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                          </div>
                        </Reveal>
                      )}
                      <Reveal>{visualisations!.filter(v => v.type === 'decision').map((v, i) => (
                        <VisDecisionBlock key={i} vis={v as VisDecision} />
                      ))}</Reveal>
                    </>)}
                  </div>
                )}


                {recommendationsTable && (
                  <Reveal><RecTableBlock data={recommendationsTable} /></Reveal>
                )}

                                       {abbreviations && abbreviations.length > 0 && (
                          <div className="pt-16">
                            <Reveal>
                              <div className="mb-4 flex items-center gap-4">
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(92,64,51,0.12))' }} />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50 leading-none">Abbreviations</span>
                                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(92,64,51,0.12), transparent)' }} />
                              </div>
                            </Reveal>
                            <ul className="space-y-2">
                              {(abbreviations ?? []).map((item, i) => (
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
            </section>
          </main>

          {/* ── Right panel: notes + ratings + end case ── */}
          <aside
            className="hidden lg:flex flex-col flex-shrink-0"
            style={{
              width: '300px',
              position: 'sticky',
              top: '70px',
              height: 'calc(100vh - 70px)',
              paddingLeft: '20px',
              paddingTop: '10px',
              paddingBottom: '16px',
            }}
          >
            <style>{`
              .eval-range { -webkit-appearance:none; appearance:none; width:100%; height:18px; background:transparent; cursor:pointer; }
              .eval-range:focus { outline:none; }
              .eval-range::-webkit-slider-runnable-track { height:3px; border-radius:1px; background:rgba(92,64,51,0.16); }
              .eval-range::-moz-range-track { height:3px; border-radius:2px; background:rgba(92,64,51,0.16); }
              .eval-range::-moz-range-progress { height:3px; border-radius:2px; background:#3D5A35; }
              .eval-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; margin-top:-6px; width:15px; height:15px; border-radius:50%; background:#3D5A35; box-shadow:0 0 0 4px rgba(61,90,53,0.13); }
              .eval-range::-moz-range-thumb { width:15px; height:15px; border:none; border-radius:50%; background:#3D5A35; box-shadow:0 0 0 4px rgba(61,90,53,0.13); }
              .eval-range.is-nr::-webkit-slider-thumb { background:#FBF4EA; box-shadow:0 0 0 1.5px rgba(92,64,51,0.30); }
              .eval-range.is-nr::-moz-range-thumb { background:#FBF4EA; box-shadow:0 0 0 1.5px rgba(92,64,51,0.30); }
              .eval-range.is-nr::-moz-range-progress { background:transparent; }
              .notes-ta::-webkit-scrollbar { width:4px; }
              .notes-ta::-webkit-scrollbar-track { background:transparent; }
              .notes-ta::-webkit-scrollbar-thumb { background:rgba(92,64,51,0.18); border-radius:4px; }
              .notes-ta::-webkit-scrollbar-thumb:hover { background:rgba(92,64,51,0.32); }
            `}</style>

            {/* Single unified panel — no internal scroll */}
            <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-[#5C4033]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px] overflow-hidden">

              {/* "Please pair with verbal feedback" at top of box */}
              <p className="text-center text-[10px] px-4 py-2.5" style={{ color: '#5C4033', textShadow: '0 0 10px rgba(61,90,53,0.6), 0 0 24px rgba(61,90,53,0.25)', letterSpacing: '0.01em' }}>
                Please pair with verbal feedback
              </p>

              {/* Notes section — grows to fill space above evaluation */}
              <div className="px-4 pt-3 pb-3 flex flex-col gap-2 flex-1 min-h-0">
                <div className="flex items-center gap-2">
                  <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: '#3D5A35', boxShadow: '0 0 7px rgba(61,90,53,0.75), 0 0 14px rgba(61,90,53,0.35)', animation: 'cpm-dot-breathe 2.5s ease-in-out infinite' }} />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50">Interviewer Notes</p>
                </div>
                <textarea
                  ref={notesTaRef}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onKeyDown={handleNotesKeyDown}
                  onContextMenu={e => { e.preventDefault(); setNotesCtxMenu({ x: e.clientX, y: e.clientY }) }}
                  placeholder={"Jot observations here...\nTab down  Shift+Tab up  Enter continues list\n1.  i.  a.  -  all supported"}
                  className="notes-ta flex-1 min-h-0 w-full resize-none rounded-[10px] border border-[#5C4033]/10 bg-[rgba(255,248,240,0.6)] p-3 text-[13px] leading-relaxed text-[#3B2F2F] placeholder:text-[#5C4033]/30 focus:border-[#5C4033]/30 focus:outline-none focus:ring-1 focus:ring-[#5C4033]/20 transition-all overflow-y-auto"
                  style={{ fontFamily: "'Work Sans', sans-serif" }}
                />
                {notesCtxMenu && (
                  <div
                    onMouseDown={e => e.preventDefault()}
                    style={{ position: 'fixed', top: notesCtxMenu.y, left: notesCtxMenu.x, zIndex: 9500, background: '#fffdf9', borderRadius: '9px', boxShadow: '0 4px 18px rgba(59,47,47,0.13), 0 0 0 1px rgba(92,64,51,0.1)', padding: '4px', minWidth: '168px', fontFamily: "'Work Sans', sans-serif" }}
                  >
                    {([
                      { label: '•  Bullet list', action: 'bullet' as const },
                      { label: '1.  Numbered list', action: 'numbered' as const },
                      { label: '   i.  Sub-item  (Tab)', action: null },
                      null,
                      { label: '✕  Clear formatting', action: 'clear' as const },
                    ] as const).map((item, idx) =>
                      item === null ? (
                        <div key={idx} style={{ height: '1px', background: 'rgba(92,64,51,0.1)', margin: '3px 6px' }} />
                      ) : (
                        <button
                          key={item.label}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); if (item.action) applyNotesFormat(item.action) }}
                          disabled={!item.action}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '6px 10px', fontSize: '12px', borderRadius: '5px', color: item.action ? '#2e2318' : 'rgba(92,64,51,0.38)', cursor: item.action ? 'pointer' : 'default', fontFamily: "'Work Sans', sans-serif" }}
                          onMouseEnter={e => { if (item.action) (e.currentTarget as HTMLElement).style.background = 'rgba(61,90,53,0.08)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                        >
                          {item.label}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="mx-4 h-px bg-[#5C4033]/10" />

              {/* Evaluation section */}
              <div className="px-4 pt-3 pb-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: '#3D5A35', boxShadow: '0 0 7px rgba(61,90,53,0.75), 0 0 14px rgba(61,90,53,0.35)', animation: 'cpm-dot-breathe 2.5s ease-in-out infinite' }} />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5C4033]/50">Evaluation</p>
                </div>
                <div className="space-y-3">
                  {EVAL_CRITERIA.map(c => {
                    const score = scores[c.id]
                    const rated = score > 0
                    const pct = (score / 5) * 100
                    return (
                      <div key={c.id}>
                        <div className="flex items-center gap-2">
                          <span className="flex-1 text-[12px] font-semibold leading-5 text-[#5C4033] whitespace-nowrap">{c.label}</span>
                          {rated && (
                            <span className="flex-shrink-0 rounded-full border border-[#3D5A35]/35 bg-[rgba(174,208,161,0.22)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#3D5A35] whitespace-nowrap">
                              {score}/5
                            </span>
                          )}
                        </div>
                        <div className="pb-0.5 pt-2">
                          <input
                            type="range" min="0" max="5" step="0.5" value={score}
                            onChange={e => setScores({ ...scores, [c.id]: parseFloat(e.target.value) })}
                            className={`eval-range${rated ? '' : ' is-nr'}`}
                            style={rated ? { background: `linear-gradient(90deg, #3D5A35 ${pct}%, rgba(92,64,51,0.16) ${pct}%)`, height: '3px', borderRadius: '2px' } : undefined}
                          />
                          <div className="mt-1.5 flex justify-between text-[9px] font-bold uppercase tracking-[0.12em] text-[#a99a87]">
                            <span className="italic">NR</span>
                            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* End case — always visible at bottom */}
            <button
              onClick={onEndCase}
              className="mt-2 w-full flex-shrink-0 rounded-[18px] bg-[#3D5A35] py-3.5 text-[10px] font-bold uppercase tracking-[0.3em] text-[#efe8de] transition hover:bg-[#34502d]"
            >
              End Case & Evaluate
            </button>
          </aside>

        </div>
      </div>
    </div>
  )
}

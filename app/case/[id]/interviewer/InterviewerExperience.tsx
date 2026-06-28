'use client'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState, useRef, ReactNode, Component } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getDoc, onSnapshot } from 'firebase/firestore'
import { auth, storage, waitForAuthUser } from '@/lib/firebase/config'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { caseDoc, sessionDoc } from '@/lib/firebase/collections'
import { apiPost } from '@/lib/api/client'
import { CaseForumSection } from '@/components/forum/CaseForumSection'
import CasePreviewView from '@/components/case/CasePreviewView'
import { CaseInterviewerMaster } from '@/components/case/CasePreviewMaster'
import PlatformLoader from '@/components/PlatformLoader'
import { slugifyCase } from '@/lib/slug'
import { LobbyOverlay } from '@/components/lobby/LobbyOverlay'
import { readCandidateBeat, sessionEndedForLobby, CANDIDATE_TAB_STALE_MS, openCandidateTab, isCandidateClosedDismissed, dismissCandidateClosedForSession } from '@/lib/session/candidateTab'
import { MicGuardOverlay } from '@/components/permissions/MicGuardOverlay'
import { useMicPermission } from '@/lib/permissions/microphone'


/* ── Error boundary — catches client-side crashes, auto-reloads ── */
class CaseErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { crashed: false }
  }
  static getDerivedStateFromError() { return { crashed: true } }
  componentDidCatch() {
    setTimeout(() => window.location.reload(), 400)
  }
  render() {
    if (this.state.crashed) return <PlatformLoader message="Getting your case ready" />
    return this.props.children
  }
}

type CaseDocument = {
  id?: number
  title: string
  industry?: string
  case_type?: string
  caseType?: string
  company?: string
  round?: string
  difficulty?: string
  prompt?: string
  framework?: string
  frameworkTree?: import('@/components/case/CasePreviewMaster').FrameworkTree
  additionalFrameworkTrees?: import('@/components/case/CasePreviewMaster').FrameworkTree[]
  visualisations?: import('@/components/case/CasePreviewMaster').Visualisation[]
  recommendationsTable?: import('@/components/case/CasePreviewMaster').RecommendationsTable
  abbreviations?: string[]
}

type ScoreState = {
	structure: number
	understanding: number
	delivery: number
	creativity: number
}

const LIVE_EVALUATION_CRITERIA: Array<{ id: keyof ScoreState; label: string }> = [
	{ id: 'structure', label: 'Framework & Structure' },
	{ id: 'understanding', label: 'Problem Understanding' },
	{ id: 'delivery', label: 'Delivery & Communication' },
	{ id: 'creativity', label: 'Creativity' },
]

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('Loading timed out. Please try again.')), timeoutMs),
		),
	])
}

function RevealBlock({ children, delay = 'delay-0' }: { children: ReactNode; delay?: string }) {
	const [isVisible, setIsVisible] = useState(
		() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
	)
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (isVisible) return

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsVisible(true)
					observer.disconnect()
				}
			},
			{ rootMargin: '0px 0px -40px 0px', threshold: 0 },
		)

		if (ref.current) observer.observe(ref.current)
		return () => observer.disconnect()
	}, [isVisible])

	return (
		<div
			ref={ref}
			className={`transition-all duration-700 ease-out will-change-[opacity,transform,filter] ${delay} ${
				isVisible ? 'opacity-100 translate-y-0 blur-none' : 'opacity-0 translate-y-8 blur-[4px]'
			}`}
		>
			{children}
		</div>
	)
}

// --- Parsing Logic ---
type ParsedFramework = {
	transcriptLines: string[]
	summaryTitle: string | null
	  summaryRows: Array<{ label: string; value: string }>
  recommendations: string[]
}

type TranscriptSpeaker = 'candidate' | 'interviewer' | 'neutral'

type TranscriptDisplayLine = {
	text: string
	speaker: TranscriptSpeaker
}

function normalizeInline(value: string): string {
	return value.replace(/\s+/g, ' ').trim()
}

function splitRecommendationItems(value: string): string[] {
	const compact = normalizeInline(value)
	if (!compact) return []
	const withBreaks = compact.replace(/(\d+\))/g, '\n$1').replace(/•/g, '\n•')
	const primary = withBreaks
		.split('\n')
		.map((item) => item.trim())
		.filter(Boolean)
	if (primary.length > 1) return primary
	return compact
		.split(/(?<=\.)\s+(?=[A-Z])/)
		.map((item) => item.trim())
		.filter(Boolean)
}

function parseFramework(rawFramework: string): ParsedFramework {
	const lines = rawFramework
  .split(/\r?\n/)
  .map((line) => line.replace(/[ \t]+$/, ''))
  .filter((line) => line.trim().length > 0)

	if (lines.length === 0) {
		return { transcriptLines: [], summaryTitle: null, summaryRows: [], recommendations: [] }	}

	const markerIndex = lines.findIndex((line) => /framework(?:\s*&\s*recommendations)?/i.test(line))

	if (markerIndex === -1) {
		return { transcriptLines: lines, summaryTitle: null, summaryRows: [], recommendations: [] }
	}

	const transcriptLines = lines.slice(0, markerIndex)
	const summaryLines = lines.slice(markerIndex + 1)
	let summaryTitle: string | null = null
	const summaryRows: Array<{ label: string; value: string }> = []
	let recommendations: string[] = []
	if (summaryLines.length > 0 && !summaryLines[0].includes(':')) {
		summaryTitle = summaryLines[0]
		summaryLines.shift()
	}

let inRecommendationBlock = false
for (const line of summaryLines) {
  const normalizedLine = normalizeInline(line)
  if (!normalizedLine) continue
  if (/^recommendations?\s*:?$/i.test(normalizedLine)) {
    inRecommendationBlock = true
    continue
  }
  if (/^recommendations?\s*:?$/i.test(normalizedLine)) {
    inRecommendationBlock = true
    continue
  }

		const labelMatch = normalizedLine.match(/^([A-Za-z][A-Za-z\s&]+):\s*(.*)$/)
		if (labelMatch) {
			const label = normalizeInline(labelMatch[1])
			const value = normalizeInline(labelMatch[2])
			if (/recommendations?/i.test(label)) {
				inRecommendationBlock = true
				recommendations = [...recommendations, ...splitRecommendationItems(value)]
			} else {
				summaryRows.push({ label, value })
			}
			continue
		}

		if (inRecommendationBlock) {
			recommendations = [...recommendations, ...splitRecommendationItems(normalizedLine)]
			continue
		}

		if (summaryRows.length > 0) {
			const previous = summaryRows[summaryRows.length - 1]
			previous.value = normalizeInline(`${previous.value} ${normalizedLine}`)
			continue
		}

		summaryRows.push({ label: 'Key Insight', value: normalizedLine })
	}

	return { transcriptLines, summaryTitle, summaryRows, recommendations }}

function formatTranscriptEquation(value: string) {
	return normalizeInline(value).replace(/\s*\*\s*/g, ' × ')
}

const transcriptBodyClass = 'text-[1.05rem] leading-[1.58] tracking-[0.001em]'

function parseExplicitTranscriptSpeaker(line: string): TranscriptDisplayLine | null {
	const match = line.match(/^(Interviewer|Candidate):\s*(.+)$/i)
	if (!match) return null

	const [, speaker, content] = match
	return {
		text: content.trim(),
		speaker: speaker.toLowerCase() === 'candidate' ? 'candidate' : 'interviewer',
	}
}

function inferImplicitTranscriptSpeaker(line: string): TranscriptSpeaker {
	const normalized = line.trim()
	if (!normalized) return 'neutral'
	if (normalized.includes('=') && /[*xX]/.test(normalized)) return 'candidate'
	if (/^(\d+[\).]|[-•])\s*/.test(normalized)) return 'candidate'
	if (normalized.endsWith('?')) return 'candidate'
	if (/^(sure|got it|okay|ok|interesting|understood|alright|thank you|thanks|i'd|i would|i can|i know|my hypothesis|sounds like|that means|am i|have our|do we|where is|what exactly|what type|since when|can i know)/i.test(normalized)) {
		return 'candidate'
	}
	if (/^(yes\b|no\b|the\b|our\b|in fact\b|spot on\b|good question\b|accurate\b|brilliant\b|focus on\b|go ahead\b|you have|you've|there has|profits have|the client\b|it is\b)/i.test(normalized)) {
		return 'interviewer'
	}
	return 'neutral'
}

function buildTranscriptDisplayLines(lines: string[]): TranscriptDisplayLine[] {
	const hasExplicitSpeakers = lines.some((line) => parseExplicitTranscriptSpeaker(line.trim()) !== null)

	return lines.map((line) => {
		const normalized = line.trim()
		const explicitSpeaker = parseExplicitTranscriptSpeaker(normalized)
		if (explicitSpeaker) return explicitSpeaker

		if (hasExplicitSpeakers) {
			return {
				text: line.replace(/[ \t]+$/, ''),
				speaker: 'candidate',
			}
		}

		return {
			text: line.replace(/[ \t]+$/, ''),
			speaker: inferImplicitTranscriptSpeaker(normalized),
		}
	})
}

function TranscriptLine({ line, speaker }: { line: string; speaker: TranscriptSpeaker }) {
	const normalized = line.trim()
	if (!normalized) return null

	const speakerToneClass =
		speaker === 'interviewer'
			? 'font-bold text-[#2f2620]'
			: speaker === 'candidate'
				? 'font-normal text-[#4a4038]'
				: 'font-normal text-[#40352d]'

	const sectionHeadingMatch = normalized.match(/^[A-Z][A-Z0-9\s&'/-]{6,}$/)
	if (sectionHeadingMatch) {
		return (
			<div className="pt-2">
				<h4 className="text-[12px] font-black uppercase tracking-[0.22em] text-[#7c6a5d]">{normalized}</h4>
				<div className="mt-1 h-px w-12 bg-[#c9c1b6]" />
			</div>
		)
	}

	if (normalized.includes('=') && /[*xX]/.test(normalized)) {
		return (
			<p className={`${transcriptBodyClass} ${speaker === 'neutral' ? 'font-normal text-[#463a32]' : speakerToneClass}`}>
				{formatTranscriptEquation(normalized)}
			</p>
		)
	}

	const bulletMatch = normalized.match(/^(\d+[\).]|[-•])\s*(.+)$/)
	if (bulletMatch) {
		return (
			<p className={`${transcriptBodyClass} ml-5 flex gap-3 ${speakerToneClass}`}>
				<span className="min-w-[1.35rem] font-semibold text-[#4a3d33]">{bulletMatch[1]}</span>
				<span>{bulletMatch[2]}</span>
			</p>
		)
	}

	return (
		<p className={`${transcriptBodyClass} ${speakerToneClass}`}>
			{normalized}
		</p>
	)
}

const BANKING_ON_YOU_NOTES = [
	{
		title: 'Clarifying Questions',
		items: ['Which revenue stream?', 'Location of bank branches?'],
	},
	{
		title: 'Brownie Points',
		items: ['Increased consumption expenditure', 'Salary accounts, i.e., policy tie-ups'],
	},
	{
		title: 'Keep In Mind',
		items: ['Read up about the banking industry to get an idea of their value chain'],
	},
]

const BANKING_ON_YOU_DEFAULT_RECOMMENDATIONS = [
	'Implement a mutual fund and SIPs division for our bank',
	'Have alternate investment options like gold etc.',
	'Look at targeting people of different age groups.',
]

function BankingOnYouMetaField({
	label,
	value,
	tone = 'light',
}: {
	label: string
	value: string
	tone?: 'dark' | 'mid' | 'light'
}) {
	const labelClass =
		tone === 'dark'
			? 'bg-[#3b240d] text-[#e4dacf]'
			: tone === 'mid'
				? 'bg-[#83684d] text-[#e4dacf]'
				: 'bg-[#c8bcb1] text-[#50423d]'

	const valueBg = tone === 'dark' ? 'bg-[#e8e0d7]' : 'bg-[#e4dacf]'

	return (
		<div className="space-y-2">
			<div className={`px-3 py-2.5 text-center text-[11px] font-black uppercase tracking-[0.12em] ${labelClass}`}>
				{label}
			</div>
			<div className={`${valueBg} px-3 py-4 text-center text-[17px] uppercase leading-none tracking-[0.03em] text-[#211a16]`}>
				{value}
			</div>
		</div>
	)
}

function BankingOnYouDifficulty({
	level,
	label,
}: {
	level: number
	label: string
}) {
	const active = Math.max(0, Math.min(3, level))

	return (
		<div className="pt-1" title={label}>
			<div className="flex items-end justify-between gap-3 px-1">
				{[
					{ height: 'h-10', fill: 'bg-[#50423d]' },
					{ height: 'h-[3.65rem]', fill: 'bg-[#50423d]' },
					{ height: 'h-[5.5rem]', fill: 'bg-[#50423d]' },
				].map((bar, index) => (
					<div
						key={`difficulty-${index + 1}`}
						className={`w-full border-[3px] border-[#50423d] ${bar.height} ${
							active > index ? bar.fill : 'bg-transparent'
						}`}
					/>
				))}
			</div>
			<div className="mt-4 bg-[#e4dacf] px-3 py-2.5 text-center text-[11px] font-black uppercase tracking-[0.12em] text-[#50423d]">
				Difficulty
			</div>
		</div>
	)
}

function BankingOnYouMetaRail({
	caseTypeLabel,
	companyLabel,
	roundLabel,
	industryLabel,
	difficultyLevel,
	difficultyLabel,
}: {
	caseTypeLabel: string
	companyLabel: string
	roundLabel: string
	industryLabel: string
	difficultyLevel: number
	difficultyLabel: string
}) {
	return (
		<>
			{/* Desktop sidebar — sticky column */}
			<aside className="hidden w-[12rem] flex-shrink-0 lg:block lg:sticky lg:top-28">
				<div className="space-y-6">
					<BankingOnYouMetaField label="Case Type" value={caseTypeLabel} tone="dark" />
					<BankingOnYouMetaField label="Company" value={companyLabel} tone="light" />
					<BankingOnYouMetaField label="Round" value={roundLabel} tone="light" />
					<BankingOnYouMetaField label="Industry" value={industryLabel} tone="mid" />
					<BankingOnYouDifficulty level={difficultyLevel} label={difficultyLabel} />
				</div>
			</aside>
			{/* Mobile/tablet inline row — shown below lg */}
			<div className="lg:hidden mb-5 flex flex-wrap gap-x-6 gap-y-3 border-b border-[#d8cec1]/60 pb-5">
				<BankingOnYouMetaField label="Case Type" value={caseTypeLabel} tone="dark" />
				<BankingOnYouMetaField label="Company" value={companyLabel} tone="light" />
				<BankingOnYouMetaField label="Round" value={roundLabel} tone="light" />
				<BankingOnYouMetaField label="Industry" value={industryLabel} tone="mid" />
				<BankingOnYouDifficulty level={difficultyLevel} label={difficultyLabel} />
			</div>
		</>
	)
}

function BankingOnYouNoteCard({ title, items }: { title: string; items: string[] }) {
	return (
		<div className="bg-[#efe7db]/95">
			<div className="bg-[#ddd0c0] px-3 py-2 text-center text-[12px] font-bold tracking-[0.01em] text-[#4c4037]">
				{title}
			</div>
			<div className="px-4 py-4">
				<ul className="space-y-4 text-[12px] leading-[1.42] text-[#5d5045]">
					{items.map((item) => (
						<li key={item} className="flex gap-2">
							<span className="pt-1 text-[8px] text-[#4c4037]">■</span>
							<span>{item}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}

// --- Specific composed framework layout for "Banking on You" ---
function BankingOnYouFramework({ recommendations }: { recommendations: string[] }) {
	const resolvedRecommendations =
		recommendations.length > 0 ? recommendations : BANKING_ON_YOU_DEFAULT_RECOMMENDATIONS

	return (
		<RevealBlock>
			<section className="rounded-[2rem] border border-[#d7cdbf]/80 bg-[#f2ebe2]/80 px-5 py-6 text-[#4c4037] shadow-[0_24px_55px_-50px_rgba(58,45,35,0.45)] md:px-7 md:py-7">
				<div className="flex items-center gap-4 md:gap-6">
					<div className="h-px flex-1 bg-[#52463d]/70" />
					<h3 className="text-center text-[1.32rem] font-medium leading-none tracking-[0.01em] text-[#54483f] md:text-[1.58rem]">
						Framework & Recommendations
					</h3>
					<div className="h-px flex-1 bg-[#52463d]/70" />
				</div>

				<div className="border border-dashed border-[#8a725c] px-4 py-2.5 text-center text-[12px] font-black tracking-[0.18em] text-[#5b4c40]">
					REVENUE OF A BANK
				</div>

				<div className="mt-5 grid items-start gap-y-5 xl:grid-cols-[10.75rem_minmax(0,1fr)] xl:gap-x-8">
					<div className="space-y-4 xl:border-r xl:border-[#776556]/35 xl:pr-6">
						{BANKING_ON_YOU_NOTES.map((note) => (
							<BankingOnYouNoteCard key={note.title} title={note.title} items={note.items} />
						))}
					</div>

					<div className="overflow-x-auto xl:pl-1">
						<figure className="m-0 mx-auto mt-1 w-full min-w-[280px] max-w-[760px] overflow-hidden bg-[#f2ebe2]">
							<Image
								src="/banking-on-you-framework-beige.svg"
								alt="Banking on You revenue framework"
								width={602}
								height={316}
								className="block h-auto w-full select-none"
								priority
								unoptimized
							/>
						</figure>
					</div>
				</div>

				<div className="mt-6 space-y-3 pt-1">
					<div className="flex items-center gap-4 md:gap-6">
						<div className="h-px flex-1 bg-[#52463d]/70" />
						<h4 className="text-[12px] font-black tracking-[0.16em] text-[#4c4037]">RECOMMENDATIONS</h4>
						<div className="h-px flex-1 bg-[#52463d]/70" />
					</div>
					<ul className="space-y-2.5 pl-2 text-[15px] leading-[1.42] text-[#43372f]">
						{resolvedRecommendations.map((item, index) => (
							<li key={`${item}-${index + 1}`} className="flex gap-3">
								<span className="pt-0.5 text-[12px] text-[#4c4037]">■</span>
								<span>{item}</span>
							</li>
						))}
					</ul>
				</div>
			</section>
		</RevealBlock>
	)
}

function DefaultFramework({ framework }: { framework: ParsedFramework }) {
	return (
		<RevealBlock>
			<section className="rounded-3xl border border-[#c9c1b6] bg-[#f7f4ef] p-6 md:p-8 shadow-sm">
				<h3 className="text-xs font-black uppercase tracking-[0.15em] text-[#6b5a4d] mb-6">
					Framework & Recommendations
				</h3>
				{framework.summaryTitle && (
					<p className="mb-6 rounded-xl border border-[#cbbda9] bg-[#e8dccb] px-5 py-3 text-center text-[13px] font-bold uppercase tracking-[0.1em] text-[#4d3423]">
						{framework.summaryTitle}
					</p>
				)}
				{framework.summaryRows.length > 0 ? (
					<div className="overflow-hidden rounded-2xl border border-[#d5ccbf]">
						<table className="w-full border-collapse text-sm text-[#2d2520]">
							<tbody>
								{framework.summaryRows.map((row, index) => (
									<tr
										key={`${row.label}-${index + 1}`}
										className={index % 2 === 0 ? 'bg-[#f4efe8]' : 'bg-[#ece5da]'}
									>
										<th className="w-[220px] border-r border-[#d5ccbf] px-5 py-4 text-left text-[12px] font-bold uppercase tracking-[0.1em] text-[#4d3423]">
											{row.label}
										</th>
										<td className="px-5 py-4 text-[15px] leading-relaxed text-[#2d2520]">
											{row.value}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="text-[15px] leading-8 text-[#2e2722]">No framework summary provided.</p>
				)}
				{framework.recommendations.length > 0 && (
					<div className="mt-6 rounded-2xl border border-[#d5ccbf] bg-[#efe7dc] p-6">
						<h4 className="mb-3 text-[12px] font-black uppercase tracking-[0.1em] text-[#4d3423]">
							Recommendations
						</h4>
						<ul className="space-y-3 text-[15px] leading-relaxed text-[#2e2722]">
							{framework.recommendations.map((item, index) => (
								<li key={`${item}-${index + 1}`} className="flex gap-3">
									<span className="mt-0.5 font-bold text-[#4d3423]">•</span>
									<span>{item}</span>
								</li>
							))}
						</ul>
					</div>
				)}

			</section>
		</RevealBlock>
	)
}

/* ─────────────────────────────────────────────────────────────────────────
   NotesEditor — rich textarea with smart list continuation, indent/de-indent
   ───────────────────────────────────────────────────────────────────────── */
function nextRoman(r: string): string {
	const seq = ['i','ii','iii','iv','v','vi','vii','viii','ix','x']
	const lower = r.toLowerCase()
	const idx = seq.indexOf(lower)
	if (idx === -1 || idx >= seq.length - 1) {
		// beyond x: just repeat
		return lower + 'i'
	}
	return seq[idx + 1]
}

function isEmptyListLine(line: string): boolean {
	// Line contains only a list marker and optional trailing spaces — no real text
	return /^\s*(\d+[.):\-]|[a-z]\)|(?:i{1,3}|iv|vi{0,3}|ix|xi{0,3})\)|[•–\-])\s*$/i.test(line)
}

function getListContinuation(line: string): string | null {
	// Returns the string to insert after newline, or null for plain newline
	const indent = line.match(/^(\s*)/)?.[1] ?? ''

	// Numbered bullet: 1. or 1) or 1: or 1-
	const numMatch = line.match(/^\s*(\d+)([.):\-])\s/)
	if (numMatch) {
		if (isEmptyListLine(line)) return null
		const next = parseInt(numMatch[1], 10) + 1
		return `${indent}${next}${numMatch[2]} `
	}

	// Letter bullet: a)
	const letterMatch = line.match(/^\s*([a-z])\)\s/)
	if (letterMatch) {
		if (isEmptyListLine(line)) return null
		const next = String.fromCharCode(letterMatch[1].charCodeAt(0) + 1)
		return `${indent}${next}) `
	}

	// Roman numeral bullet: i) ii) etc.
	const romanMatch = line.match(/^\s*(i{1,3}|iv|vi{0,3}|ix|xi{0,3})\)\s/i)
	if (romanMatch) {
		if (isEmptyListLine(line)) return null
		const next = nextRoman(romanMatch[1])
		return `${indent}${next}) `
	}

	// Bullet character • or –
	const bulletMatch = line.match(/^\s*([•–])\s/)
	if (bulletMatch) {
		if (isEmptyListLine(line)) return null
		return `${indent}${bulletMatch[1]} `
	}

	// Dash bullet: -
	const dashMatch = line.match(/^\s*[-]\s/)
	if (dashMatch) {
		if (isEmptyListLine(line)) return null
		return `${indent}• `
	}

	return null
}

function NotesEditor({
	value,
	onChange,
	placeholder,
	className,
	style,
}: {
	value: string
	onChange: (v: string) => void
	placeholder?: string
	className?: string
	style?: React.CSSProperties
}) {
	const ref = useRef<HTMLTextAreaElement>(null)

	// Auto-resize
	useEffect(() => {
		const el = ref.current
		if (!el) return
		el.style.height = 'auto'
		const next = Math.max(120, el.scrollHeight)
		el.style.height = `${next}px`
	}, [value])

	function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
		let val = e.target.value
		// Dash auto-convert: `- ` or `-. ` at start of a line → `• `
		val = val.replace(/(^|\n)(\s*)-\.? /g, (_m, nl, sp) => `${nl}${sp}• `)
		onChange(val)
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		const el = ref.current
		if (!el) return
		const { selectionStart, selectionEnd, value: v } = el

		if (e.key === 'Tab') {
			e.preventDefault()
			const lineStart = v.lastIndexOf('\n', selectionStart - 1) + 1
			if (e.shiftKey) {
				// De-indent: remove up to 2 leading spaces from current line
				const leading = v.slice(lineStart).match(/^( {1,2})/)?.[1] ?? ''
				if (leading.length === 0) return
				const newVal = v.slice(0, lineStart) + v.slice(lineStart + leading.length)
				onChange(newVal)
				requestAnimationFrame(() => {
					const pos = Math.max(lineStart, selectionStart - leading.length)
					el.setSelectionRange(pos, pos)
				})
			} else {
				// Indent: insert 2 spaces at start of current line
				const newVal = v.slice(0, lineStart) + '  ' + v.slice(lineStart)
				onChange(newVal)
				requestAnimationFrame(() => {
					el.setSelectionRange(selectionStart + 2, selectionEnd + 2)
				})
			}
			return
		}

		if (e.key === 'Enter' && !e.shiftKey) {
			const lineStart = v.lastIndexOf('\n', selectionStart - 1) + 1
			const lineEnd = v.indexOf('\n', selectionStart)
			const line = v.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)

			const indent = line.match(/^(\s*)/)?.[1] ?? ''

			// Check if it's an empty list line (escape from list)
			if (isEmptyListLine(line)) {
				e.preventDefault()
				// Replace the empty list marker line with a plain newline
				const before = v.slice(0, lineStart)
				const after = lineEnd === -1 ? '' : v.slice(lineEnd)
				const newVal = before + '\n' + after
				onChange(newVal)
				requestAnimationFrame(() => {
					const pos = lineStart + 1
					el.setSelectionRange(pos, pos)
				})
				return
			}

			const continuation = getListContinuation(line)
			if (continuation !== null) {
				e.preventDefault()
				const newVal = v.slice(0, selectionStart) + '\n' + continuation + v.slice(selectionEnd)
				onChange(newVal)
				requestAnimationFrame(() => {
					const pos = selectionStart + 1 + continuation.length
					el.setSelectionRange(pos, pos)
				})
				return
			}

			// Plain newline preserving indent
			if (indent.length > 0) {
				e.preventDefault()
				const newVal = v.slice(0, selectionStart) + '\n' + indent + v.slice(selectionEnd)
				onChange(newVal)
				requestAnimationFrame(() => {
					const pos = selectionStart + 1 + indent.length
					el.setSelectionRange(pos, pos)
				})
			}
		}
	}

	return (
		<textarea
			ref={ref}
			value={value}
			onChange={handleChange}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			className={className}
			style={{
				...style,
				overflow: 'hidden',
				resize: 'none',
				minHeight: '120px',
				height: 'auto',
			}}
		/>
	)
}

const INTERVIEWER_MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
function pickInterviewerMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const candidate of INTERVIEWER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return null
}

export function InterviewerPageInner({
  params,
  forcePreview = false,
}: {
  params: Promise<{ id: string }>
  forcePreview?: boolean
}) {
	const [caseData, setCaseData] = useState<CaseDocument | null>(null)
	const [loading, setLoading] = useState(true)
	const [loadError, setLoadError] = useState('')
	const [notFound, setNotFound] = useState(false)
	const [reloadTick, setReloadTick] = useState(0)
	const [resolvedCaseId, setResolvedCaseId] = useState<string | null>(null)
	const router = useRouter()
	const searchParams = useSearchParams()
	const previewMode = forcePreview || searchParams.get('preview') === '1'
	const lobbyId = searchParams.get('lobby')

	const [currentView, setCurrentView] = useState<'case' | 'feedback' | 'success'>('case')

	const [scores, setScores] = useState<ScoreState>({
		structure: 0,
		understanding: 0,
		delivery: 0,
		creativity: 0,
	})
	const [notes, setNotes] = useState('')
	const [submitting, setSubmitting] = useState(false)

	// ── Eval overlay (replaces full-page feedback view for the End Case button) ──
	const [showEvalOverlay, setShowEvalOverlay] = useState(false)
	const [editingOverlay, setEditingOverlay] = useState(false)
	const [showUnratedConfirm, setShowUnratedConfirm] = useState(false)
	const [overlaySubmitError, setOverlaySubmitError] = useState('')
	const [overlaySuccess, setOverlaySuccess] = useState(false)
	const showEvalOverlayRef = useRef(false)
	useEffect(() => { showEvalOverlayRef.current = showEvalOverlay }, [showEvalOverlay])

	const closeEvalOverlay = useCallback(() => {
		setShowEvalOverlay(false)
		setEditingOverlay(false)
		setShowUnratedConfirm(false)
	}, [])

	// ── Replace / Cancel / Back guard state ─────────────────────────────────────
	const [showReplaceCaseConfirm, setShowReplaceCaseConfirm] = useState(false)
	const [showCancelConfirm, setShowCancelConfirm] = useState(false)
	const [showBackGuardToast, setShowBackGuardToast] = useState(false)
	const [showCloseWarning, setShowCloseWarning] = useState(false)
	const [isActioning, setIsActioning] = useState(false)

	// ── Candidate tab closed detection (split-screen only) ──────────────────────
	const [candidateTabClosed, setCandidateTabClosed] = useState(false)
	const candidateTabUrlRef = useRef<string | null>(null)
	const candidateWasAliveRef = useRef(false)

	// ── Mic-blocked guard (split-screen shares the candidate's mic permission) ──
	// The interviewer doesn't record, but blocking mic here breaks the candidate's
	// recording, so MicGuardOverlay surfaces the same Allow / Skip choice. It's live
	// until the session ends — once feedback is submitted (currentView 'success')
	// the recording has stopped/uploaded, so the guard turns off.
	const isLocalMode = (searchParams.get('sessionMode') ?? searchParams.get('mode') ?? 'local') === 'local'

	// Upload state for the interviewer's mic recording (remote mode only).
	// Shown in the success view so the interviewer knows to wait before closing.
	const [interviewerUploadState, setInterviewerUploadState] = useState<
		'idle' | 'uploading' | 'uploaded' | 'upload_failed' | 'not_captured'
	>('idle')
	// Remote mode: candidate and interviewer are on separate devices, separate browsers.
	// No localStorage sharing — all cross-device coordination goes through Firestore.
	const isRemoteMode = !isLocalMode
	const [micGuardShowing, setMicGuardShowing] = useState(false)

	// ── Interviewer mic recording (remote mode, dual-mic architecture) ────────────
	// The interviewer records their own mic; the Cloud Function merges both
	// tracks into one merged transcript. Permission flow: auto-ask → remind once
	// → continue without forcing (signal interviewerAudioCaptured:false).
	const [interviewerMicBannerVisible, setInterviewerMicBannerVisible] = useState(false)
	// Permission-state watcher for a manual mid-session mic block (recorder.onerror
	// does not always fire when the user toggles the mic in site settings). When the
	// banner is raised from this path we track it so a later 'granted' can clear it
	// without stomping a banner raised by a hardware error (recorder.onerror).
	const { state: interviewerMicPermState, retry: interviewerMicRetry } = useMicPermission()
	const bannerFromPermissionRef = useRef(false)
	const interviewerRecorderRef = useRef<MediaRecorder | null>(null)
	const interviewerChunksRef = useRef<Blob[]>([])
	const interviewerMicStreamRef = useRef<MediaStream | null>(null)
	const interviewerStartMsRef = useRef<number | null>(null)
	const interviewerSelectedAtMsRef = useRef<number | null>(null)
	const micErrorCountRef = useRef(0)
	const interviewerRecordingStartedRef = useRef(false)
	const interviewerFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const flushInFlightRef = useRef(false)
	// Tracks whether the interviewer declined consent at the gate (NOCONSENT_KEY) or
	// the candidate opted out at launch. Either suppresses the mid-session recovery banner.
	const interviewerDeclinedConsentRef = useRef(false)
	const candidateOptedOutRef = useRef(false)
	const lastInterviewerFlushUrlRef = useRef<string | null>(null)
	const lastInterviewerFlushPathRef = useRef<string | null>(null)
	const lastInterviewerFlushMimeTypeRef = useRef<string>('audio/webm')
	const recordingFinalizedRef = useRef(false)
	const cachedAuthTokenRef = useRef<string | null>(null)

	// Mid-session mic-LOSS recovery (manual block). Raises the recovery banner when
	// a previously-granted mic flips to 'denied'. Hard-suppressed when the interviewer
	// declined at the gate or the candidate opted out, and once upload has begun.
	useEffect(() => {
		if (!isRemoteMode || previewMode) return
		if (currentView === 'success' || interviewerUploadState !== 'idle') return
		if (interviewerDeclinedConsentRef.current || candidateOptedOutRef.current) return
		if (interviewerMicPermState === 'denied') {
			bannerFromPermissionRef.current = true
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setInterviewerMicBannerVisible(true)
		} else if (interviewerMicPermState === 'granted' && bannerFromPermissionRef.current) {
			bannerFromPermissionRef.current = false
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setInterviewerMicBannerVisible(false)
		}
	}, [interviewerMicPermState, isRemoteMode, previewMode, currentView, interviewerUploadState])

	// Re-query mic on focus/visibility so a mic toggled in site settings is detected.
	useEffect(() => {
		if (!isRemoteMode || previewMode || typeof window === 'undefined') return
		const recheck = () => { void interviewerMicRetry() }
		const onVis = () => { if (document.visibilityState === 'visible') void interviewerMicRetry() }
		window.addEventListener('focus', recheck)
		document.addEventListener('visibilitychange', onVis)
		return () => {
			window.removeEventListener('focus', recheck)
			document.removeEventListener('visibilitychange', onVis)
		}
	}, [isRemoteMode, previewMode, interviewerMicRetry])

	// ── Remote-mode overlays ─────────────────────────────────────────────────────
	// A3/D10: Candidate ended the session before the interviewer submitted feedback.
	const [candidateEndedSession, setCandidateEndedSession] = useState(false)

	// Read the gate's decline signal on mount so we never show the recovery banner
	// for an interviewer who already said "I don't provide consent."
	useEffect(() => {
		if (!lobbyId || typeof sessionStorage === 'undefined') return
		interviewerDeclinedConsentRef.current =
			sessionStorage.getItem(`compendium-interviewer-noconsent-${lobbyId}`) === '1'
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Restore draft scores/notes/view from localStorage so a refresh doesn't
	// wipe the interviewer's in-progress ratings. Keyed by lobbyId so different
	// sessions never bleed into each other.
	const draftKey = lobbyId ? `compendium-interviewer-draft-${lobbyId}` : null
	useEffect(() => {
		if (!draftKey) return
		try {
			const raw = localStorage.getItem(draftKey)
			if (!raw) return
			const draft = JSON.parse(raw) as {
				scores?: ScoreState
				notes?: string
				currentView?: 'case' | 'feedback' | 'success'
			}
			if (draft.scores) setScores(draft.scores)
			if (typeof draft.notes === 'string') setNotes(draft.notes)
			if (draft.currentView && draft.currentView !== 'success') setCurrentView(draft.currentView)
		} catch {
			// Malformed draft — ignore and start fresh.
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [draftKey])

	// Persist draft whenever scores, notes, or view change.
	useEffect(() => {
		if (!draftKey) return
		try {
			localStorage.setItem(draftKey, JSON.stringify({ scores, notes, currentView }))
		} catch {
			// Storage quota exceeded — non-fatal.
		}
	}, [draftKey, scores, notes, currentView])

	// ── Remote mode: session doc subscription (mechanism #2) ────────────────────
	// In remote mode there is no shared localStorage, so the interviewer must
	// subscribe to the Firestore session doc to learn about candidate actions.
	// Same-device mode keeps its existing storage-event listeners unchanged.
	const currentViewRef = useRef(currentView)
	useEffect(() => { currentViewRef.current = currentView }, [currentView])

	useEffect(() => {
		if (!isRemoteMode || !lobbyId || previewMode) return
		const ref = sessionDoc(lobbyId)
		let pollTimer: ReturnType<typeof setInterval> | null = null

		const clearPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

		let seedApplied = false
		const handleSnapshot = (data: Record<string, unknown> | null) => {
			if (!data) return
			const status = data.status as string | undefined
			const view = currentViewRef.current

			// D9: Seed inactivity clocks from server timestamps on the first snapshot.
			// Also capture selectedAt for dual-mic startOffsetMs calculation.
			if (!seedApplied && status === 'in_progress') {
				const selectedAt = (data.selectedAt as { toDate: () => Date; toMillis: () => number } | undefined)
				if (selectedAt) {
					const age = Date.now() - selectedAt.toDate().getTime()
					lastScoreChangedAtRef.current = Date.now() - age
					lastActivityAtRef.current = Date.now() - age
					// Store for interviewer recording offset.
					interviewerSelectedAtMsRef.current = selectedAt.toMillis()
				}
				seedApplied = true
				// Update suppressor refs so the recovery banner never fires spuriously.
				if (data.candidateOptedOutRecording === true) candidateOptedOutRef.current = true
				if (data.interviewerAudioCaptured === false) interviewerDeclinedConsentRef.current = true
				// Start mic recording, but skip when: interviewer declined at the gate
				// (NOCONSENT_KEY), or the session doc already shows interviewerAudioCaptured:false.
				// Candidate opt-out no longer suppresses the interviewer's mic flow -- the
				// interviewer still records, but the audio is discarded (never uploaded) in
				// flushInterviewerAudio when candidateOptedOutRef is true.
				if (!interviewerRecordingStartedRef.current) {
					interviewerRecordingStartedRef.current = true
					let declinedAtGate = false
					try {
						declinedAtGate = !!lobbyId && typeof sessionStorage !== 'undefined'
							&& sessionStorage.getItem(`compendium-interviewer-noconsent-${lobbyId}`) === '1'
					} catch { /* quota */ }
					const skipRecording =
						data.interviewerAudioCaptured === false ||
						declinedAtGate
					if (!skipRecording) void startInterviewerRecording()
				}
			}

			// A3/D10: Candidate ended the session while interviewer hasn't submitted.
			// The /submit-draft, /save-unrated, and /complete routes all write
			// status:'completed', so a Firestore snapshot is the reliable cross-device signal.
			if (status === 'completed' && view !== 'success') {
				setCandidateEndedSession(true)
			}

			// D10: Session cancelled by candidate or expired — return interviewer to lobby.
			if (status === 'waiting' || status === 'abandoned') {
				if (view !== 'success') {
					router.replace(`/lobby/${encodeURIComponent(lobbyId)}?role=interviewer&mode=${searchParams.get('sessionMode') ?? 'remote'}`)
				}
			}

			// B5 ("Candidate's recording window is closed") is removed for now. The old
			// heuristic keyed off candidatePresence.recording === false, which is false in
			// many normal states (opt-out / running without recording, brief start/stop
			// ticks), so it false-fired while the candidate window was actually open.
			// We'll redesign a proper "candidate disconnected" signal later. Until then we
			// never raise this overlay.
		}

		const unsubscribe = onSnapshot(
			ref,
			(snap) => {
				clearPoll()
				handleSnapshot(snap.exists() ? (snap.data() as Record<string, unknown>) : null)
			},
			() => {
				// Snapshot error — fall back to polling
				if (!pollTimer) {
					pollTimer = setInterval(async () => {
						try {
							const snap = await (await import('firebase/firestore')).getDoc(ref)
							handleSnapshot(snap.exists() ? (snap.data() as Record<string, unknown>) : null)
						} catch { /* ignore poll errors */ }
					}, 5000)
				}
			},
		)

		return () => { unsubscribe(); clearPoll() }
	// isRemoteMode, lobbyId, previewMode are stable for the session lifetime
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isRemoteMode, lobbyId, previewMode])

	// ── Remote mode: interviewer presence heartbeat ──────────────────────────────
	// Sends a heartbeat to Firestore every 10s so the candidate's workspace can
	// detect if the interviewer disconnects (B4). Also marks inactive on pagehide.
	// Local mode uses compendium-interviewer-window localStorage — unchanged.
	useEffect(() => {
		if (!isRemoteMode || !lobbyId || previewMode) return

		const sendHeartbeat = (active: boolean) => {
			apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
				role: 'interviewer',
				active,
			}).catch(() => { /* best-effort */ })
		}

		// Prime the token cache immediately so it's available if the page closes
		// before any periodic flush has run.
		auth.currentUser?.getIdToken(false).then((t) => { cachedAuthTokenRef.current = t }).catch(() => {})
		sendHeartbeat(true)
		const interval = setInterval(() => {
			sendHeartbeat(true)
			// Keep token fresh for the pagehide beacon (tokens last 1 h; 10 s refresh is fine)
			auth.currentUser?.getIdToken(false).then((t) => { cachedAuthTokenRef.current = t }).catch(() => {})
		}, 10_000)

		// On page close: mark presence inactive and, if recording is still live,
		// fire a keepalive beacon to finalize the last-flushed interviewer audio.
		// fetch+keepalive is used (not sendBeacon) so we can include the auth header.
		const onPageHide = () => {
			sendHeartbeat(false)

			if (!isRemoteMode || recordingFinalizedRef.current || !lobbyId || !cachedAuthTokenRef.current) return

			const nowMs = Date.now()
			if (lastInterviewerFlushUrlRef.current && lastInterviewerFlushPathRef.current) {
				// At least one periodic flush succeeded — finalize that audio as interrupted
				fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/recording`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${cachedAuthTokenRef.current}`,
					},
					body: JSON.stringify({
						status: 'uploaded',
						mode: 'remote',
						role: 'interviewer',
						live: false,
						interrupted: true,
						storagePath: lastInterviewerFlushPathRef.current,
						audioUrl: lastInterviewerFlushUrlRef.current,
						mimeType: lastInterviewerFlushMimeTypeRef.current,
						byteSize: 0,
						startedAtMs: interviewerStartMsRef.current ?? nowMs,
						stoppedAtMs: nowMs,
						durationMs: interviewerStartMsRef.current ? nowMs - interviewerStartMsRef.current : null,
						stopReason: 'page_hide',
						startOffsetMs: interviewerStartMsRef.current !== null && interviewerSelectedAtMsRef.current !== null
							? Math.max(0, interviewerStartMsRef.current - interviewerSelectedAtMsRef.current)
							: undefined,
						anchorSelectedAtMs: interviewerSelectedAtMsRef.current ?? undefined,
					}),
					keepalive: true,
				}).catch(() => {})
			} else if (interviewerRecordingStartedRef.current) {
				// Recording started but no flush ever succeeded — signal no audio via presence
				fetch(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${cachedAuthTokenRef.current}`,
					},
					body: JSON.stringify({ role: 'interviewer', active: true, interviewerAudioCaptured: false }),
					keepalive: true,
				}).catch(() => {})
			}
		}
		window.addEventListener('pagehide', onPageHide)

		return () => {
			clearInterval(interval)
			window.removeEventListener('pagehide', onPageHide)
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isRemoteMode, lobbyId, previewMode])

	// ── Interviewer mic recording helpers ────────────────────────────────────────

	const signalNoInterviewerAudio = useCallback(async () => {
		if (!lobbyId) return
		try {
			await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
				role: 'interviewer',
				active: true,
				interviewerAudioCaptured: false,
			})
		} catch { /* best-effort */ }
	}, [lobbyId])

	// Re-upload the cumulative interviewer blob every 20 s to a stable storage path.
	// Because each flush starts at chunk 0, the blob is always fully decodable —
	// no WebM initialization-segment problem. This bounds worst-case data loss to
	// ~20 s if the interviewer hard-closes the browser.
	const INTERVIEWER_FLUSH_MS = 20_000

	const flushInterviewerAudio = useCallback(async ({ final: isFinal }: { final: boolean }) => {
		if (!isRemoteMode || !lobbyId) return
		// Candidate opted out -- never upload. Mark as not_captured on final so the
		// success view shows the friendly "ran without recording" message.
		if (candidateOptedOutRef.current) {
			if (isFinal) setInterviewerUploadState('not_captured')
			return
		}
		if (flushInFlightRef.current) return  // skip tick if previous upload still in flight

		// Force the current timeslice into ondataavailable before snapshotting
		const recorder = interviewerRecorderRef.current
		if (recorder && recorder.state === 'recording') {
			try {
				recorder.requestData()
				await new Promise<void>((r) => setTimeout(r, 80))
			} catch { /* recorder may have transitioned state — ignore */ }
		}

		const chunks = interviewerChunksRef.current
		if (chunks.length === 0) {
			if (isFinal) {
				setInterviewerUploadState('not_captured')
				void signalNoInterviewerAudio()
			}
			return
		}

		const mimeType = recorder?.mimeType || pickInterviewerMimeType() || 'audio/mp4'
		// Always build from ALL chunks — cumulative blob is always decodable from the start
		const blob = new Blob(chunks, { type: mimeType })

		flushInFlightRef.current = true
		if (isFinal) setInterviewerUploadState('uploading')

		try {
			const user = await waitForAuthUser()
			if (!user) {
				if (isFinal) {
					setInterviewerUploadState('not_captured')
					void signalNoInterviewerAudio()
				}
				return
			}

			await auth.currentUser?.getIdToken(true).catch(() => {})
			const ext = mimeType.includes('ogg') ? 'ogg' : 'webm'
			// Stable path — every flush overwrites the same file
			const storagePath = `session-recordings/${user.uid}/${lobbyId}/interviewer-live.${ext}`
			const sRef = storageRef(storage, storagePath)
			await uploadBytes(sRef, blob, { contentType: mimeType })
			const audioUrl = await getDownloadURL(sRef)

			lastInterviewerFlushUrlRef.current = audioUrl
			lastInterviewerFlushPathRef.current = storagePath
			lastInterviewerFlushMimeTypeRef.current = mimeType

			const nowMs = Date.now()
			await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/recording`, {
				status: 'uploaded',
				mode: 'remote' as const,
				startedAtMs: interviewerStartMsRef.current ?? nowMs,
				stoppedAtMs: nowMs,
				durationMs: interviewerStartMsRef.current ? nowMs - interviewerStartMsRef.current : null,
				stopReason: isFinal ? 'session_completed' : 'periodic_flush',
				storagePath,
				audioUrl,
				mimeType,
				byteSize: blob.size,
				role: 'interviewer' as const,
				startOffsetMs: interviewerStartMsRef.current !== null && interviewerSelectedAtMsRef.current !== null
					? Math.max(0, interviewerStartMsRef.current - interviewerSelectedAtMsRef.current)
					: undefined,
				anchorSelectedAtMs: interviewerSelectedAtMsRef.current ?? undefined,
				live: !isFinal,
			})

			if (isFinal) setInterviewerUploadState('uploaded')

			// Cache token for the pagehide keepalive beacon
			auth.currentUser?.getIdToken(false).then((t) => { cachedAuthTokenRef.current = t }).catch(() => {})
		} catch {
			if (isFinal) {
				setInterviewerUploadState('upload_failed')
				void signalNoInterviewerAudio()
			}
			// Non-final flush failure: non-fatal — next tick retries
		} finally {
			flushInFlightRef.current = false
			if (isFinal) interviewerChunksRef.current = []
		}
	}, [isRemoteMode, lobbyId, signalNoInterviewerAudio])

	const startInterviewerRecording = useCallback(async () => {
		if (!isRemoteMode || !lobbyId || previewMode) return
		try {
			await auth.currentUser?.getIdToken(true).catch(() => {})
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
			interviewerMicStreamRef.current = stream
			const mimeType = pickInterviewerMimeType()
			const recorder = mimeType
				? new MediaRecorder(stream, { mimeType })
				: new MediaRecorder(stream)
			interviewerRecorderRef.current = recorder
			interviewerChunksRef.current = []
			interviewerStartMsRef.current = Date.now()
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) interviewerChunksRef.current.push(e.data)
			}
			// If the recorder stops unexpectedly mid-session (mic disconnected,
			// browser error, device switch), offer a retry up to once. After 2
			// hardware errors, degrade to candidate-only. Chunks captured so far
			// are preserved in interviewerChunksRef for stopInterviewerRecordingAndUpload
			// to salvage; we null the recorder ref so it knows to do that path.
			recorder.onerror = () => {
				micErrorCountRef.current += 1
				if (interviewerFlushTimerRef.current) {
					clearInterval(interviewerFlushTimerRef.current)
					interviewerFlushTimerRef.current = null
				}
				interviewerRecorderRef.current = null
				interviewerMicStreamRef.current?.getTracks().forEach((t) => t.stop())
				interviewerMicStreamRef.current = null
				if (currentViewRef.current === 'success') return
				// Silently ignore if the interviewer already declined or candidate opted out --
				// there is no recording to recover.
				if (interviewerDeclinedConsentRef.current || candidateOptedOutRef.current) return
				if (micErrorCountRef.current >= 2) {
					// Repeated hardware failure: degrade to candidate-only.
					void signalNoInterviewerAudio()
				} else {
					// First hardware error: show recovery overlay (mic-loss, not initial prompt).
					setInterviewerMicBannerVisible(true)
				}
			}
			recorder.start(1000)
			// Periodic cumulative re-upload — bounds worst-case data loss to ~20 s
			interviewerFlushTimerRef.current = setInterval(() => {
				void flushInterviewerAudio({ final: false })
			}, INTERVIEWER_FLUSH_MS)
		} catch {
			// getUserMedia failed after mic was granted at the gate, or on a retry after
			// mic-loss recovery. The gate is the only place the initial decision is made,
			// so no banner here -- just signal candidate-only recording.
			void signalNoInterviewerAudio()
		}
	}, [isRemoteMode, lobbyId, previewMode, signalNoInterviewerAudio, flushInterviewerAudio])

	const stopInterviewerRecordingAndUpload = useCallback(async () => {
		if (recordingFinalizedRef.current) return  // pagehide beacon already fired
		recordingFinalizedRef.current = true

		// Stop the periodic flush timer before touching the recorder
		if (interviewerFlushTimerRef.current) {
			clearInterval(interviewerFlushTimerRef.current)
			interviewerFlushTimerRef.current = null
		}

		const recorder = interviewerRecorderRef.current
		interviewerMicStreamRef.current?.getTracks().forEach((t) => t.stop())
		interviewerMicStreamRef.current = null

		if (!recorder) {
			// Recorder was cleared (onerror) or never started — chunks may still exist
			await flushInterviewerAudio({ final: true })
			return
		}

		if (recorder.state === 'inactive') {
			interviewerRecorderRef.current = null
			await flushInterviewerAudio({ final: true })
			return
		}

		// Active recorder: stop it and wait for all remaining data before the final flush
		await new Promise<void>((resolve) => {
			recorder.addEventListener('stop', () => {
				interviewerRecorderRef.current = null
				resolve()
			}, { once: true })
			try { recorder.stop() } catch { resolve() }
		})

		await flushInterviewerAudio({ final: true })
	}, [flushInterviewerAudio])

	// Cleanup recorder on unmount.
	useEffect(() => {
		return () => {
			if (interviewerFlushTimerRef.current) {
				clearInterval(interviewerFlushTimerRef.current)
			}
			try {
				if (interviewerRecorderRef.current && interviewerRecorderRef.current.state !== 'inactive') {
					interviewerRecorderRef.current.stop()
				}
			} catch { /* noop */ }
			interviewerMicStreamRef.current?.getTracks().forEach((t) => t.stop())
		}
	}, [])

	// ── Auto-end timers ──────────────────────────────────────────────────────────
	// Trigger 1: 30 min inactivity (after all 4 scores filled)
	// Trigger 2: 2 h since last score change (regardless of activity, after all 4 scores filled)
	const lastActivityAtRef = useRef(Date.now())
	const lastScoreChangedAtRef = useRef(Date.now())
	const autoEndFiredRef = useRef(false)

	// Track score changes to reset the 2h stale clock
	useEffect(() => {
		lastScoreChangedAtRef.current = Date.now()
	}, [scores])

	// Track view changes as activity
	useEffect(() => {
		lastActivityAtRef.current = Date.now()
	}, [currentView])

	// DOM activity listeners (mousemove, keydown, etc.)
	useEffect(() => {
		const bump = () => { lastActivityAtRef.current = Date.now() }
		const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const
		for (const ev of events) document.addEventListener(ev, bump, { passive: true })
		return () => { for (const ev of events) document.removeEventListener(ev, bump) }
	}, [])

	// Auto-submit helper shared by both triggers
	const autoEndSession = useCallback(async () => {
		if (autoEndFiredRef.current || !lobbyId || !resolvedCaseId) return
		if (Object.values(scores).some((v) => v === 0)) return
		autoEndFiredRef.current = true

		try {
			await apiPost('/api/evaluations', {
				lobbyId,
				caseId: resolvedCaseId,
				scores: {
					structure: scores.structure,
					understanding: scores.understanding,
					delivery: scores.delivery,
					creativity: scores.creativity,
				},
				notes,
			})
		} catch {
			// Non-fatal — still signal the candidate
		}

		if (isLocalMode) {
			try {
				localStorage.setItem(
					'compendium-session-ended',
					JSON.stringify({ caseId: resolvedCaseId, lobbyId, endedAt: Date.now() }),
				)
			} catch { }
		}
		if (draftKey) { try { localStorage.removeItem(draftKey) } catch { } }
		// Stop and upload the interviewer's mic recording (remote dual-mic).
		void stopInterviewerRecordingAndUpload()

		if (isLocalMode) {
			window.close()
		} else {
			// Remote: no window to close; route to success view.
			setCurrentView('success')
		}
	}, [isLocalMode, lobbyId, resolvedCaseId, scores, notes, draftKey, stopInterviewerRecordingAndUpload])

	// Trigger 1: check every 60s for 30min inactivity
	useEffect(() => {
		if (!lobbyId || previewMode) return
		const id = setInterval(() => {
			const allRated = Object.values(scores).every((v) => v > 0)
			if (!allRated) return
			if (Date.now() - lastActivityAtRef.current > 30 * 60 * 1000) {
				void autoEndSession()
			}
		}, 60_000)
		return () => clearInterval(id)
	}, [lobbyId, previewMode, scores, autoEndSession])

	// Trigger 2: check every 5min for 2h score stale
	useEffect(() => {
		if (!lobbyId || previewMode) return
		const id = setInterval(() => {
			const allRated = Object.values(scores).every((v) => v > 0)
			if (!allRated) return
			if (Date.now() - lastScoreChangedAtRef.current > 2 * 60 * 60 * 1000) {
				void autoEndSession()
			}
		}, 5 * 60_000)
		return () => clearInterval(id)
	}, [lobbyId, previewMode, scores, autoEndSession])
	// ── End auto-end timers ───────────────────────────────────────────────────

	const [submitError, setSubmitError] = useState('')
	// Locked-by-default review screen: the interviewer fills scores/notes
	// during the case (sidebar in CaseInterviewerMaster), then this view
	// confirms what they have before submission. Toggle to false to edit
	// in place; submit finalizes from either mode.
	const [editingFeedback, setEditingFeedback] = useState(false)

	const normalizedTitle = useMemo(() => (caseData?.title ?? '').trim().toLowerCase(), [caseData?.title])
	const caseTypeLabel = useMemo(() => (caseData?.caseType ?? caseData?.case_type ?? 'General').trim(), [
		caseData?.caseType,
		caseData?.case_type,
	])

	const companyLabel = useMemo(() => {
		const explicit = caseData?.company?.trim()
		if (!explicit) return 'Client Not Specified'
		if (/^(by (the )?)?author(s)?$/i.test(explicit)) return 'By the Authors'
		if (/^accenture( strategy)?$/i.test(explicit)) return 'Accenture Strategy'
		return explicit
	}, [caseData?.company])
	const roundLabel = useMemo(() => {
		const explicit = caseData?.round?.trim()
		if (explicit) return explicit
		return 'Round Not Specified'
	}, [caseData?.round])

	const industryLabel = useMemo(() => (caseData?.industry ?? 'General').trim(), [caseData?.industry])
	const difficultyLabel = useMemo(() => (caseData?.difficulty ?? 'Unknown').trim(), [caseData?.difficulty])
	const difficultyLevel = useMemo(() => {
		const value = difficultyLabel.toLowerCase()
		if (value.includes('easy') || value.includes('beginner')) return 1
		if (value.includes('medium') || value.includes('intermediate')) return 2
		if (value.includes('hard') || value.includes('advanced') || value.includes('partner')) return 3
		return 0
	}, [difficultyLabel])

	const parsedFramework = useMemo(() => parseFramework(caseData?.framework?.trim() ?? ''), [caseData?.framework])
	const transcriptDisplayLines = useMemo(
		() => buildTranscriptDisplayLines(parsedFramework.transcriptLines),
		[parsedFramework.transcriptLines],
	)
	const isBankingOnYou = normalizedTitle.includes('banking on you')
	const documentTextWidthClass = isBankingOnYou ? 'max-w-[68rem] xl:max-w-[70rem]' : 'max-w-[68rem]'
	const frameworkWidthClass = isBankingOnYou ? 'mx-auto max-w-[68rem] xl:max-w-[70rem]' : 'mx-auto max-w-3xl'
	const documentPromptClass = 'text-[1.9rem] leading-[1.34] tracking-[0.003em] text-[#2d2520]'
	const promptLines = useMemo(
		() =>
			(caseData?.prompt ?? '')
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(Boolean),
		[caseData?.prompt],
	)

	const closeOrExit = () => {
		window.open('', '_self')
		window.close()
		setTimeout(() => {
			if (!document.hidden) {
				router.replace('/')
			}
		}, 300)
	}

	useEffect(() => {
		const fetchData = async () => {
			setLoading(true)
			setLoadError('')
			setNotFound(false)
			try {
				const resolvedParams = await params
				const caseId = resolvedParams.id
				setResolvedCaseId(caseId)
				const cacheKey = `compendium-case-v9-${caseId}`
				const cachedValue = localStorage.getItem(cacheKey)
				let hasValidCache = false
				if (cachedValue) {
					try {
						const parsed = JSON.parse(cachedValue) as CaseDocument
						if (parsed && typeof parsed.title === 'string') {
							setCaseData(parsed)
							setLoading(false)
							hasValidCache = true
						}
					} catch {
						localStorage.removeItem(cacheKey)
					}
				}

				// Offline with cached data — show case read-only, skip auth + Firestore
				if (!navigator.onLine && hasValidCache) {
					return
				}

				if (!previewMode && !lobbyId) {
					const user = await waitForAuthUser()
					if (!user) {
						router.replace(`/login?redirect=${encodeURIComponent(`/case/${caseId}/interviewer`)}`)
						return
					}
				}

				const caseSnapshot = await withTimeout(getDoc(caseDoc(caseId)), 15000)
				if (caseSnapshot.exists()) {
					const liveCase = caseSnapshot.data() as CaseDocument
					setCaseData(liveCase)
					localStorage.setItem(cacheKey, JSON.stringify(liveCase))
				} else {
					setCaseData(null)
					setNotFound(true)
				}
			} catch (error) {
				// If we already have cached data showing, swallow Firestore errors silently
				if (caseData) return
				const message = error instanceof Error ? error.message : 'Unable to load case.'
				if (message.includes('Missing or insufficient permissions')) {
					setLoadError('Case access is blocked by Firebase rules for this route.')
				} else {
					setLoadError(message)
				}
			} finally {
				setLoading(false)
			}
		}
		fetchData()
	}, [lobbyId, params, previewMode, reloadTick, router])

	// Signal to the candidate workspace that the interviewer case window is open
	// (or closed). The workspace tab picks these up via 'storage' events.
	// Only relevant for local (same-device) sessions where both tabs share localStorage.
	// pagehide fires when the page is actually being torn down (after the user
	// confirms the native beforeunload dialog), so it's the right place to mark
	// the window closed. beforeunload is handled separately below as the guard.
	useEffect(() => {
		if (!lobbyId || previewMode) return
		const markActive = () =>
			localStorage.setItem('compendium-interviewer-window', JSON.stringify({ lobbyId, active: true, ts: Date.now() }))
		const markClosed = () => {
			// Only signal closed if the session hasn't been deliberately ended —
			// handleSubmitFeedback writes compendium-session-ended before close.
			const ended = localStorage.getItem('compendium-session-ended')
			if (ended) return
			localStorage.setItem('compendium-interviewer-window', JSON.stringify({ lobbyId, active: false, ts: Date.now() }))
		}
		markActive()
		window.addEventListener('pagehide', markClosed)
		return () => {
			window.removeEventListener('pagehide', markClosed)
		}
	}, [lobbyId, previewMode])

	// ── Replace case handler ─────────────────────────────────────────────────────
	const handleReplaceCase = async () => {
		if (!lobbyId || isActioning) return
		setIsActioning(true)
		if (isLocalMode) {
			// Local: signal the candidate workspace via localStorage so the
			// interviewer-window-closed overlay is suppressed when this tab's
			// pagehide fires active:false. Remote: no localStorage cross-device.
			localStorage.setItem('compendium-session-replacing', JSON.stringify({ lobbyId, ts: Date.now() }))
		}
		try {
			await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/replace`, {})
		} catch {
			// Non-fatal — Firestore update may have already happened; navigate anyway.
		}
		if (draftKey) localStorage.removeItem(draftKey)
		// Clear the old session-start key so the repository page doesn't show
		// the "Session still going" overlay when the interviewer arrives to pick a new case.
		localStorage.removeItem('compendium-session-start')
		const sessionMode = searchParams.get('sessionMode') ?? 'local'
		router.replace(
			`/repository?mode=select&lobby=${lobbyId}&sessionMode=${sessionMode}` +
			`&prevCaseId=${encodeURIComponent(resolvedCaseId ?? '')}` +
			`&prevCaseName=${encodeURIComponent(caseData?.title ?? '')}`,
		)
	}

	// ── Cancel session handler ───────────────────────────────────────────────────
	const handleCancelSession = async () => {
		if (!lobbyId || isActioning) return
		setIsActioning(true)
		if (isLocalMode) {
			// Local: signal the candidate workspace via localStorage so the
			// interviewer-window-closed overlay is suppressed. Remote: no-op cross-device.
			localStorage.setItem('compendium-session-cancelled', JSON.stringify({ lobbyId, ts: Date.now() }))
		}
		try {
			await apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/cancel`, {})
		} catch {
			// Non-fatal.
		}
		if (draftKey) localStorage.removeItem(draftKey)
		// Navigate back to the interviewer controls lobby for this session so they
		// can start fresh (reopen candidate link, pick a new case, etc.).
		const mode = searchParams.get('sessionMode') ?? 'local'
		router.replace(`/lobby/${encodeURIComponent(lobbyId)}?role=interviewer&mode=${mode}`)
	}

	// ── Back-button guard ────────────────────────────────────────────────────────
	// Push a single dummy history entry on mount so the browser back button fires
	// popstate instead of navigating away. Only active on the case view.
	const backGuardPushedRef = useRef(false)
	useEffect(() => {
		if (!lobbyId || previewMode || backGuardPushedRef.current) return
		backGuardPushedRef.current = true
		history.pushState({ backGuard: true }, '', window.location.href)
	}, [lobbyId, previewMode])

	// ── Candidate tab heartbeat poll (split-screen only) ────────────────────────
	// Heartbeat older than the stale threshold, after we've seen the tab alive,
	// means it closed unexpectedly.
	useEffect(() => {
		if (!isLocalMode || !lobbyId || previewMode || currentView === 'success') return
		const interval = setInterval(() => {
			if (sessionEndedForLobby(lobbyId) || isCandidateClosedDismissed(lobbyId)) {
				setCandidateTabClosed(false)
				return
			}
			const beat = readCandidateBeat(lobbyId)
			if (!beat) return
			if (beat.url) candidateTabUrlRef.current = beat.url
			const age = Date.now() - beat.ts
			if (age < CANDIDATE_TAB_STALE_MS) {
				candidateWasAliveRef.current = true
				setCandidateTabClosed(false)
			} else if (candidateWasAliveRef.current) {
				setCandidateTabClosed(true)
			}
		}, 1000)
		return () => clearInterval(interval)
	}, [isLocalMode, lobbyId, previewMode, currentView])

	useEffect(() => {
		if (currentView !== 'case' || !lobbyId || previewMode) return
		const onPopstate = (e: PopStateEvent) => {
			// Re-push so the user stays on this page until they confirm
			history.pushState({ backGuard: true }, '', window.location.href)
			// If the eval overlay is open, back button just closes it
			if (showEvalOverlayRef.current) {
				closeEvalOverlay()
				return
			}
			if (e.state && typeof e.state === 'object' && 'backGuard' in e.state) {
				setShowBackGuardToast(true)
			} else {
				setShowBackGuardToast(true)
			}
		}
		const onKeyDown = (e: KeyboardEvent) => {
			const isAltLeft = e.altKey && e.key === 'ArrowLeft'
			const isCmdBracket = (e.metaKey || e.ctrlKey) && e.key === '['
			if (isAltLeft || isCmdBracket) {
				e.preventDefault()
				setShowBackGuardToast(true)
			}
		}
		window.addEventListener('popstate', onPopstate)
		window.addEventListener('keydown', onKeyDown)
		return () => {
			window.removeEventListener('popstate', onPopstate)
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [currentView, lobbyId, previewMode])

	// ── Window close guard ───────────────────────────────────────────────────────
	// The browser-level shortcut Cmd+W and the window X button CANNOT be blocked
	// by a custom overlay — the browser tears the page down before React can
	// render. The only sanctioned warning is the native beforeunload dialog
	// ("Changes you made may not be saved"). We fire that here.
	//
	// If the user cancels that native dialog (chooses to stay), the page never
	// unloads and becomes visible/focused again — we detect that and show our
	// own timed top-right toast reminding them to submit before closing.
	const closeAttemptRef = useRef(false)
	useEffect(() => {
		if (!lobbyId || previewMode) return
		let armed = false
		const armTimer = setTimeout(() => { armed = true }, 4000)

		const shouldBlock = () => {
			if (!armed) return false
			// Remote: localStorage keys are never written across devices.
			// Use the current view as the resolved signal instead.
			if (!isLocalMode) {
				return currentViewRef.current !== 'success'
			}
			const ended = localStorage.getItem('compendium-session-ended')
			const replacing = localStorage.getItem('compendium-session-replacing')
			const cancelled = localStorage.getItem('compendium-session-cancelled')
			return !ended && !replacing && !cancelled
		}

		// Native dialog: the only thing that actually stops X / Cmd+W.
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (!shouldBlock()) return
			closeAttemptRef.current = true
			e.preventDefault()
			e.returnValue = ''
			return ''
		}

		// User cancelled the native dialog and came back — show our reminder toast.
		const onVisibility = () => {
			if (document.visibilityState !== 'visible') return
			if (!closeAttemptRef.current) return
			closeAttemptRef.current = false
			if (!shouldBlock()) return
			setShowCloseWarning(true)
		}
		const onFocus = () => {
			if (!closeAttemptRef.current) return
			closeAttemptRef.current = false
			if (!shouldBlock()) return
			setShowCloseWarning(true)
		}

		window.addEventListener('beforeunload', onBeforeUnload)
		document.addEventListener('visibilitychange', onVisibility)
		window.addEventListener('focus', onFocus)
		return () => {
			clearTimeout(armTimer)
			window.removeEventListener('beforeunload', onBeforeUnload)
			document.removeEventListener('visibilitychange', onVisibility)
			window.removeEventListener('focus', onFocus)
		}
	}, [lobbyId, previewMode])

	// Legacy /case/[id]/interviewer?preview=1 links → bounce to the clean /case/[slug] URL.
useEffect(() => {
  if (forcePreview || !previewMode || !caseData) return
  const stored = (caseData as { slug?: string }).slug
  const slug = (stored && stored.trim()) || slugifyCase(caseData.title)
  router.replace(`/case/${slug}`)
}, [forcePreview, previewMode, caseData, router])

useEffect(() => {
  if (loading || loadError || caseData || !notFound) return
  const repoUrl = lobbyId
    ? `/repository?mode=select&lobby=${lobbyId}&sessionMode=${searchParams.get('sessionMode') ?? 'local'}&caseError=not_found`
    : `/repository?caseError=not_found`
  router.replace(repoUrl)
}, [loading, loadError, caseData, notFound, lobbyId, searchParams, router])

	const handleSubmitFeedback = async (opts?: { force?: boolean }) => {
		if (!resolvedCaseId || !caseData) return
		if (!opts?.force && Object.values(scores).some((value) => value === 0)) {
			setSubmitError('Please rate all 4 criteria before submitting.')
			return
		}
		setSubmitting(true)
		setSubmitError('')
		setOverlaySubmitError('')

		// For the overlay flow, skip the client-side auth check entirely —
		// the API validates auth on its own. waitForAuthUser() can time out
		// mid-session and block the submit silently.
		if (!showEvalOverlay) {
			const interviewerUser = await waitForAuthUser()
			if (!interviewerUser) {
				setSubmitting(false)
				router.push(`/login?redirect=${encodeURIComponent(`/case/${resolvedCaseId}/interviewer`)}`)
				return
			}
		}

		try {
			await apiPost('/api/evaluations', {
				lobbyId: lobbyId ?? null,
				caseId: resolvedCaseId,
				scores: {
					structure: scores.structure === 0 ? undefined : scores.structure,
					understanding: scores.understanding === 0 ? undefined : scores.understanding,
					delivery: scores.delivery === 0 ? undefined : scores.delivery,
					creativity: scores.creativity === 0 ? undefined : scores.creativity,
				},
				notes,
			})
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Unable to save feedback.'
			if (showEvalOverlay) {
				setOverlaySubmitError(msg)
			} else {
				setSubmitError(msg)
			}
			setSubmitting(false)
			return
		}

		if (isLocalMode) {
			// Local mode: signal the candidate's workspace tab on the same device
			// that the interviewer has submitted. Remote: /api/evaluations already
			// sets status:'completed' on the session doc, which the candidate's
			// onSnapshot picks up — no localStorage needed cross-device.
			try {
				localStorage.setItem(
					'compendium-session-ended',
					JSON.stringify({ caseId: resolvedCaseId, lobbyId, endedAt: Date.now() }),
				)
			} catch { }
		}
		if (draftKey) localStorage.removeItem(draftKey)
		// Clear the remote overlay — interviewer just submitted successfully.
		setCandidateEndedSession(false)
		// Stop and upload the interviewer's mic recording (remote dual-mic).
		// Fire-and-forget: the upload writes to the subcollection independently
		// of the eval submission; the Cloud Function merges both tracks after.
		void stopInterviewerRecordingAndUpload()

		// Overlay submits: try to close the tab; fall back to a success state
		// if the browser blocks window.close() (e.g. manually-opened tab in dev)
		if (showEvalOverlay) {
			window.open('', '_self')
			window.close()
			setTimeout(() => {
				setSubmitting(false)
				setOverlaySuccess(true)
			}, 400)
			return
		}

		if (lobbyId) {
			setCurrentView('success')
			setSubmitting(false)
			return
		}

		router.push('/dashboard')
		router.refresh()
		window.open('', '_self')
		window.close()
		setSubmitting(false)
	}

	if (loading) return <PlatformLoader message="Getting your case ready" />

	if (loadError) {
		return (
			<div className="min-h-screen bg-[#fff8f0] flex items-center justify-center p-6" style={{ fontFamily: "'Work Sans', sans-serif" }}>
				<div className="max-w-md w-full rounded-2xl border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.9)] shadow-[0_4px_24px_rgba(59,47,47,0.06)] p-8 flex flex-col items-center gap-4 text-center">
					<svg viewBox="0 0 64 64" fill="none" style={{ width: 28, height: 28, opacity: 0.22 }}>
						<path d="M16 10h32l-8 14 5 8-13 22-13-22 5-8-8-14Z" fill="#5C4033" />
						<path d="M32 24 27 32h10l-5-8Z" fill="#3D5A35" />
					</svg>
					<p className="text-[15px] font-medium text-[#3B2F2F]">Could not load this case</p>
					<p className="text-[12px] text-[#5C4033]/50 leading-relaxed">{loadError}</p>
					<div className="flex gap-3 mt-2">
						<button
							onClick={() => setReloadTick((current) => current + 1)}
							className="rounded-full bg-[#3D5A35] px-5 py-2 text-[12px] font-semibold text-white hover:bg-[#4a6e40] transition"
						>
							Try again
						</button>
						<button
							onClick={() => router.push('/repository')}
							className="rounded-full border border-[#3D5A35]/20 px-5 py-2 text-[12px] font-semibold text-[#5C4033]/70 hover:border-[#3D5A35]/40 transition"
						>
							Back to library
						</button>
					</div>
				</div>
			</div>
		)
	}

	if (!caseData) {
		return <PlatformLoader message="Heading back to the library" />
	}

	if (currentView === 'case') {
		if (previewMode) {
			return (
				<CasePreviewView
					caseData={caseData}
					previewMode={previewMode}
					transcriptDisplayLines={transcriptDisplayLines}
					parsedFramework={parsedFramework}
					promptLines={promptLines}
					caseTypeLabel={caseTypeLabel}
					industryLabel={industryLabel}
					difficultyLabel={difficultyLabel}
					companyLabel={companyLabel}
					roundLabel={roundLabel}
					isBankingOnYou={isBankingOnYou}
					frameworkTree={caseData.frameworkTree}
					additionalFrameworkTrees={caseData.additionalFrameworkTrees}
					visualisations={caseData.visualisations}
					recommendationsTable={caseData.recommendationsTable}
					abbreviations={caseData?.abbreviations}
					ForumSection={resolvedCaseId ? <CaseForumSection caseId={resolvedCaseId} caseTitle={caseData!.title} /> : undefined}
				/>
			)
		}

		if (!caseData) return null

		// Old preview URL is mid-redirect to /case/[slug]; show the loader instead of the old view.
if (previewMode && !forcePreview) {
  return <PlatformLoader />
}

		return (
			<>
				<CaseInterviewerMaster
					caseData={caseData}
					transcriptDisplayLines={transcriptDisplayLines}
					parsedFramework={parsedFramework}
					promptLines={promptLines}
					caseTypeLabel={caseTypeLabel}
					industryLabel={industryLabel}
					difficultyLabel={difficultyLabel}
					companyLabel={companyLabel}
					roundLabel={roundLabel}
					frameworkTree={caseData.frameworkTree}
					additionalFrameworkTrees={caseData.additionalFrameworkTrees}
					visualisations={caseData.visualisations}
					recommendationsTable={caseData.recommendationsTable}
					abbreviations={caseData.abbreviations}
					notes={notes}
					setNotes={setNotes}
					scores={scores}
					setScores={setScores}
					onEndCase={() => { setShowEvalOverlay(true); setEditingOverlay(false) }}
					onReplaceCase={lobbyId && !previewMode ? () => setShowReplaceCaseConfirm(true) : undefined}
					onCancelSession={lobbyId && !previewMode ? () => setShowCancelConfirm(true) : undefined}
				/>

				{/* Back-button guard toast (top-right LobbyOverlay) */}
				{showBackGuardToast && !micGuardShowing && (
					<LobbyOverlay
						type="warning"
						icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>}
						title="Heading back?"
						body="You can swap the case, or cancel the session entirely."
						actionLabel="Replace case"
						onAction={() => { setShowBackGuardToast(false); setShowReplaceCaseConfirm(true) }}
						secondaryActionLabel="Cancel session"
						onSecondaryAction={() => { setShowBackGuardToast(false); setShowCancelConfirm(true) }}
						onDismiss={() => setShowBackGuardToast(false)}
					/>
				)}

				{/* Candidate tab closed (split-screen) */}
				{candidateTabClosed && !micGuardShowing && lobbyId && (
					<LobbyOverlay
						type="warning"
						icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><line x1="2" y1="2" x2="22" y2="22"/></svg>}
						title="Candidate tab closed"
						body="No recording is happening right now. Reopen their tab to start capturing audio again, or carry on without it."
						actionLabel="Reopen candidate tab"
						onAction={() => {
							const url = candidateTabUrlRef.current ?? `/lobby/${lobbyId}?mode=local`
							openCandidateTab(lobbyId, url)
							setCandidateTabClosed(false)
						}}
						secondaryActionLabel="Continue without recording"
						onSecondaryAction={() => {
							dismissCandidateClosedForSession(lobbyId)
							setCandidateTabClosed(false)
						}}
						onDismiss={() => setCandidateTabClosed(false)}
					/>
				)}

				{/* Window close — timed top-right toast shown after the user cancels
				    the native beforeunload dialog and returns to the page. */}
				{showCloseWarning && !micGuardShowing && (
					<LobbyOverlay
						type="warning"
						icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
						title="You tried to close this"
						body="Any ratings you have not submitted will be gone. Hit submit before closing."
						autoDismissMs={7000}
						onDismiss={() => setShowCloseWarning(false)}
					/>
				)}

				{/* Mic blocked — split-screen shares the candidate's mic permission, so
				    a block here breaks the candidate's recording. This is the active
				    case view; once the interviewer submits, the success view (a
				    separate branch) renders without the guard since recording is done. */}
				<MicGuardOverlay
					active={isLocalMode && !previewMode}
					lobbyId={lobbyId}
					onShowingChange={setMicGuardShowing}
				/>

				{/* Interviewer mic recovery -- only for mic LOSS after a previously-granted
				    mic drops mid-session. Not shown for the initial decision (the gate
				    handles that). Guard disengages once upload has begun. */}
				{isRemoteMode && interviewerMicBannerVisible && !micGuardShowing && interviewerUploadState === 'idle' && (
					<LobbyOverlay
						type="warning"
						icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>}
						title="Looks like your mic dropped"
						body="Your mic just cut out, so your side stopped recording. Turn it back on and tap Allow mic to keep going, or skip and we'll just record the candidate. Either way the case keeps running."
						actionLabel="Allow mic"
						onAction={async () => {
							bannerFromPermissionRef.current = false
							setInterviewerMicBannerVisible(false)
							await startInterviewerRecording()
						}}
						secondaryActionLabel="Skip recording"
						onSecondaryAction={async () => {
							bannerFromPermissionRef.current = false
							setInterviewerMicBannerVisible(false)
							try { if (lobbyId) sessionStorage.setItem(`compendium-interviewer-noconsent-${lobbyId}`, '1') } catch { /* quota */ }
							interviewerDeclinedConsentRef.current = true
							await signalNoInterviewerAudio()
						}}
						onDismiss={async () => {
							// Guard: onSecondaryAction already ran if the user clicked "Skip recording",
							// and LobbyOverlay always fires dismiss() after any action. Return early
							// so we don't double-signal signalNoInterviewerAudio.
							if (interviewerDeclinedConsentRef.current) return
							bannerFromPermissionRef.current = false
							setInterviewerMicBannerVisible(false)
							try { if (lobbyId) sessionStorage.setItem(`compendium-interviewer-noconsent-${lobbyId}`, '1') } catch { /* quota */ }
							interviewerDeclinedConsentRef.current = true
							await signalNoInterviewerAudio()
						}}
					/>
				)}

				{/* A3/D10 — Remote mode: candidate ended the session.
				    Firestore status:'completed' detected via onSnapshot while the
				    interviewer hasn't submitted feedback yet. Prompt to submit now. */}
				{isRemoteMode && candidateEndedSession && !micGuardShowing && (
					<LobbyOverlay
						type="warning"
						icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
						title="Candidate ended the session"
						body={Object.values(scores).some((v) => v > 0)
							? "Your candidate wrapped up. Submit your ratings to complete the evaluation — or skip and it'll be saved as pending for you to rate later."
							: "Your candidate wrapped up before you rated the case. Submit feedback now or it will be saved as pending."}
						actionLabel="Submit feedback"
						onAction={() => { setCandidateEndedSession(false); setCurrentView('feedback') }}
						secondaryActionLabel="Skip for now"
						onSecondaryAction={() => { setCandidateEndedSession(false); setCurrentView('success') }}
						onDismiss={() => setCandidateEndedSession(false)}
					/>
				)}

				{/* Keyframes for centered overlay animations */}
				<style>{`
					@keyframes ixo-scrim-in { from { opacity: 0 } to { opacity: 1 } }
					@keyframes ixo-card-in { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
					@keyframes ixo-card-out { from { opacity: 1; transform: translateY(0) scale(1) } to { opacity: 0; transform: translateY(6px) scale(0.98) } }
				`}</style>

				{/* Replace case — centered confirmation overlay */}
				{showReplaceCaseConfirm && (
					<div
						style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Work Sans', sans-serif" }}
					>
						{/* Scrim */}
						<div style={{ position: 'absolute', inset: 0, background: 'rgba(69,58,42,0.08)', backdropFilter: 'blur(2.5px)', WebkitBackdropFilter: 'blur(2.5px)', animation: 'ixo-scrim-in 0.4s ease forwards' }} />
						{/* Card */}
						<div
							style={{ position: 'relative', zIndex: 1, width: 'min(320px, calc(100vw - 48px))', borderRadius: '16px', border: '1px solid rgba(180,138,87,0.28)', background: 'rgba(255,248,240,0.62)', backdropFilter: 'blur(48px) saturate(2.2) brightness(1.04)', WebkitBackdropFilter: 'blur(48px) saturate(2.2) brightness(1.04)', boxShadow: '0 4px 24px rgba(196,168,130,0.18), 0 1px 4px rgba(59,47,47,0.06), inset 0 1px 0 rgba(255,255,255,0.82)', overflow: 'hidden', animation: 'ixo-card-in 0.38s cubic-bezier(0.22,1,0.36,1) forwards' }}
						>
							{/* Top accent */}
							<div style={{ height: '2px', background: 'linear-gradient(90deg, #92400e 0%, rgba(146,64,14,0.12) 100%)' }} />
							<div style={{ padding: '20px 18px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
								{/* Header */}
								<div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
									<div style={{ width: '26px', height: '26px', flexShrink: 0, borderRadius: '999px', background: 'rgba(146,64,14,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'lo-icon-breathe 3s ease-in-out infinite' }}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
											<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
										</svg>
									</div>
									<div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
										<p style={{ fontSize: '12px', fontWeight: 600, color: '#3B2F2F', lineHeight: 1.3, letterSpacing: '-0.01em' }}>Replace this case?</p>
										<p style={{ fontSize: '11px', color: 'rgba(92,64,51,0.62)', lineHeight: 1.45 }}>This wraps the current session and takes you back to the library. The candidate will wait while you pick a new one.</p>
									</div>
									<button type="button" onClick={() => setShowReplaceCaseConfirm(false)} style={{ flexShrink: 0, marginTop: '1px', padding: '4px', borderRadius: '999px', border: 'none', background: 'transparent', color: 'rgba(92,64,51,0.35)', cursor: 'pointer' }}>
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
									</button>
								</div>
								{/* Buttons */}
								<div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
									<button
										type="button"
										disabled={isActioning}
										onClick={() => void handleReplaceCase()}
										style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.02em', color: '#92400e', border: '1px solid rgba(146,64,14,0.22)', background: 'rgba(146,64,14,0.06)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)', borderRadius: '999px', padding: '4px 12px', cursor: isActioning ? 'not-allowed' : 'pointer', opacity: isActioning ? 0.6 : 1 }}
									>
										{isActioning ? 'Replacing...' : 'Replace case'}
									</button>
									<button
										type="button"
										disabled={isActioning}
										onClick={() => setShowReplaceCaseConfirm(false)}
										style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.02em', color: 'rgba(92,64,51,0.5)', border: '1px solid rgba(92,64,51,0.14)', background: 'rgba(92,64,51,0.04)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)', borderRadius: '999px', padding: '4px 12px', cursor: 'pointer' }}
									>
										Stay here
									</button>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Cancel session — centered confirmation overlay */}
				{showCancelConfirm && (
					<div
						style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Work Sans', sans-serif" }}
					>
						{/* Scrim */}
						<div style={{ position: 'absolute', inset: 0, background: 'rgba(69,58,42,0.08)', backdropFilter: 'blur(2.5px)', WebkitBackdropFilter: 'blur(2.5px)', animation: 'ixo-scrim-in 0.4s ease forwards' }} />
						{/* Card */}
						<div
							style={{ position: 'relative', zIndex: 1, width: 'min(320px, calc(100vw - 48px))', borderRadius: '16px', border: '1px solid rgba(127,29,29,0.22)', background: 'rgba(255,248,240,0.62)', backdropFilter: 'blur(48px) saturate(2.2) brightness(1.04)', WebkitBackdropFilter: 'blur(48px) saturate(2.2) brightness(1.04)', boxShadow: '0 4px 24px rgba(196,168,130,0.18), 0 1px 4px rgba(59,47,47,0.06), inset 0 1px 0 rgba(255,255,255,0.82)', overflow: 'hidden', animation: 'ixo-card-in 0.38s cubic-bezier(0.22,1,0.36,1) forwards' }}
						>
							{/* Top accent */}
							<div style={{ height: '2px', background: 'linear-gradient(90deg, #7f1d1d 0%, rgba(127,29,29,0.12) 100%)' }} />
							<div style={{ padding: '20px 18px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
								{/* Header */}
								<div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
									<div style={{ width: '26px', height: '26px', flexShrink: 0, borderRadius: '999px', background: 'rgba(127,29,29,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'lo-icon-shake 0.5s ease 0.4s both' }}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7f1d1d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
											<circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
										</svg>
									</div>
									<div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
										<p style={{ fontSize: '12px', fontWeight: 600, color: '#3B2F2F', lineHeight: 1.3, letterSpacing: '-0.01em' }}>Cancel this session?</p>
										<p style={{ fontSize: '11px', color: 'rgba(92,64,51,0.62)', lineHeight: 1.45 }}>This closes your window and sends the candidate back to the start. Nothing from this session gets saved.</p>
									</div>
									<button type="button" onClick={() => setShowCancelConfirm(false)} style={{ flexShrink: 0, marginTop: '1px', padding: '4px', borderRadius: '999px', border: 'none', background: 'transparent', color: 'rgba(92,64,51,0.35)', cursor: 'pointer' }}>
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
									</button>
								</div>
								{/* Buttons */}
								<div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
									<button
										type="button"
										disabled={isActioning}
										onClick={() => void handleCancelSession()}
										style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.02em', color: '#7f1d1d', border: '1px solid rgba(127,29,29,0.22)', background: 'rgba(127,29,29,0.06)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)', borderRadius: '999px', padding: '4px 12px', cursor: isActioning ? 'not-allowed' : 'pointer', opacity: isActioning ? 0.6 : 1 }}
									>
										{isActioning ? 'Cancelling...' : 'Yes, cancel it'}
									</button>
									<button
										type="button"
										disabled={isActioning}
										onClick={() => setShowCancelConfirm(false)}
										style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.02em', color: 'rgba(92,64,51,0.5)', border: '1px solid rgba(92,64,51,0.14)', background: 'rgba(92,64,51,0.04)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)', borderRadius: '999px', padding: '4px 12px', cursor: 'pointer' }}
									>
										Go back
									</button>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* ── End Case & Evaluate overlay ── */}
				{showEvalOverlay && (() => {
					const unratedCriteria = LIVE_EVALUATION_CRITERIA.filter(c => scores[c.id] === 0)
					const hasUnrated = unratedCriteria.length > 0
					return (
						<div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Work Sans', sans-serif" }}>
							{/* Scrim — clicking closes only in review state, not during edit or confirm */}
							<div
								style={{ position: 'absolute', inset: 0, background: 'rgba(36,26,16,0.48)', backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', animation: 'ixo-scrim-in 0.3s ease forwards' }}
								onClick={() => { if (!editingOverlay && !showUnratedConfirm) setShowEvalOverlay(false) }}
							/>
							{/* Card */}
							<div style={{ position: 'relative', zIndex: 1, width: 'min(420px, calc(100vw - 32px))', borderRadius: '22px', border: '1px solid rgba(61,90,53,0.18)', background: 'rgba(255,250,243,0.96)', backdropFilter: 'blur(40px) saturate(1.9)', WebkitBackdropFilter: 'blur(40px) saturate(1.9)', boxShadow: '0 12px 48px rgba(36,26,16,0.18), 0 2px 8px rgba(36,26,16,0.07), inset 0 1px 0 rgba(255,255,255,0.9)', overflow: 'hidden', animation: 'ixo-card-in 0.32s cubic-bezier(0.22,1,0.36,1) forwards' }}>
								{/* Green top accent */}
								<div style={{ height: '3px', background: 'linear-gradient(90deg, #3D5A35 0%, rgba(61,90,53,0.15) 100%)' }} />

								<style>{`
									.eo-range{-webkit-appearance:none;appearance:none;width:100%;height:16px;background:transparent;cursor:pointer}
									.eo-range:focus{outline:none}
									.eo-range::-webkit-slider-runnable-track{height:3px;border-radius:1px;background:rgba(92,64,51,0.15)}
									.eo-range::-moz-range-track{height:3px;border-radius:2px;background:rgba(92,64,51,0.15)}
									.eo-range::-moz-range-progress{height:3px;border-radius:2px;background:#3D5A35}
									.eo-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;margin-top:-6px;width:15px;height:15px;border-radius:50%;background:#3D5A35;box-shadow:0 1px 4px rgba(61,90,53,0.35),0 0 0 3px rgba(61,90,53,0.12)}
									.eo-range::-moz-range-thumb{width:15px;height:15px;border:none;border-radius:50%;background:#3D5A35;box-shadow:0 1px 4px rgba(61,90,53,0.35),0 0 0 3px rgba(61,90,53,0.12)}
									.eo-range.eo-nr::-webkit-slider-thumb{background:#efe8de;box-shadow:0 0 0 1.5px rgba(92,64,51,0.25)}
									.eo-range.eo-nr::-moz-range-thumb{background:#efe8de;box-shadow:0 0 0 1.5px rgba(92,64,51,0.25)}
									.eo-range.eo-nr::-moz-range-progress{background:transparent}
								`}</style>

								{/* Shared heading */}
								<div style={{ padding: '18px 22px 0' }}>
									<p style={{ margin: 0, fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.26em', color: '#3D5A35' }}>Final Evaluation</p>
								</div>

								{overlaySubmitError && (
									<div style={{ margin: '10px 22px 0', padding: '8px 12px', borderRadius: '8px', background: 'rgba(146,64,14,0.07)', border: '1px solid rgba(146,64,14,0.18)' }}>
										<p style={{ margin: 0, fontSize: '11.5px', color: '#92400e', lineHeight: 1.4 }}>{overlaySubmitError}</p>
									</div>
								)}

								{overlaySuccess ? (
									/* ── Success state (tab couldn't be closed by browser) ── */
									<div style={{ padding: '24px 22px 28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
										<div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(61,90,53,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
											<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
										</div>
										<p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#2e2318' }}>Evaluation submitted.</p>
										<p style={{ margin: 0, fontSize: '12px', color: 'rgba(92,64,51,0.6)', lineHeight: 1.5 }}>You can close this tab.</p>
									</div>
								) : showUnratedConfirm ? (
									/* ── Unrated confirmation state ── */
									<div style={{ padding: '16px 22px 22px' }}>
										<p style={{ margin: '12px 0 6px', fontSize: '14px', fontWeight: 600, color: '#2e2318', lineHeight: 1.35 }}>
											{unratedCriteria.length === 1 ? '1 criterion hasn\'t been rated.' : `${unratedCriteria.length} criteria haven't been rated.`}
										</p>
										<div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
											{unratedCriteria.map(c => (
												<div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
													<span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(146,64,14,0.55)', flexShrink: 0, display: 'inline-block' }} />
													<span style={{ fontSize: '12px', color: 'rgba(92,64,51,0.75)' }}>{c.label}</span>
												</div>
											))}
										</div>
										<p style={{ margin: '0 0 16px', fontSize: '12px', color: 'rgba(92,64,51,0.6)', lineHeight: 1.5 }}>Do you still want to submit? Unrated criteria will be left blank.</p>
										<div style={{ display: 'flex', gap: '8px' }}>
											<button
												type="button"
												disabled={submitting}
												onClick={() => void handleSubmitFeedback({ force: true })}
												style={{ flex: 1, borderRadius: '12px', background: '#3D5A35', color: '#efe8de', border: 'none', padding: '11px 16px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: "'Work Sans', sans-serif" }}
											>
												{submitting ? 'Submitting…' : 'Yes, Submit'}
											</button>
											<button
												type="button"
												onClick={() => { setShowUnratedConfirm(false); setEditingOverlay(true) }}
												style={{ flexShrink: 0, borderRadius: '12px', background: 'transparent', color: 'rgba(92,64,51,0.65)', border: '1px solid rgba(92,64,51,0.2)', padding: '11px 16px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', cursor: 'pointer', fontFamily: "'Work Sans', sans-serif" }}
											>
												Go Back &amp; Edit
											</button>
										</div>
										<button
											type="button"
											onClick={closeEvalOverlay}
											style={{ marginTop: '10px', width: '100%', background: 'none', border: 'none', padding: '4px', fontSize: '11px', color: 'rgba(92,64,51,0.4)', cursor: 'pointer', fontFamily: "'Work Sans', sans-serif" }}
										>
											← Back to session
										</button>
									</div>
								) : editingOverlay ? (
									/* ── State 2: Editing ── */
									<div style={{ padding: '14px 22px 22px' }}>
										<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
											{LIVE_EVALUATION_CRITERIA.map(c => {
												const score = scores[c.id]
												const rated = score > 0
												const pct = (score / 5) * 100
												return (
													<div key={c.id}>
														<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '1px' }}>
															<span style={{ fontSize: '12.5px', fontWeight: 600, color: '#2e2318' }}>{c.label}</span>
															<span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: rated ? '#3D5A35' : '#b8a898' }}>{rated ? `${score}/5` : 'NR'}</span>
														</div>
														<input
															type="range" min="0" max="5" step="0.5" value={score}
															onChange={e => setScores({ ...scores, [c.id]: parseFloat(e.target.value) })}
															className={`eo-range${rated ? '' : ' eo-nr'}`}
															style={rated ? { background: `linear-gradient(90deg,#3D5A35 ${pct}%,rgba(92,64,51,0.15) ${pct}%)`, height: '3px', borderRadius: '2px' } : undefined}
														/>
														<div style={{ marginTop: '2px', display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#b8a898' }}>
															<span style={{ fontStyle: 'italic' }}>NR</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
														</div>
													</div>
												)
											})}
										</div>

										<div style={{ marginTop: '14px', borderTop: '1px solid rgba(92,64,51,0.09)', paddingTop: '12px' }}>
											<p style={{ margin: '0 0 6px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'rgba(92,64,51,0.45)' }}>Detailed Notes</p>
											<NotesEditor
												value={notes}
												onChange={setNotes}
												placeholder="What did they do well? What should they improve?"
												style={{ width: '100%', minHeight: '72px', borderRadius: '10px', border: '1px solid rgba(92,64,51,0.13)', background: 'rgba(255,248,238,0.7)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.5, color: '#2e2318', fontFamily: "'Work Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
											/>
										</div>

										<div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
											<button
												type="button"
												disabled={submitting}
												onClick={() => {
													if (LIVE_EVALUATION_CRITERIA.some(c => scores[c.id] === 0)) {
														setShowUnratedConfirm(true)
													} else {
														void handleSubmitFeedback()
													}
												}}
												style={{ flex: 1, borderRadius: '12px', background: '#3D5A35', color: '#efe8de', border: 'none', padding: '11px 16px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.24em', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: "'Work Sans', sans-serif" }}
											>
												{submitting ? 'Submitting…' : 'Save & Submit'}
											</button>
											<button
												type="button"
												onClick={() => setEditingOverlay(false)}
												style={{ flexShrink: 0, borderRadius: '12px', background: 'transparent', color: 'rgba(92,64,51,0.65)', border: '1px solid rgba(92,64,51,0.2)', padding: '11px 16px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', cursor: 'pointer', fontFamily: "'Work Sans', sans-serif" }}
											>
												Cancel
											</button>
										</div>
										<p style={{ marginTop: '7px', textAlign: 'center', fontSize: '9.5px', color: 'rgba(92,64,51,0.35)' }}>Save &amp; Submit closes the case · Cancel returns to the review</p>
									</div>
								) : (
									/* ── State 1: Review (locked) ── */
									<div style={{ padding: '14px 22px 22px' }}>
										<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
											<button
												type="button"
												onClick={() => setEditingOverlay(true)}
												style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '999px', border: '1px solid rgba(92,64,51,0.18)', background: 'rgba(255,248,238,0.8)', color: 'rgba(92,64,51,0.62)', padding: '4px 13px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', cursor: 'pointer', fontFamily: "'Work Sans', sans-serif" }}
											>
												<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
													<path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
												</svg>
												Edit
											</button>
										</div>

										<div>
											{LIVE_EVALUATION_CRITERIA.map((c, idx) => {
												const score = scores[c.id]
												const isLast = idx === LIVE_EVALUATION_CRITERIA.length - 1
												return (
													<div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: isLast ? 'none' : '1px solid rgba(92,64,51,0.07)' }}>
														<span style={{ fontSize: '13px', fontWeight: 600, color: '#2e2318', flexShrink: 0 }}>{c.label}</span>
														<span style={{ flex: 1, display: 'block', borderBottom: '1px dashed rgba(92,64,51,0.16)', height: 0 }} />
														<span style={{ flexShrink: 0, fontSize: '14px', fontWeight: 700, color: score > 0 ? '#3D5A35' : '#b8a898' }}>
															{score > 0 ? <>{score}<span style={{ fontSize: '10px', fontWeight: 500, color: 'rgba(92,64,51,0.4)' }}>/5</span></> : 'NR'}
														</span>
													</div>
												)
											})}
										</div>

										<div style={{ marginTop: '16px', borderTop: '1px solid rgba(92,64,51,0.09)', paddingTop: '13px' }}>
											<p style={{ margin: '0 0 6px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'rgba(92,64,51,0.45)' }}>Detailed Notes</p>
											<div style={{ borderRadius: '10px', border: '1px solid rgba(92,64,51,0.1)', background: 'rgba(255,249,242,0.65)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.55, color: '#2e2318', minHeight: '42px' }}>
												{notes.trim() ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{notes}</p> : <p style={{ margin: 0, fontStyle: 'italic', color: 'rgba(92,64,51,0.35)' }}>No notes added.</p>}
											</div>
										</div>

										<button
											type="button"
											disabled={submitting}
											onClick={() => {
												if (hasUnrated) {
													setShowUnratedConfirm(true)
												} else {
													void handleSubmitFeedback()
												}
											}}
											style={{ marginTop: '16px', width: '100%', borderRadius: '12px', background: '#3D5A35', color: '#efe8de', border: 'none', padding: '13px 16px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, fontFamily: "'Work Sans', sans-serif", boxSizing: 'border-box', boxShadow: '0 4px 14px rgba(61,90,53,0.25), inset 0 1px 0 rgba(255,255,255,0.12)' }}
										>
											{submitting ? 'Submitting…' : 'Submit & Close Case'}
										</button>
										<button
											type="button"
											onClick={closeEvalOverlay}
											style={{ marginTop: '10px', width: '100%', background: 'none', border: 'none', padding: '4px', fontSize: '11px', color: 'rgba(92,64,51,0.4)', cursor: 'pointer', fontFamily: "'Work Sans', sans-serif" }}
										>
											← Back to session
										</button>
									</div>
								)}
							</div>
						</div>
					)
				})()}
			</>
		)

		// Legacy block start (never reached)
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const _legacyCaseData = caseData!
		const _noop = () => (
			<div className="min-h-screen bg-[#e7e0d5] text-[#2d2520] font-sans flex flex-col">

				{/* Minimal sticky nav */}
					<nav className="sticky top-0 z-50 flex items-center justify-between border-b border-[#d2c7b9] bg-[#ece6dd]/95 px-6 py-3 backdrop-blur-md md:px-8">
						<Link
							href="/repository"
							className="text-[11px] font-black uppercase tracking-[0.2em] text-[#5d4e45] transition hover:text-[#2b231f]"
						>
							← Exit Case
						</Link>
						{previewMode ? (
							<div className="border border-[#a48562] bg-[#dbcdbd] px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-[#4d3423]">
								Case Preview
							</div>
						) : (
							<div className="border border-[#b7b29f] bg-[#ece7de] px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-[#5d4e45]">
								Interviewer Mode
							</div>
						)}
					</nav>

					{/* Fluid document + narrower interviewer rail */}
					<div className="flex flex-1 flex-col md:flex-row">

						{/* Left column — flexible */}
						<div className="flex min-w-0 flex-col bg-[#ece7de] md:flex-1">

						{/* Editorial header */}
						<header className="border-b border-[#d7cdbf]/70 px-10 pb-8 pt-10 md:px-20">
							<div className="mx-auto max-w-4xl text-center">
								<h1 className="mb-4 font-serif text-[3.4rem] font-bold leading-[0.96] tracking-tight text-[#2d2520] md:text-[4.25rem]">
									{caseData!.title.trim()}
								</h1>
								{!isBankingOnYou && (
									<div className="mb-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[13px] font-bold uppercase tracking-[0.35em] text-[#4a3f38]">
										<span>{caseTypeLabel}</span>
										<span className="text-[#b7b29f]">|</span>
										<span>{industryLabel}</span>
										<span className="text-[#b7b29f]">|</span>
										<span>{difficultyLabel}</span>
										{companyLabel !== 'Client Not Specified' && (
											<>
												<span className="text-[#b7b29f]">|</span>
												<span>{companyLabel}</span>
											</>
										)}
									</div>
								)}
								<div className="relative mx-auto flex h-4 w-full max-w-[58rem] items-center justify-center md:max-w-[62rem]">
									<div className="h-[2px] w-full bg-[#3a2e26]" />
									<div
										className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 bg-[#3a2e26]"
										style={{ clipPath: 'polygon(0 50%, 45% 0, 100% 0, 100% 100%, 45% 100%)' }}
									/>
									<div
										className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 rotate-180 bg-[#3a2e26]"
										style={{ clipPath: 'polygon(0 50%, 45% 0, 100% 0, 100% 100%, 45% 100%)' }}
									/>
								</div>
							</div>
						</header>

						{/* Content body */}
						<div className="flex-1 px-6 py-14 md:px-8 lg:px-10 xl:px-12">
							{isBankingOnYou ? (
								<div className="mx-auto w-full max-w-[80rem] rounded-[2.25rem] border border-[#d8cec1] bg-[linear-gradient(180deg,rgba(244,239,232,0.88),rgba(239,232,223,0.86))] px-5 py-6 shadow-[0_36px_70px_-58px_rgba(60,45,35,0.45)] md:px-7 md:py-8 xl:max-w-[84rem]">
									<div className="flex items-start gap-4 xl:gap-6">
										<BankingOnYouMetaRail
											caseTypeLabel={caseTypeLabel}
											companyLabel={companyLabel}
											roundLabel={roundLabel}
											industryLabel={industryLabel}
											difficultyLevel={difficultyLevel}
											difficultyLabel={difficultyLabel}
										/>
										<div className="min-w-0 flex-1 border-l border-[#d7ccbe]/85 pl-5 md:pl-7">
											<div className="mx-auto flex max-w-[62rem] flex-col gap-14 xl:max-w-[65rem]">
											{previewMode && (
												<div className="border border-[#d4cabd] bg-[#f3ede4]/90 p-5 shadow-[0_18px_35px_-34px_rgba(58,45,35,0.5)]">
													<p className="text-xs font-black uppercase tracking-[0.15em] text-[#6b5a4d]">
														Read-Only Preview
													</p>
													<div className="mt-4">
														<button
															onClick={() => router.push('/practice')}
															className="border border-[#b8ab9d] bg-[#fdfbf8] px-5 py-2.5 text-sm font-bold text-[#4f3f34] transition hover:bg-[#ece4d9]"
														>
															Do This Case
														</button>
													</div>
												</div>
											)}

											{transcriptDisplayLines.length > 0 || promptLines.length > 0 ? (
												<section className="space-y-2.5">
													{promptLines.map((line, index) => (
														<RevealBlock key={`prompt-${line}-${index + 1}`} delay="delay-0">
															<TranscriptLine line={line} speaker="interviewer" />
														</RevealBlock>
													))}
													{transcriptDisplayLines.map((entry, index) => {
														const isHeading = /^[A-Z][A-Z0-9\s&'/-]{6,}$/.test(entry.text.trim())
														return (
															<RevealBlock key={`${entry.text}-${index}`} delay={isHeading ? 'delay-0' : 'delay-75'}>
																<TranscriptLine line={entry.text} speaker={entry.speaker} />
															</RevealBlock>
														)
													})}
												</section>
											) : (
												<p className="text-[16px] leading-8 text-[#2e2722]">No transcript provided.</p>
											)}
											</div>

											<div className="mx-auto mt-16 max-w-[62rem] xl:max-w-[65rem]">
												<BankingOnYouFramework recommendations={parsedFramework.recommendations} />
											</div>

											{previewMode && resolvedCaseId && (
												<div className="mx-auto mt-12 max-w-[62rem] xl:max-w-[65rem]">
													<CaseForumSection caseId={resolvedCaseId} caseTitle={caseData!.title} />
												</div>
											)}
										</div>
									</div>
								</div>
							) : (
								<>
									<div className={`mx-auto flex ${documentTextWidthClass} flex-col gap-12`}>
										{previewMode && (
											<div className="border-2 border-[#c9c1b6] bg-[#f2eee8] p-5">
												<p className="text-xs font-black uppercase tracking-[0.15em] text-[#6b5a4d]">
													Read-Only Preview
												</p>
												<div className="mt-4">
													<button
														onClick={() => router.push('/practice')}
														className="border border-[#b8ab9d] bg-[#fdfbf8] px-5 py-2.5 text-sm font-bold text-[#4f3f34] transition hover:bg-[#ece4d9]"
													>
														Do This Case
													</button>
												</div>
											</div>
										)}

										{caseData!.prompt && (
											<section>
												<p className={documentPromptClass}>{caseData!.prompt.trim()}</p>
											</section>
										)}

										{transcriptDisplayLines.length > 0 ? (
											<section className="space-y-2.5">
												{transcriptDisplayLines.map((entry, index) => {
													const isHeading = /^[A-Z][A-Z0-9\s&'/-]{6,}$/.test(entry.text.trim())
													return (
														<RevealBlock key={`${entry.text}-${index}`} delay={isHeading ? 'delay-0' : 'delay-75'}>
															<TranscriptLine line={entry.text} speaker={entry.speaker} />
														</RevealBlock>
													)
												})}
											</section>
										) : (
											<p className="text-[16px] leading-8 text-[#2e2722]">No transcript provided.</p>
										)}
									</div>

									<div className={`${frameworkWidthClass} mt-12`}>
										<DefaultFramework framework={parsedFramework} />
									</div>

									{previewMode && resolvedCaseId && (
										<div className="mx-auto mt-12 max-w-3xl">
											<CaseForumSection caseId={resolvedCaseId} caseTitle={caseData!.title} />
										</div>
									)}
								</>
							)}
						</div>
					</div>

						{/* Right sidebar — fixed, narrower live rail */}
						{!previewMode && (
							<aside className="flex w-full flex-col border-t border-[#d8cdc0] bg-[linear-gradient(180deg,#eee6da_0%,#e8dfd2_100%)] shadow-[-18px_0_42px_-44px_rgba(58,44,35,0.45)] md:sticky md:top-[49px] md:self-start md:w-[17.5rem] md:border-l md:border-t-0 lg:w-[18.5rem] xl:w-[19rem]">
							<style>{`
  .eval-range { -webkit-appearance:none; appearance:none; width:100%; height:18px; background:transparent; cursor:pointer; }
  .eval-range:focus { outline:none; }
  .eval-range::-webkit-slider-runnable-track { height:3px; border-radius:2px; background:rgba(92,64,51,0.16); }
  .eval-range::-moz-range-track { height:3px; border-radius:2px; background:rgba(92,64,51,0.16); }
  .eval-range::-moz-range-progress { height:3px; border-radius:2px; background:#3D5A35; }
  .eval-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; margin-top:-6px; width:15px; height:15px; border-radius:50%; background:#3D5A35; box-shadow:0 0 0 4px rgba(61,90,53,0.13); }
  .eval-range::-moz-range-thumb { width:15px; height:15px; border:none; border-radius:50%; background:#3D5A35; box-shadow:0 0 0 4px rgba(61,90,53,0.13); }
  .eval-range.is-nr::-webkit-slider-thumb { background:#FBF4EA; box-shadow:0 0 0 1.5px rgba(92,64,51,0.30); }
  .eval-range.is-nr::-moz-range-thumb { background:#FBF4EA; box-shadow:0 0 0 1.5px rgba(92,64,51,0.30); }
  .eval-range.is-nr::-moz-range-progress { background:transparent; }
`}</style>
								<div className="flex flex-1 flex-col gap-6 p-6 md:p-8">
									<section className="flex-shrink-0 border-b border-[#d8cdc0] pb-6">
										<div className="mb-3 flex items-center gap-3">
											<div className="h-2.5 w-2.5 rounded-full bg-[#7b5a3b]" />
											<h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#4a3f38]">
												Interviewer Notes
											</h3>
										</div>
										<NotesEditor
											value={notes}
											onChange={setNotes}
											placeholder="Record observations..."
											className="w-full rounded-[18px] border border-[#d5cabd] bg-[#f6efe5] p-4 text-[14px] italic leading-7 text-[#4a3f38] shadow-[inset_0_1px_2px_rgba(95,72,52,0.05)] transition-all placeholder:text-[#a09385] focus:border-[#4a3627] focus:outline-none focus:ring-2 focus:ring-[#4a3627]/10"
										/>
									</section>

									<section className="flex flex-col gap-4">
										<div className="border-b border-[#d8cdc0] pb-4">
											<h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#4a3f38]">
												Evaluation
											</h3>
										</div>
										<div className="space-y-5">
											{LIVE_EVALUATION_CRITERIA.map((criteria) => {
												const score = scores[criteria.id]
												const rated = score > 0
												const pct = (score / 5) * 100
												return (
													<div key={criteria.id}>
														<div className="flex items-center justify-between gap-3">
															<span className="text-[13px] font-semibold leading-5 text-[#5C4033]">
																{criteria.label}
															</span>
															{rated && (
																<span className="rounded-full border border-[#3D5A35]/35 bg-[rgba(174,208,161,0.22)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#3D5A35]">
																	{score}/5
																</span>
															)}
														</div>
														<div className="pb-1 pt-3">
															<input
																type="range"
																min="0"
																max="5"
																step="0.5"
																value={score}
																onChange={(e) =>
																	setScores({
																		...scores,
																		[criteria.id]: Number.parseFloat(e.target.value),
																	})
																}
																className={`eval-range${rated ? '' : ' is-nr'}`}
																style={
																	rated
																		? { background: `linear-gradient(90deg, #3D5A35 ${pct}%, rgba(92,64,51,0.16) ${pct}%)`, height: '3px', borderRadius: '2px' }
																		: undefined
																}
															/>
															<div className="mt-2 flex justify-between text-[9px] font-bold uppercase tracking-[0.12em] text-[#a99a87]">
																<span className="italic">NR</span>
																<span>1</span>
																<span>2</span>
																<span>3</span>
																<span>4</span>
																<span>5</span>
															</div>
														</div>
													</div>
												)
											})}
										</div>
									</section>

									<div className="mt-auto pt-4">
										<button
											onClick={() => setCurrentView('feedback')}
											className="w-full rounded-[18px] bg-[#3D5A35] py-4 text-[10px] font-bold uppercase tracking-[0.3em] text-[#efe8de] transition hover:bg-[#34502d]"
										>
											End Case & Evaluate
										</button>
									</div>
								</div>
							</aside>
						)}
				</div>
			</div>
		) // end _noop
	}

	if (previewMode) return null

	if (currentView === 'success') {
		const uploadDone =
			!isRemoteMode ||
			interviewerUploadState === 'uploaded' ||
			interviewerUploadState === 'upload_failed' ||
			interviewerUploadState === 'not_captured' ||
			interviewerUploadState === 'idle'
		const sessionRanWithoutRecording = candidateOptedOutRef.current
		const uploadStatusMessage = sessionRanWithoutRecording
			? 'Heads up - this session ran without recording, so there is no audio to upload. Your feedback is saved and that is all that is needed here.'
			: interviewerUploadState === 'uploading'
				? 'Uploading your recording - please keep this tab open for a moment.'
				: interviewerUploadState === 'uploaded'
					? 'Your recording uploaded successfully. The transcript will be ready in your dashboard shortly.'
					: interviewerUploadState === 'upload_failed'
						? "Your recording couldn't be uploaded. Only the candidate's audio will be available in the transcript."
						: interviewerUploadState === 'not_captured'
							? "Your microphone wasn't captured during this session. Only the candidate's audio will be available in the transcript."
							: null

		return (
			<div
				className="relative flex min-h-screen flex-col items-center justify-center bg-[#fff8f0] p-4 text-center antialiased"
				style={{ fontFamily: "'Work Sans', sans-serif", color: '#1e1b15' }}
			>
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(61,90,53,0.08),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(92,64,51,0.08),transparent_32%),linear-gradient(180deg,#fff8f0_0%,#fbf4ea_100%)]" />
				</div>
				<div className="relative z-10 w-full max-w-md rounded-2xl border border-[#b48a57]/16 bg-[rgba(255,248,240,0.78)] px-8 py-12 backdrop-blur" style={{ boxShadow: '0 6px 22px rgba(59,47,47,0.05)' }}>
					<div
						className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-[#3D5A35]/25 bg-[rgba(174,208,161,0.18)] text-[#3D5A35]"
					>
						<svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<h2 style={{ fontFamily: "'Newsreader', serif" }} className="text-4xl font-light tracking-tight text-[#453a2a]">
						Thank you
					</h2>
					<p className="mt-3 text-[13px] leading-relaxed text-[#5c4033]/68">
						Feedback submitted successfully.{' '}
						{uploadDone ? 'You can close this tab now.' : null}
					</p>

					{/* Remote-mode upload status */}
					{isRemoteMode && uploadStatusMessage && (
						<div className={`mt-4 rounded-xl border px-4 py-3 text-left text-[12px] leading-relaxed ${
							interviewerUploadState === 'uploading'
								? 'border-[#3D5A35]/20 bg-[rgba(174,208,161,0.12)] text-[#3D5A35]'
								: interviewerUploadState === 'uploaded'
									? 'border-[#3D5A35]/20 bg-[rgba(174,208,161,0.12)] text-[#3D5A35]'
									: 'border-[#b48a57]/22 bg-[rgba(180,138,87,0.07)] text-[#5c4033]/78'
						}`}>
							{interviewerUploadState === 'uploading' && (
								<span className="mb-1.5 flex items-center gap-2 font-semibold">
									<svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
									</svg>
									Uploading recording&hellip;
								</span>
							)}
							{uploadStatusMessage}
						</div>
					)}

					<button
						onClick={closeOrExit}
						className="mt-8 w-full rounded-full bg-[#3D5A35] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-[#34502d]"
						style={{ boxShadow: '0 6px 16px rgba(61,90,53,0.18), inset 0 1px 0 rgba(255,255,255,0.18)' }}
					>
						{interviewerUploadState === 'uploading' ? 'Please wait…' : 'Close Window'}
					</button>
				</div>
			</div>
		)
	}

	const allScored = LIVE_EVALUATION_CRITERIA.every((c) => scores[c.id] > 0)

	return (
		<div
			className="relative min-h-screen bg-[#fff8f0] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
			style={{ fontFamily: "'Work Sans', sans-serif", color: '#1e1b15' }}
		>
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(61,90,53,0.08),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(92,64,51,0.08),transparent_32%),linear-gradient(180deg,#fff8f0_0%,#fbf4ea_100%)]" />
			</div>

			<main className="relative z-10 mx-auto flex min-h-screen max-w-[760px] flex-col px-4 py-10 md:px-6 md:py-14">
				<button
					onClick={() => setCurrentView('case')}
					className="self-start text-[11px] font-medium uppercase tracking-[0.22em] text-[#5c4033]/55 transition hover:text-[#5c4033]"
				>
					← Back to Case Document
				</button>

				<header className="mt-6 flex items-start justify-between gap-4">
					<div>
						<span className="text-[10px] uppercase tracking-[0.32em] text-[#3D5A35]/55 font-semibold">
							Final Review
						</span>
						<h1
							style={{ fontFamily: "'Newsreader', serif" }}
							className="mt-2 text-4xl font-light leading-[0.96] tracking-tight text-[#453a2a] md:text-5xl"
						>
							Candidate Evaluation
						</h1>
						<p className="mt-3 max-w-[480px] text-[13px] leading-relaxed text-[#5c4033]/68">
							{editingFeedback ? 'Edit and lock your review before submitting.' : "Review locked. Submit when you're happy, or edit to change anything."}
							{caseData ? (
								<>
									{' '}Case: <span className="font-semibold text-[#453a2a]">{caseData.title}</span>
								</>
							) : null}
						</p>
					</div>
					<button
						type="button"
						onClick={() => setEditingFeedback((v) => !v)}
						aria-label={editingFeedback ? 'Lock review' : 'Edit review'}
						className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#b48a57]/22 bg-[rgba(255,248,240,0.7)] text-[#5c4033] transition hover:border-[#5c4033]/40 hover:bg-white/85"
						title={editingFeedback ? 'Lock review' : 'Edit review'}
					>
						{editingFeedback ? (
							<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
						) : (
							<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
							</svg>
						)}
					</button>
				</header>

				<section
					className="mt-8 rounded-2xl border border-[#b48a57]/16 bg-[rgba(255,248,240,0.72)] px-6 py-7 backdrop-blur md:px-9 md:py-9"
					style={{ boxShadow: '0 6px 22px rgba(59,47,47,0.04)' }}
				>
					<div className="space-y-7">
						{LIVE_EVALUATION_CRITERIA.map((criteria) => {
							const score = scores[criteria.id]
							const filledDots = score > 0 ? score : 0
							return (
								<div key={criteria.id}>
									<div className="flex items-center justify-between gap-3">
										<label className="text-[14px] font-semibold tracking-tight text-[#453a2a]">
											{criteria.label}
										</label>
										<span
											className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
												score > 0
													? 'border-[#3D5A35]/35 bg-[rgba(174,208,161,0.22)] text-[#3D5A35]'
													: 'border-[#b48a57]/30 bg-[rgba(255,245,233,0.7)] text-[#92400e]'
											}`}
										>
											{score > 0 ? `${score} / 5` : 'Not Rated'}
										</span>
									</div>

									{editingFeedback ? (
										<>
											<input
												type="range"
												min="0"
												max="5"
												step="0.5"
												value={score}
												onChange={(e) =>
													setScores({
														...scores,
														[criteria.id]: Number.parseFloat(e.target.value),
													})
												}
												className="mt-3 w-full cursor-pointer appearance-none rounded-full bg-[#cec5b9]/50 accent-[#3D5A35]"
												style={{ height: '6px' }}
											/>
											<div className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5c4033]/55">
												<span>1: Poor</span>
												<span>5: Excellent</span>
											</div>
										</>
									) : (
										<div className="mt-3 flex items-center gap-2">
											{[1, 2, 3, 4, 5].map((position) => (
												<span
													key={position}
													className={`h-2.5 w-2.5 rounded-full ${
														position <= filledDots
															? 'bg-[#3D5A35]'
															: 'bg-[#5c4033]/14'
													}`}
												/>
											))}
											<span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5c4033]/45">
												{score > 0 ? `${score} of 5` : 'Pending'}
											</span>
										</div>
									)}
								</div>
							)
						})}

						<div className="border-t border-[#b48a57]/16 pt-6">
							<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5c4033]/70">
								Detailed Notes
							</label>
							{editingFeedback ? (
								<NotesEditor
									value={notes}
									onChange={setNotes}
									placeholder="Provide specific feedback. What did they do well? What should they improve?"
									className="mt-3 w-full rounded-xl border border-[#b48a57]/22 bg-[rgba(255,249,242,0.78)] px-4 py-3 text-[13px] leading-relaxed text-[#1e1b15] outline-none transition placeholder:text-[#5c4033]/40 focus:border-[#3D5A35]/40 focus:ring-2 focus:ring-[#3D5A35]/15"
								/>
							) : (
								<div className="mt-3 rounded-xl border border-[#b48a57]/16 bg-[rgba(255,249,242,0.55)] px-4 py-3 text-[13px] leading-relaxed text-[#1e1b15]">
									{notes.trim().length > 0 ? (
										<p className="whitespace-pre-wrap">{notes}</p>
									) : (
										<p className="italic text-[#5c4033]/45">No notes added.</p>
									)}
								</div>
							)}
						</div>
					</div>
				</section>

				{!allScored ? (
					<div className="mt-5 rounded-xl border border-[#92400e]/22 bg-[rgba(255,245,233,0.92)] px-4 py-3">
						<p className="text-[10px] uppercase tracking-[0.18em] text-[#92400e]">
							Missing rating
						</p>
						<p className="mt-1 text-[12px] leading-relaxed text-[#5c4033]">
							Rate all four criteria before submitting. Click the edit icon above to adjust scores.
						</p>
					</div>
				) : null}

				{submitError ? (
					<LobbyOverlay
						key={submitError}
						type="error"
						icon={
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="8" x2="12" y2="12" />
								<line x1="12" y1="16" x2="12.01" y2="16" />
							</svg>
						}
						title="Couldn't submit feedback"
						body={submitError}
						actionLabel="Try again"
						onAction={() => void handleSubmitFeedback()}
						onDismiss={() => setSubmitError('')}
					/>
				) : null}

				<button
					onClick={() => void handleSubmitFeedback()}
					disabled={submitting || !allScored}
					className="mt-6 w-full rounded-full bg-[#3D5A35] px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-[#34502d] disabled:cursor-not-allowed disabled:opacity-55"
					style={{ boxShadow: '0 6px 16px rgba(61,90,53,0.18), inset 0 1px 0 rgba(255,255,255,0.18)' }}
				>
					{submitting ? 'Submitting…' : 'Submit & Close Case'}
				</button>
			</main>
		</div>
	)
}

export default function InterviewerPage({ params }: { params: Promise<{ id: string }> }) {
	return (
		<CaseErrorBoundary>
			<InterviewerPageInner params={params} />
		</CaseErrorBoundary>
	)
}

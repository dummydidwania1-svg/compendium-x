'use client'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState, useRef, ReactNode, Component } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getDoc, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
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
import { MandatoryTimedOverlay } from '@/components/lobby/MandatoryTimedOverlay'
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
   Same logic as CasePreviewMaster handleNotesKeyDown.
   ───────────────────────────────────────────────────────────────────────── */

type NE_MarkerKind = 'number' | 'roman' | 'letter' | 'bullet'
const NE_KIND_CHAIN: NE_MarkerKind[] = ['number', 'roman', 'letter', 'bullet']
function ne_childKind(k: NE_MarkerKind): NE_MarkerKind { const i = NE_KIND_CHAIN.indexOf(k); return NE_KIND_CHAIN[(i + 1) % NE_KIND_CHAIN.length] }
function ne_parentKind(k: NE_MarkerKind): NE_MarkerKind { const i = NE_KIND_CHAIN.indexOf(k); return NE_KIND_CHAIN[(i - 1 + NE_KIND_CHAIN.length) % NE_KIND_CHAIN.length] }

function ne_toRoman(n: number): string {
	const map: [number, string][] = [[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']]
	let r = ''
	for (const [v, s] of map) { while (n >= v) { r += s; n -= v } }
	return r
}
function ne_fromRoman(s: string): number {
	const m: Record<string,number> = { i:1, v:5, x:10, l:50, c:100, d:500, m:1000 }
	let r = 0, prev = 0
	for (const ch of [...s].reverse()) { const v = m[ch] ?? 0; r += v < prev ? -v : v; prev = v }
	return r
}

function ne_parseMarker(rest: string): { kind: NE_MarkerKind; sep: string; body: string; marker: string } | null {
	const numM = rest.match(/^(\d+)([.):])\s(.*)/)
	if (numM) return { kind: 'number', sep: numM[2], body: numM[3], marker: numM[1] + numM[2] + ' ' }
	// lowercase roman: 2+ chars OR single "i"
	const romLoM = rest.match(/^([ivxlcdm]+)([.):])\s(.*)/)
	if (romLoM && (romLoM[1].length > 1 || romLoM[1] === 'i') && ne_fromRoman(romLoM[1]) > 0)
		return { kind: 'roman', sep: romLoM[2], body: romLoM[3], marker: romLoM[1] + romLoM[2] + ' ' }
	// uppercase roman: 2+ chars OR single "I"
	const romUpM = rest.match(/^([IVXLCDM]+)([.):])\s(.*)/)
	if (romUpM && (romUpM[1].length > 1 || romUpM[1] === 'I') && ne_fromRoman(romUpM[1].toLowerCase()) > 0)
		return { kind: 'roman', sep: romUpM[2], body: romUpM[3], marker: romUpM[1] + romUpM[2] + ' ' }
	// lowercase letter a-z (excluding i caught above)
	const letLoM = rest.match(/^([a-z])([.):])\s(.*)/)
	if (letLoM) return { kind: 'letter', sep: letLoM[2], body: letLoM[3], marker: letLoM[1] + letLoM[2] + ' ' }
	// uppercase letter A-Z (excluding I caught above)
	const letUpM = rest.match(/^([A-Z])([.):])\s(.*)/)
	if (letUpM) return { kind: 'letter', sep: letUpM[2], body: letUpM[3], marker: letUpM[1] + letUpM[2] + ' ' }
	const bulM = rest.match(/^([•–-])\s(.*)/)
	if (bulM) return { kind: 'bullet', sep: '', body: bulM[2], marker: bulM[1] + ' ' }
	return null
}

function ne_nextMarker(parsed: { kind: NE_MarkerKind; sep: string; marker: string }): string {
	if (parsed.kind === 'number') { const n = parseInt(parsed.marker.match(/^(\d+)/)?.[1] ?? '1'); return (n + 1) + parsed.sep + ' ' }
	if (parsed.kind === 'roman') {
		const base = parsed.marker.replace(/[.):\s]/g, '')
		const isUpper = base === base.toUpperCase()
		const next = ne_toRoman(ne_fromRoman(base.toLowerCase()) + 1)
		return (isUpper ? next.toUpperCase() : next) + parsed.sep + ' '
	}
	if (parsed.kind === 'letter') { return String.fromCharCode(parsed.marker.charCodeAt(0) + 1) + parsed.sep + ' ' }
	return parsed.marker
}

function ne_makeFirstMarker(kind: NE_MarkerKind, sep: string): string {
	if (kind === 'number') return '1' + sep + ' '
	if (kind === 'roman') return 'i' + sep + ' '
	if (kind === 'letter') return 'a' + sep + ' '
	return '• '
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


	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		const el = ref.current
		if (!el) return
		const val = el.value
		const cur = el.selectionStart
		const curEnd = el.selectionEnd
		const lineStart = val.lastIndexOf('\n', cur - 1) + 1
		const lineEndIdx = val.indexOf('\n', cur)
		const eol = lineEndIdx === -1 ? val.length : lineEndIdx
		const fullLine = val.slice(lineStart, eol)
		const indent = (fullLine.match(/^( *)/)?.[1] ?? '')
		const level = Math.floor(indent.length / 2)
		const rest = fullLine.slice(indent.length)
		const parsed = ne_parseMarker(rest)

		// Auto-convert dash+space to bullet
		if (e.key === ' ' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
			const lineUpToCursor = val.slice(lineStart, cur)
			if (/^(\s*)-$/.test(lineUpToCursor)) {
				e.preventDefault()
				const ind = (lineUpToCursor.match(/^( *)/)?.[1] ?? '')
				const newVal = val.slice(0, lineStart) + ind + '• ' + val.slice(cur)
				onChange(newVal)
				requestAnimationFrame(() => { el.setSelectionRange(lineStart + ind.length + 2, lineStart + ind.length + 2) })
				return
			}
		}

		if (e.key === 'Tab') {
			e.preventDefault()
			if (!e.shiftKey) {
				if (!parsed) {
					const newVal = val.slice(0, lineStart) + indent + '  ' + rest + val.slice(eol)
					onChange(newVal)
					requestAnimationFrame(() => { el.setSelectionRange(cur + 2, cur + 2) })
					return
				}
				const newKind = ne_childKind(parsed.kind)
				const newIndent = indent + '  '
				const childSep = parsed.sep || '.'
				const newMarker = ne_makeFirstMarker(newKind, newKind === 'bullet' ? '' : childSep)
				const nl = newIndent + newMarker + parsed.body
				onChange(val.slice(0, lineStart) + nl + val.slice(eol))
				const pos = lineStart + newIndent.length + newMarker.length
				requestAnimationFrame(() => { el.setSelectionRange(pos, pos) })
			} else {
				// Shift+Tab: find nearest line at level-1 and continue that list
				if (level === 0) return
				const newLevel = level - 1
				const newIndent = '  '.repeat(newLevel)
				const aboveLines = val.slice(0, lineStart).split('\n')
				let parentParsed: ReturnType<typeof ne_parseMarker> = null
				for (let i = aboveLines.length - 1; i >= 0; i--) {
					const aboveIndent = (aboveLines[i].match(/^( *)/)?.[1] ?? '')
					const aboveLevel = Math.floor(aboveIndent.length / 2)
					if (aboveLevel < newLevel) break
					if (aboveLevel === newLevel) { parentParsed = ne_parseMarker(aboveLines[i].slice(aboveIndent.length)); break }
				}
				let newMarker: string
				if (parentParsed) {
					newMarker = ne_nextMarker(parentParsed)
				} else if (parsed) {
					const newKind = ne_parentKind(parsed.kind)
					newMarker = ne_makeFirstMarker(newKind, newKind === 'bullet' ? '' : (parsed.sep || '.'))
				} else { return }
				const body = parsed?.body ?? rest
				const nl = newIndent + newMarker + body
				onChange(val.slice(0, lineStart) + nl + val.slice(eol))
				requestAnimationFrame(() => { el.setSelectionRange(lineStart + nl.length, lineStart + nl.length) })
			}
			return
		}

		if (e.key === 'Enter' && !e.shiftKey) {
			const lineUpToCursor = val.slice(lineStart, cur)
			const upIndent = (lineUpToCursor.match(/^( *)/)?.[1] ?? '')
			const upRest = lineUpToCursor.slice(upIndent.length)
			const upParsed = ne_parseMarker(upRest)
			if (upParsed) {
				e.preventDefault()
				if (!upParsed.body.trim()) {
					// Empty list line — escape
					onChange(val.slice(0, lineStart) + val.slice(cur))
					requestAnimationFrame(() => { el.setSelectionRange(lineStart, lineStart) })
					return
				}
				const ins = '\n' + upIndent + ne_nextMarker(upParsed)
				onChange(val.slice(0, cur) + ins + val.slice(curEnd))
				requestAnimationFrame(() => { el.setSelectionRange(cur + ins.length, cur + ins.length) })
				return
			}
			// Plain newline preserving indent
			if (upIndent.length > 0) {
				e.preventDefault()
				const ins = '\n' + upIndent
				onChange(val.slice(0, cur) + ins + val.slice(curEnd))
				requestAnimationFrame(() => { el.setSelectionRange(cur + ins.length, cur + ins.length) })
			}
		}
	}

	return (
		<textarea
			ref={ref}
			value={value}
			onChange={e => onChange(e.target.value)}
			onKeyDown={handleKeyDown}
			placeholder={placeholder}
			className={`ne-ta${className ? ` ${className}` : ''}`}
			style={{
				...style,
				resize: 'none',
				height: '160px',
				overflowY: 'auto',
			}}
		/>
	)
}

const isSafari = typeof navigator !== 'undefined' && navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')

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

	// ── Eval overlay hover state ──
	const [evalHoverScore, setEvalHoverScore] = useState<{ id: string; value: number } | null>(null)
	const evalClickCooldownRef = useRef<number>(0)

	// ── Eval overlay (replaces full-page feedback view for the End Case button) ──
	const [showEvalOverlay, setShowEvalOverlay] = useState(false)
	const [editingOverlay, setEditingOverlay] = useState(false)
	const [showUnratedConfirm, setShowUnratedConfirm] = useState(false)
	const [overlaySubmitError, setOverlaySubmitError] = useState('')
	const [overlaySuccess, setOverlaySuccess] = useState(false)
	const [overlayAutoClose, setOverlayAutoClose] = useState(0) // countdown seconds remaining
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
	// Safari BroadcastChannel ref — used by Firestore snapshot handler to send
	// start-recording signal without prop drilling.
	const safariChannelRef = useRef<BroadcastChannel | null>(null)

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

	// Guests who open a remote-mode interviewer link without ever signing up
	// get a silent anonymous Firebase user (see signInAnonymouslyIfNeeded) so
	// they can call authenticated API routes. That anonymous session must never
	// survive the trip back to the homepage — otherwise a never-signed-in
	// visitor lands there as a "signed in" user with dashboard/practice access.
	// A visitor who WAS already signed in (real account) keeps that session.
	const goHomeAfterSession = useCallback(() => {
		if (auth.currentUser?.isAnonymous) {
			void signOut(auth).finally(() => router.push('/'))
			return
		}
		router.push('/')
	}, [router])

	// When overlay is in success state and upload is done, start the 3s countdown.
	// Local/split-screen: window.close() works (tab opened by script) — fires at 0.
	// Remote: redirect to homepage instead.
	useEffect(() => {
		if (!overlaySuccess) return
		if (interviewerUploadState === 'uploading') return
		if (isRemoteMode) { goHomeAfterSession(); return }
		setOverlayAutoClose(3)
		const iv = setInterval(() => {
			setOverlayAutoClose(prev => {
				if (prev <= 1) {
					clearInterval(iv)
					window.open('', '_self')
					window.close()
					return 0
				}
				return prev - 1
			})
		}, 1000)
		return () => clearInterval(iv)
	}, [overlaySuccess, interviewerUploadState, isRemoteMode, goHomeAfterSession])

	const [micGuardShowing, setMicGuardShowing] = useState(false)

	// ── Interviewer mic recording (remote mode, dual-mic architecture) ────────────
	// The interviewer records their own mic; the Cloud Function merges both
	// tracks into one merged transcript. Permission flow: auto-ask → remind once
	// → continue without forcing (signal interviewerAudioCaptured:false).
	const [interviewerMicBannerVisible, setInterviewerMicBannerVisible] = useState(false)
	// LobbyOverlay owns its own "leaving" animation state internally, which
	// only resets on a genuine remount. When "Allow mic" fails and we need to
	// re-show the SAME banner right after LobbyOverlay's own forced dismiss
	// animation already started, just flipping interviewerMicBannerVisible
	// back to true is a no-op if it was never actually set to false -- bump
	// this key to force a fresh instance so it reliably reappears.
	const [micBannerInstanceKey, setMicBannerInstanceKey] = useState(0)
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
	// LobbyOverlay always fires onDismiss ~280ms after ANY action button
	// click, without awaiting an async onAction first -- so onDismiss can't
	// rely on that handler's async work having finished. Set synchronously,
	// in the same click, so onDismiss can tell "a button was just clicked"
	// apart from a real dismiss (X button / auto-dismiss) no matter how long
	// the click handler's own async work takes.
	const micRecoveryButtonClickedRef = useRef(false)
	const candidateOptedOutRef = useRef(false)
	const lastInterviewerFlushUrlRef = useRef<string | null>(null)
	const lastInterviewerFlushPathRef = useRef<string | null>(null)
	const lastInterviewerFlushMimeTypeRef = useRef<string>('audio/webm')
	const recordingFinalizedRef = useRef(false)
	const cachedAuthTokenRef = useRef<string | null>(null)
	const selectingGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Mid-session mic-LOSS recovery (manual block). Raises the recovery banner when
	// a previously-granted mic flips to 'denied'. Hard-suppressed when the interviewer
	// declined at the gate or the candidate opted out, and once upload has begun.
	// The "mic came back on its own" half of this (restarting recording, not just
	// hiding the banner) lives further down, right after startInterviewerRecording
	// is declared — see that effect for why it can't live here.
	useEffect(() => {
		if (!isRemoteMode || previewMode) return
		if (currentView === 'success' || interviewerUploadState !== 'idle') return
		if (interviewerDeclinedConsentRef.current || candidateOptedOutRef.current) return
		if (interviewerMicPermState === 'denied') {
			bannerFromPermissionRef.current = true
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setInterviewerMicBannerVisible(true)
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
	// Ref so the auto-submit effect fires exactly once per session-end event.
	const autoSubmitOnEndRef = useRef(false)
	// D10: Candidate dropped/abandoned the session mid-way.
	const [candidateAbandoned, setCandidateAbandoned] = useState(false)
	// Ref so the recording-stop + overlay-trigger fires exactly once per session.
	const candidateAbandonedRef = useRef(false)
	// B5 (rebuilt): candidate's workspace tab is gone or stale (crash/force-quit/
	// lost connectivity — not a graceful End Session click). Mirrors the
	// candidate's own interviewerPresence staleness check (workspace/page.tsx).
	const CANDIDATE_PRESENCE_STALE_MS = 25_000
	const [candidateRemoteDisconnected, setCandidateRemoteDisconnected] = useState(false)
	// One-shot per disconnect episode; reset when the candidate is seen active
	// again so a future reconnect->disconnect cycle can show the toast again.
	const candidateDisconnectShownRef = useRef(false)
	// Latest candidatePresence payload, cached so a periodic timer (not just
	// each incoming Firestore snapshot) can re-check staleness. Without this,
	// a candidate who's already been gone for a while only gets "noticed" the
	// next time some unrelated field on the session doc happens to change
	// (e.g. select-case firing status:'in_progress' after a replace) — which
	// can lag well past the 25s threshold since lastSeenAt itself stopped
	// advancing the moment their tab closed.
	const candidatePresenceRef = useRef<{ active?: boolean; lastSeenAt?: { toDate: () => Date } } | undefined>(undefined)

	// When the candidate ends the session, auto-save whatever the interviewer has
	// entered so far (even partial scores). The /api/evaluations endpoint is now an
	// upsert, so if the interviewer then formally submits via the overlay, their
	// updated scores overwrite this auto-save.
	useEffect(() => {
		if (!candidateEndedSession || !isRemoteMode) return
		if (autoSubmitOnEndRef.current) return
		if (!resolvedCaseId || !caseData || !lobbyId) return
		const hasScores = Object.values(scores).some(v => v > 0)
		const hasNotes = notes.trim().length > 0
		if (!hasScores && !hasNotes) return
		autoSubmitOnEndRef.current = true
		void (async () => {
			try {
				await apiPost('/api/evaluations', {
					lobbyId,
					caseId: resolvedCaseId,
					scores: {
						...(scores.structure > 0 && { structure: scores.structure }),
						...(scores.understanding > 0 && { understanding: scores.understanding }),
						...(scores.delivery > 0 && { delivery: scores.delivery }),
						...(scores.creativity > 0 && { creativity: scores.creativity }),
					},
					notes,
				})
			} catch { /* best-effort — overlay still shows so interviewer can submit manually */ }
		})()
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [candidateEndedSession])

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

	// Remote mode only: mirror "all 4 draft scores filled in" to Firestore so the
	// candidate (separate device, no shared localStorage) can see it in
	// checkRatingStatus. Local mode never fires this — its draft is already
	// visible to the candidate via the same-browser localStorage read.
	const lastMirroredAllRatedRef = useRef<boolean | null>(null)
	useEffect(() => {
		if (!isRemoteMode || !lobbyId || previewMode) return
		const allRated =
			scores.structure > 0 && scores.understanding > 0 &&
			scores.delivery > 0 && scores.creativity > 0
		if (lastMirroredAllRatedRef.current === allRated) return
		lastMirroredAllRatedRef.current = allRated
		apiPost(`/api/sessions/${encodeURIComponent(lobbyId)}/presence`, {
			role: 'interviewer',
			active: true,
			interviewerDraftAllRated: allRated,
		}).catch(() => { /* best-effort */ })
	}, [isRemoteMode, lobbyId, previewMode, scores])

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
		const latestStatusRef = { current: undefined as string | undefined }
		const handleSnapshot = (data: Record<string, unknown> | null) => {
			if (!data) return
			const status = data.status as string | undefined
			latestStatusRef.current = status
			const view = currentViewRef.current

			// D9: Seed inactivity clocks from server timestamps on the first snapshot.
			// Also capture selectedAt for dual-mic startOffsetMs calculation.
			if (!seedApplied && status === 'in_progress') {
				// select-case confirmed — cancel the fallback redirect timer and clear marker.
				if (selectingGraceTimerRef.current) {
					clearTimeout(selectingGraceTimerRef.current)
					selectingGraceTimerRef.current = null
				}
				if (lobbyId) {
					try { localStorage.removeItem(`compendium-selecting-${lobbyId}`) } catch { /* ignore */ }
				}
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
					// Safari: signal the candidate workspace to start recording via
					// BroadcastChannel — getUserMedia on background tabs is blocked
					// in Safari so the auto-start effect silently fails there.
					// Send immediately + retry after 1s and 3s in case the workspace
					// channel wasn't open yet on the first send.
					if (isSafari && !skipRecording) {
						safariChannelRef.current?.postMessage({ type: 'start-recording' })
						setTimeout(() => safariChannelRef.current?.postMessage({ type: 'start-recording' }), 1000)
						setTimeout(() => safariChannelRef.current?.postMessage({ type: 'start-recording' }), 3000)
					}
				}
			}

			// A3/D10: Candidate ended the session while interviewer hasn't submitted.
			// The /submit-draft, /save-unrated, and /complete routes all write
			// status:'completed', so a Firestore snapshot is the reliable cross-device signal.
			if (status === 'completed' && view !== 'success') {
				setCandidateEndedSession(true)
			}

			// D10: Session cancelled ("waiting") — return interviewer to lobby.
			// Grace-period logic unchanged from before the abandoned-branch split below.
			if (status === 'waiting') {
				if (view !== 'success') {
					// If the interviewer just navigated here from the case picker before
					// select-case finished, suppress the immediate redirect and schedule a
					// fallback instead. When select-case writes in_progress the snapshot
					// fires again and cancels the timer. If it never arrives (API error,
					// network failure), the timer fires and returns the interviewer to lobby.
					if (lobbyId) {
						try {
							const raw = localStorage.getItem(`compendium-selecting-${lobbyId}`)
							if (raw) {
								const marker = JSON.parse(raw) as { ts?: number }
								const age = Date.now() - (marker.ts ?? 0)
								if (age < 12_000) {
									if (!selectingGraceTimerRef.current) {
										const lobbyMode = searchParams.get('sessionMode') ?? 'remote'
										selectingGraceTimerRef.current = setTimeout(() => {
											selectingGraceTimerRef.current = null
											try { localStorage.removeItem(`compendium-selecting-${lobbyId}`) } catch { /* ignore */ }
											if (currentViewRef.current !== 'success') {
												router.replace(`/lobby/${encodeURIComponent(lobbyId)}?role=interviewer&mode=${lobbyMode}`)
											}
										}, 12_000 - age + 500)
									}
									return
								}
								localStorage.removeItem(`compendium-selecting-${lobbyId}`)
							}
						} catch { /* ignore */ }
					}
					router.replace(`/lobby/${encodeURIComponent(lobbyId)}?role=interviewer&mode=${searchParams.get('sessionMode') ?? 'remote'}`)
				}
			}

			// New: candidate explicitly dropped the session ("abandoned"). Different
			// UX than 'waiting' — show a brief non-dismissible notice, flush the
			// interviewer's own trailing recording, then send them to the real
			// landing page (not the lobby "Welcome, Interviewer" screen).
			if (status === 'abandoned') {
				if (view !== 'success' && !candidateAbandonedRef.current) {
					candidateAbandonedRef.current = true
					void stopInterviewerRecordingAndUpload()
					setCandidateAbandoned(true)
				}
			}

			// B5 (rebuilt): candidate's workspace is gone or stale, via candidatePresence
			// staleness — not the old, removed candidatePresence.recording===false
			// heuristic (which false-fired in many normal states). Mirrors the
			// candidate's own interviewerPresence staleness check exactly. The actual
			// check (below) applies across the waiting lobby, mid-session, and
			// case-replace equally, only suppressed once completed/abandoned.
			candidatePresenceRef.current = data.candidatePresence as
				| { active?: boolean; lastSeenAt?: { toDate: () => Date } }
				| undefined
			checkCandidatePresenceStale()
		}

		// Re-checks staleness against the cached candidatePresence value. Called
		// both right after every snapshot AND on a periodic timer below — a
		// snapshot alone isn't enough, since lastSeenAt stops advancing the
		// moment the candidate's tab closes, so nothing about the DOCUMENT
		// changes again until some unrelated field happens to be written (e.g.
		// select-case flipping status after a replace). Without the timer, the
		// toast could lag far past the 25s threshold, or on a status
		// transition that lands right at/near a fresh-looking lastSeenAt.
		// Suppressed once the session is completed/abandoned — moot at that
		// point, and matches B5's original status guard.
		function checkCandidatePresenceStale() {
			if (latestStatusRef.current === 'completed' || latestStatusRef.current === 'abandoned') return
			const presence = candidatePresenceRef.current
			// No presence data yet -> assume connected, same convention used for
			// interviewerPresence on the candidate's own side.
			if (!presence?.lastSeenAt) return
			const age = Date.now() - presence.lastSeenAt.toDate().getTime()
			const isStale = presence.active === false || age > CANDIDATE_PRESENCE_STALE_MS
			if (isStale) {
				if (!candidateDisconnectShownRef.current) {
					candidateDisconnectShownRef.current = true
					setCandidateRemoteDisconnected(true)
				}
			} else {
				// Candidate confirmed active again — allow the toast to fire again
				// on a future disconnect.
				candidateDisconnectShownRef.current = false
			}
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

		// Periodic re-check so the toast fires promptly (within a few seconds)
		// even when no new Firestore snapshot happens to arrive right after the
		// candidate actually goes stale — e.g. they disconnected during the
		// waiting lobby or mid-replace, then the session starts/resumes with no
		// further presence writes to re-trigger handleSnapshot on its own.
		const staleCheckTimer = setInterval(checkCandidatePresenceStale, 2000)

		return () => {
			unsubscribe()
			clearPoll()
			clearInterval(staleCheckTimer)
			if (selectingGraceTimerRef.current) {
				clearTimeout(selectingGraceTimerRef.current)
				selectingGraceTimerRef.current = null
			}
		}
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
		// Already recording (e.g. the manual "Allow mic" click and the
		// mic-came-back-on-its-own effect both firing around the same time) --
		// don't spin up a second concurrent MediaRecorder.
		if (interviewerRecorderRef.current && interviewerRecorderRef.current.state !== 'inactive') return
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

	// Mic-loss recovery, part 2: this is the ONLY place recording actually
	// restarts. It fires whenever interviewerMicPermState becomes 'granted'
	// while the banner is up for a permission reason -- whether that's the
	// mic coming back on its own (Chrome's site-settings toggle, an OS-level
	// change) or the "Allow mic" button's own re-check confirming a real
	// grant. Never restart eagerly on click alone, since at click time we
	// don't yet know whether the browser will actually grant it --
	// bannerFromPermissionRef stays true (and the banner stays up) until this
	// effect sees a real grant, so a failed retry correctly leaves the banner
	// in place instead of silently giving up.
	useEffect(() => {
		if (!isRemoteMode || previewMode) return
		if (currentView === 'success' || interviewerUploadState !== 'idle') return
		if (interviewerDeclinedConsentRef.current || candidateOptedOutRef.current) return
		if (interviewerMicPermState === 'granted' && bannerFromPermissionRef.current) {
			bannerFromPermissionRef.current = false
			setInterviewerMicBannerVisible(false)
			void startInterviewerRecording()
		}
	}, [interviewerMicPermState, isRemoteMode, previewMode, currentView, interviewerUploadState, startInterviewerRecording])

	const stopInterviewerRecordingAndUpload = useCallback(async () => {
		if (recordingFinalizedRef.current) return  // pagehide beacon already fired
		recordingFinalizedRef.current = true

		// Eagerly mark as uploading before the first await so React batches this
		// with any concurrent setCurrentView('success') / setOverlaySuccess(true).
		// Without this, the auto-close effects can fire while interviewerUploadState
		// is still 'idle', bypassing the uploading guard and redirecting away
		// before the final audio blob is uploaded.
		if (isRemoteMode && interviewerRecordingStartedRef.current && !candidateOptedOutRef.current) {
			setInterviewerUploadState('uploading')
		}

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
			// Remote: no window to close; show the modern eval-overlay success state
			// (same one every other submit path uses) instead of the old full-page view.
			setShowEvalOverlay(true)
			setOverlaySuccess(true)
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

	// ── Safari BroadcastChannel ping/pong (split-screen, Safari only) ──────────
	// Replaces localStorage poll for liveness on Safari. Sends a ping every 3s;
	// workspace responds with pong instantly (no throttle). No pong within 5s
	// means the candidate tab is gone. Chrome keeps its existing localStorage poll.
	useEffect(() => {
		if (!isSafari || !isLocalMode || !lobbyId || previewMode || currentView === 'success') return
		if (typeof BroadcastChannel === 'undefined') return
		const ch = new BroadcastChannel(`compendium-session-${lobbyId}`)
		safariChannelRef.current = ch
		let pongReceived = false
		let missedPongs = 0
		ch.onmessage = (e: MessageEvent<{ type: string }>) => {
			if (e.data?.type === 'pong') {
				pongReceived = true
				missedPongs = 0
				candidateWasAliveRef.current = true
				setCandidateTabClosed(false)
			}
		}
		const interval = setInterval(() => {
			if (sessionEndedForLobby(lobbyId) || isCandidateClosedDismissed(lobbyId)) {
				setCandidateTabClosed(false)
				missedPongs = 0
				return
			}
			pongReceived = false
			ch.postMessage({ type: 'ping' })
			// Check after 2s whether pong came back
			setTimeout(() => {
				if (!pongReceived) {
					missedPongs++
					// Two consecutive missed pongs (6s total) = tab gone
					if (missedPongs >= 2 && candidateWasAliveRef.current) {
						setCandidateTabClosed(true)
					}
				}
			}, 2000)
		}, 3000)
		return () => {
			clearInterval(interval)
			ch.close()
			safariChannelRef.current = null
		}
	}, [isLocalMode, lobbyId, previewMode, currentView])

	// ── Candidate tab heartbeat poll (split-screen only) ────────────────────────
	// Heartbeat older than the stale threshold, after we've seen the tab alive,
	// means it closed unexpectedly.
	// Also listens for storage events — these fire instantly cross-tab without
	// throttling, giving immediate liveness even when Safari slows setInterval
	// in the background candidate tab.
	useEffect(() => {
		// Safari uses BroadcastChannel ping/pong above — skip localStorage poll there.
		if (isSafari || !isLocalMode || !lobbyId || previewMode || currentView === 'success') return

		const staleMs = CANDIDATE_TAB_STALE_MS
		const checkBeat = () => {
			if (sessionEndedForLobby(lobbyId) || isCandidateClosedDismissed(lobbyId)) {
				setCandidateTabClosed(false)
				return
			}
			const beat = readCandidateBeat(lobbyId)
			if (!beat) return
			if (beat.url) candidateTabUrlRef.current = beat.url
			const age = Date.now() - beat.ts
			if (age < staleMs) {
				candidateWasAliveRef.current = true
				setCandidateTabClosed(false)
			} else if (candidateWasAliveRef.current) {
				setCandidateTabClosed(true)
			}
		}

		const onStorage = (e: StorageEvent) => {
			if (e.key === 'compendium-candidate-tab') checkBeat()
		}

		const interval = setInterval(checkBeat, 1000)
		window.addEventListener('storage', onStorage)
		return () => {
			clearInterval(interval)
			window.removeEventListener('storage', onStorage)
		}
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

	// ── Window close guard (same-device only) ───────────────────────────────────
	// The browser-level shortcut Cmd+W and the window X button CANNOT be blocked
	// by a custom overlay — the browser tears the page down before React can
	// render. The only sanctioned warning is the native beforeunload dialog
	// ("Changes you made may not be saved"). We fire that here.
	//
	// If the user cancels that native dialog (chooses to stay), the page never
	// unloads and becomes visible/focused again — we detect that and show our
	// own timed top-right toast reminding them to submit before closing.
	//
	// Remote mode gets a heavier, dedicated guard below (mirroring the
	// candidate workspace's own close/reload protection, since the
	// interviewer's mic is genuinely recording in remote mode too) — this
	// effect is scoped to local mode only so that guard's behavior stays
	// byte-for-byte unchanged.
	const closeAttemptRef = useRef(false)
	useEffect(() => {
		if (!isLocalMode || !lobbyId || previewMode) return
		let armed = false
		const armTimer = setTimeout(() => { armed = true }, 4000)

		const shouldBlock = () => {
			if (!armed) return false
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
	}, [isLocalMode, lobbyId, previewMode])

	// ── Window close / reload guard (remote mode only) ──────────────────────────
	// Mirrors the candidate workspace's own close/reload protection exactly
	// (app/case/[id]/workspace/page.tsx) — the interviewer's mic is genuinely
	// recording in remote mode too, so closing or reloading now destroys real
	// audio, same as it would for the candidate.
	const [warnBeforeReloadVisible, setWarnBeforeReloadVisible] = useState(false)
	const [warnBeforeCloseVisible, setWarnBeforeCloseVisible] = useState(false)
	const INTERVIEWER_RELOAD_WARN_KEY = `compendium-interviewer-reload-warnings-${lobbyId ?? ''}`
	const INTERVIEWER_RELOAD_FLAG_KEY = `compendium-interviewer-was-reloaded-${lobbyId ?? ''}`
	const INTERVIEWER_RELOAD_PLATFORM_KEY = `compendium-interviewer-platform-reload-${lobbyId ?? ''}`

	// One-time cleanup: if we just came back from a forced (3rd-strike) reload,
	// clear both keys right away. Unlike the candidate's original version (which
	// never clears its platform-reload key), this prevents the close/reload
	// guard from staying silently disabled for the rest of the tab's lifetime.
	useEffect(() => {
		if (!isRemoteMode || !lobbyId) return
		if (sessionStorage.getItem(INTERVIEWER_RELOAD_FLAG_KEY) === '1') {
			sessionStorage.removeItem(INTERVIEWER_RELOAD_FLAG_KEY)
			sessionStorage.removeItem(INTERVIEWER_RELOAD_PLATFORM_KEY)
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isRemoteMode, lobbyId])

	// Recording is "active" from the guard's perspective once it has started
	// and the session hasn't already reached a success/done state — the
	// interviewer-side equivalent of the candidate's recordingState==='recording'.
	const interviewerSessionActive =
		interviewerRecordingStartedRef.current && currentView !== 'success' && !overlaySuccess

	// keydown fires BEFORE beforeunload — keyboard shortcuts (F5, Ctrl+R, Cmd+R)
	// are intercepted here so our overlay appears with no browser dialog at all.
	useEffect(() => {
		if (isLocalMode || !lobbyId || previewMode || !interviewerSessionActive) return
		const onKeyDown = (event: KeyboardEvent) => {
			const isReloadKey =
				event.key === 'F5' ||
				((event.ctrlKey || event.metaKey) && event.key === 'r')
			if (!isReloadKey) return
			event.preventDefault()
			if (interviewerUploadState === 'uploading') {
				setWarnBeforeReloadVisible(true)
				return
			}
			const count = parseInt(sessionStorage.getItem(INTERVIEWER_RELOAD_WARN_KEY) ?? '0', 10)
			if (count >= 2) {
				sessionStorage.setItem(INTERVIEWER_RELOAD_FLAG_KEY, '1')
				sessionStorage.setItem(INTERVIEWER_RELOAD_WARN_KEY, '0')
				sessionStorage.setItem(INTERVIEWER_RELOAD_PLATFORM_KEY, '1')
				window.location.reload()
				return
			}
			setWarnBeforeReloadVisible(true)
			sessionStorage.setItem(INTERVIEWER_RELOAD_WARN_KEY, String(count + 1))
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLocalMode, lobbyId, previewMode, interviewerSessionActive, interviewerUploadState])

	// beforeunload fires for the reload button, tab-close, and address-bar
	// navigation — keyboard reloads never reach this handler (already
	// intercepted above). Warn-only: does not stop or finalize recording
	// itself — the existing pagehide beacon (see the presence-heartbeat effect
	// above) already handles finalization on genuine unload.
	useEffect(() => {
		if (isLocalMode || !lobbyId || previewMode || !interviewerSessionActive) return
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (sessionStorage.getItem(INTERVIEWER_RELOAD_PLATFORM_KEY) === '1') return
			setWarnBeforeCloseVisible(true)
			event.preventDefault()
		}
		window.addEventListener('beforeunload', onBeforeUnload)
		return () => window.removeEventListener('beforeunload', onBeforeUnload)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLocalMode, lobbyId, previewMode, interviewerSessionActive])

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

		// Overlay submits: show the success card immediately (with countdown).
		// In local/split-screen mode window.close() works (tab opened by script),
		// so the countdown fires and closes the tab. In remote mode the interviewer
		// opened the tab manually so window.close() is blocked — the card instead
		// shows a friendly "you're done, close this tab" prompt after upload.
		if (showEvalOverlay) {
			setSubmitting(false)
			setOverlaySuccess(true)
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
							Back to repository
						</button>
					</div>
				</div>
			</div>
		)
	}

	if (!caseData) {
		return <PlatformLoader message="Heading back to the repository" />
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
				{showBackGuardToast && !micGuardShowing && !overlaySuccess && (
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
				{candidateTabClosed && !micGuardShowing && lobbyId && !overlaySuccess && (
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
				{showCloseWarning && !micGuardShowing && !overlaySuccess && (
					<LobbyOverlay
						type="warning"
						icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
						title="You tried to close this"
						body="Any ratings you have not submitted will be gone. Hit submit before closing."
						autoDismissMs={7000}
						onDismiss={() => setShowCloseWarning(false)}
					/>
				)}

				{/* Remote mode — keyboard-shortcut reload intercept (F5/Ctrl+R/Cmd+R),
				    mirrors the candidate workspace's own reload guard exactly. */}
				{isRemoteMode && warnBeforeReloadVisible && !micGuardShowing && !overlaySuccess && (() => {
					const isUploading = interviewerUploadState === 'uploading'
					const warnCount = parseInt(sessionStorage.getItem(INTERVIEWER_RELOAD_WARN_KEY) ?? '0', 10)
					const isFinalWarning = !isUploading && warnCount >= 2
					return (
						<LobbyOverlay
							key="interviewer-warn-before-reload"
							type="warning"
							icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
							title={
								isUploading
									? "Your audio is uploading right now"
									: isFinalWarning
										? "One more reload and we let you go"
										: "Heads up: reloading will lose your recording"
							}
							body={
								isUploading
									? "Reloading now would cut the upload and your recording would be lost. It wraps up on its own, just wait a moment."
									: isFinalWarning
										? "You've tried to reload twice now. The next reload will go through and your recording will be gone. Stay on the page to keep it."
										: "Reloading stops your mic and wipes everything captured so far. A new recording will start fresh once the page comes back. Stay on the page to keep what you have."
							}
							autoDismissMs={isUploading ? 8000 : isFinalWarning ? 8000 : 6000}
							actionLabel="Stay on page"
							onAction={() => setWarnBeforeReloadVisible(false)}
							onDismiss={() => setWarnBeforeReloadVisible(false)}
						/>
					)
				})()}

				{/* Remote mode — close/reload warning via the native beforeunload
				    dialog, mirrors the candidate workspace's own close guard exactly. */}
				{isRemoteMode && warnBeforeCloseVisible && !micGuardShowing && !overlaySuccess && (() => {
					const isUploadingNow = interviewerUploadState === 'uploading'
					return (
						<LobbyOverlay
							key="interviewer-warn-before-close"
							type="warning"
							icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
							title={isUploadingNow ? "Your audio is uploading right now" : "Leaving will lose your recording"}
							body={
								isUploadingNow
									? "Closing or reloading now would cut the upload and your recording would be lost. It finishes on its own, just give it a few seconds."
									: "You tried to close or reload this tab. If you go through with it, your mic stops and everything recorded so far is gone."
							}
							autoDismissMs={8000}
							actionLabel="Stay on page"
							onAction={() => setWarnBeforeCloseVisible(false)}
							onDismiss={() => setWarnBeforeCloseVisible(false)}
						/>
					)
				})()}

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
				{isRemoteMode && interviewerMicBannerVisible && !micGuardShowing && interviewerUploadState === 'idle' && !overlaySuccess && (
					<LobbyOverlay
						key={micBannerInstanceKey}
						type="warning"
						icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>}
						title="Looks like your mic dropped"
						body="Your mic just cut out, so your side stopped recording. Turn it back on and tap Allow mic to keep going, or skip and we'll just record the candidate. Either way the case keeps running."
						actionLabel="Allow mic"
						onAction={() => {
							// LobbyOverlay calls dismiss() synchronously right after this
							// returns, WITHOUT awaiting it (its onClick is `() => { onAction();
							// dismiss() }`, and onAction here is async) -- so onDismiss below
							// fires ~280ms later regardless of how long the permission
							// check/restart actually takes. Set this ref synchronously, in the
							// same tick as the click, so onDismiss can reliably tell "this was
							// a button click" apart from a real dismiss, no matter how long the
							// async work below takes to finish.
							micRecoveryButtonClickedRef.current = true
							void (async () => {
								// Don't assume success: re-check permission first. If the browser
								// still reports it as denied (e.g. clicked before actually
								// flipping the OS/site toggle), re-open the banner so the user
								// can fix it and try again, instead of silently giving up. Bump
								// the instance key too -- LobbyOverlay's own "leaving" animation
								// state already started when this button was clicked, so just
								// setting visible=true again (already true) wouldn't force it to
								// reappear on its own.
								const state = await interviewerMicRetry()
								if (state !== 'granted') {
									setMicBannerInstanceKey((k) => k + 1)
									setInterviewerMicBannerVisible(true)
									return
								}
								bannerFromPermissionRef.current = false
								setInterviewerMicBannerVisible(false)
								await startInterviewerRecording()
							})()
						}}
						secondaryActionLabel="Skip recording"
						onSecondaryAction={() => {
							micRecoveryButtonClickedRef.current = true
							bannerFromPermissionRef.current = false
							setInterviewerMicBannerVisible(false)
							try { if (lobbyId) sessionStorage.setItem(`compendium-interviewer-noconsent-${lobbyId}`, '1') } catch { /* quota */ }
							interviewerDeclinedConsentRef.current = true
							void signalNoInterviewerAudio()
						}}
						onDismiss={() => {
							// LobbyOverlay always fires dismiss() after ANY action button
							// click too, not just a true "closed with no choice made" (X
							// button or auto-dismiss). If either button was just clicked,
							// its own handler above already did everything needed -- so just
							// clear the flag and stop, regardless of whether that handler's
							// async work has finished yet.
							if (micRecoveryButtonClickedRef.current) {
								micRecoveryButtonClickedRef.current = false
								return
							}
							bannerFromPermissionRef.current = false
							setInterviewerMicBannerVisible(false)
							try { if (lobbyId) sessionStorage.setItem(`compendium-interviewer-noconsent-${lobbyId}`, '1') } catch { /* quota */ }
							interviewerDeclinedConsentRef.current = true
							void signalNoInterviewerAudio()
						}}
					/>
				)}

				{/* B5 (rebuilt) — Remote mode: candidate's workspace presence went
				    stale (tab closed / crashed / lost connectivity). Informal,
				    dismissible, self-clearing toast — no action needed, recording
				    continues on the interviewer's side only. */}
				{isRemoteMode && candidateRemoteDisconnected && !micGuardShowing && !overlaySuccess &&
					!candidateAbandoned && !candidateEndedSession && (
					<LobbyOverlay
						type="warning"
						icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><line x1="2" y1="2" x2="22" y2="22"/></svg>}
						title="Candidate's window closed"
						body="Looks like they've stepped away or lost their connection. No worries, we're still recording your side, so just carry on whenever you're ready."
						autoDismissMs={9000}
						onDismiss={() => setCandidateRemoteDisconnected(false)}
					/>
				)}

				{/* D10 — Remote mode: candidate dropped/abandoned the session.
				    Firestore status:'abandoned' detected via onSnapshot. Brief,
				    non-dismissible notice, then home — not the interviewer lobby. */}
				{isRemoteMode && candidateAbandoned && !micGuardShowing && !overlaySuccess && (
					<MandatoryTimedOverlay
						durationMs={2500}
						onExpire={() => goHomeAfterSession()}
						title="Your candidate stepped out"
						body="They cancelled the session on their end, so we're taking you back to the homepage."
					/>
				)}

				{/* A3/D10 — Remote mode: candidate ended and saved the session.
				    Firestore status:'completed' detected via onSnapshot while the
				    interviewer hasn't submitted feedback yet. Mandatory, non-dismissible,
				    60s countdown — "Evaluate" reuses the same End Case & Evaluate overlay
				    used elsewhere; "Close" and the auto-timeout both send the interviewer
				    home after flushing their own recording. */}
				{isRemoteMode && candidateEndedSession && !micGuardShowing && !overlaySuccess && !candidateAbandoned && (
					<MandatoryTimedOverlay
						durationMs={60000}
						onExpire={() => { setCandidateEndedSession(false); void stopInterviewerRecordingAndUpload(); goHomeAfterSession() }}
						title="Your candidate wrapped up"
						body="They ended the session on their side. You can rate them now, or just close things out."
						primaryLabel="Evaluate the candidate"
						onPrimary={() => { setCandidateEndedSession(false); setShowEvalOverlay(true); setEditingOverlay(false) }}
						secondaryLabel="Close the session"
						onSecondary={() => { setCandidateEndedSession(false); void stopInterviewerRecordingAndUpload(); goHomeAfterSession() }}
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
										<p style={{ fontSize: '11px', color: 'rgba(92,64,51,0.62)', lineHeight: 1.45 }}>This wraps the current session and takes you back to the repository. The candidate will wait while you pick a new one.</p>
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
									.ne-ta::-webkit-scrollbar{width:4px}
									.ne-ta::-webkit-scrollbar-track{background:transparent}
									.ne-ta::-webkit-scrollbar-thumb{background:rgba(92,64,51,0.18);border-radius:9px}
									.ne-ta::-webkit-scrollbar-thumb:hover{background:rgba(92,64,51,0.32)}
									.ne-ta{scrollbar-width:thin;scrollbar-color:rgba(92,64,51,0.18) transparent}
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
									/* ── Success state ── */
									isRemoteMode ? (
										/* Remote: friendly manual-close prompt */
										<div style={{ padding: '24px 22px 28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
											<div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(61,90,53,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
												<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
											</div>
											<div>
												<p style={{ margin: '0 0 5px', fontSize: '15px', fontWeight: 700, color: '#2e2318' }}>That's a wrap!</p>
												<p style={{ margin: 0, fontSize: '11.5px', color: 'rgba(92,64,51,0.55)', lineHeight: 1.6 }}>
													Your feedback is in. You can close this tab now.
												</p>
											</div>
										</div>
									) : (
										/* Local/split-screen: countdown then window.close() */
										<div style={{ padding: '24px 22px 28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
											<div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(61,90,53,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
												<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
											</div>
											<div>
												<p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#2e2318' }}>All done.</p>
												<p style={{ margin: 0, fontSize: '11.5px', color: 'rgba(92,64,51,0.55)', lineHeight: 1.55 }}>
													{overlayAutoClose > 0 ? `Closing in ${overlayAutoClose}s…` : 'Closing…'}
												</p>
											</div>
											<div style={{ width: '100%', height: '2px', borderRadius: '1px', background: 'rgba(92,64,51,0.1)', overflow: 'hidden' }}>
												<div style={{ height: '100%', borderRadius: '1px', background: 'rgba(61,90,53,0.35)', width: `${(overlayAutoClose / 3) * 100}%`, transition: 'width 0.95s linear' }} />
											</div>
										</div>
									)
								) : showUnratedConfirm ? (
									/* ── Unrated confirmation state ── */
									<div style={{ padding: '16px 22px 22px' }}>
										<p style={{ margin: '12px 0 6px', fontSize: '14px', fontWeight: 600, color: '#2e2318', lineHeight: 1.35 }}>
											{unratedCriteria.length === LIVE_EVALUATION_CRITERIA.length
												? 'No parameters have been rated.'
												: `${unratedCriteria.length} of ${LIVE_EVALUATION_CRITERIA.length} parameters ${unratedCriteria.length === 1 ? 'hasn\'t' : 'haven\'t'} been rated.`}
										</p>
										<div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
											{unratedCriteria.map(c => (
												<div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
													<span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(146,64,14,0.45)', flexShrink: 0, display: 'inline-block' }} />
													<span style={{ fontSize: '12px', color: 'rgba(92,64,51,0.7)' }}>{c.label}</span>
												</div>
											))}
										</div>
										<p style={{ margin: '0 0 16px', fontSize: '12px', color: 'rgba(92,64,51,0.6)', lineHeight: 1.55 }}>
											Since not all parameters are rated, this case will show up as unrated on the candidate's dashboard and they won't see a score. You can go back and fill in the missing ratings, or submit as-is.
										</p>
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
									<div style={{ padding: '14px 22px 22px', maxHeight: 'min(80vh, 560px)', overflowY: 'auto' }}>
										<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
											{LIVE_EVALUATION_CRITERIA.map(c => {
												const committed = scores[c.id]
												const isHovering = evalHoverScore?.id === c.id
												const preview = isHovering ? evalHoverScore!.value : null
												const displayVal = preview ?? committed
												const rated = committed > 0
												const pct = (displayVal / 5) * 100
												const isPreviewing = isHovering && preview !== committed
												return (
													<div key={c.id}>
														<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
															<span style={{ fontSize: '12.5px', fontWeight: 600, color: '#2e2318' }}>{c.label}</span>
															{(rated || isHovering) && (
																<span style={{
																	fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
																	padding: '1px 7px', borderRadius: '999px',
																	transition: 'all 0.15s ease',
																	border: isPreviewing ? '1px dashed rgba(61,90,53,0.4)' : '1px solid rgba(61,90,53,0.35)',
																	background: isPreviewing ? 'transparent' : 'rgba(174,208,161,0.22)',
																	color: isPreviewing ? 'rgba(61,90,53,0.55)' : '#3D5A35',
																}}>
																	{displayVal}/5
																</span>
															)}
															{!rated && !isHovering && (
																<span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#b8a898' }}>NR</span>
															)}
														</div>
														<div
															style={{ position: 'relative', height: '16px', cursor: 'pointer', width: '100%' }}
															onMouseMove={e => {
																const now = Date.now()
																if (rated && evalClickCooldownRef.current > now) return
																const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
																const raw = (e.clientX - rect.left) / rect.width
																const snapped = Math.round(Math.max(0, Math.min(1, raw)) * 10) / 2
																setEvalHoverScore({ id: c.id, value: snapped })
															}}
															onMouseLeave={() => setEvalHoverScore(null)}
															onClick={e => {
																const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
																const raw = (e.clientX - rect.left) / rect.width
																const snapped = Math.round(Math.max(0, Math.min(1, raw)) * 10) / 2
																setScores({ ...scores, [c.id]: snapped })
																setEvalHoverScore(null)
																evalClickCooldownRef.current = Date.now() + 4000
															}}
														>
															{/* Track */}
															<div style={{ position: 'absolute', inset: '0 0 auto', top: '6px', height: '3px', borderRadius: '2px', background: 'rgba(92,64,51,0.16)' }} />
															{displayVal > 0 && (
																<div style={{
																	position: 'absolute', top: '6px', left: 0, height: '3px', borderRadius: '2px',
																	width: `${pct}%`,
																	background: isPreviewing ? 'rgba(61,90,53,0.38)' : '#3D5A35',
																	transition: 'width 0.08s ease, background 0.15s ease',
																}} />
															)}
															{displayVal > 0 && (
																<div style={{
																	position: 'absolute', top: '3px', width: '10px', height: '10px', borderRadius: '50%',
																	left: `calc(${pct}% - 5px)`,
																	background: isPreviewing ? 'rgba(61,90,53,0.45)' : '#3D5A35',
																	boxShadow: isPreviewing ? 'none' : '0 0 0 3px rgba(61,90,53,0.13)',
																	transition: 'left 0.08s ease, background 0.15s ease, box-shadow 0.15s ease',
																	pointerEvents: 'none',
																}} />
															)}
														</div>
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
									<div style={{ padding: '14px 22px 22px', maxHeight: 'min(80vh, 560px)', overflowY: 'auto' }}>
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
											<div className="ne-ta" style={{ borderRadius: '10px', border: '1px solid rgba(92,64,51,0.1)', background: 'rgba(255,249,242,0.65)', padding: '9px 12px', fontSize: '12px', lineHeight: 1.55, color: '#2e2318', minHeight: '42px', maxHeight: '160px', overflowY: 'auto' }}>
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
	}

	if (previewMode) return null

	// currentView is always 'case' at this point — the block above always
	// returns. Kept as an explicit fallback so the function's return type stays sound.
	return null
}

export default function InterviewerPage({ params }: { params: Promise<{ id: string }> }) {
	return (
		<CaseErrorBoundary>
			<InterviewerPageInner params={params} />
		</CaseErrorBoundary>
	)
}

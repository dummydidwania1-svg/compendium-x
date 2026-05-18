'use client'
import Image from 'next/image'
import { useEffect, useMemo, useState, useRef, ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { getDoc } from 'firebase/firestore'
import { waitForAuthUser } from '@/lib/firebase/config'
import { caseDoc } from '@/lib/firebase/collections'
import { apiPost } from '@/lib/api/client'
import { CaseForumSection } from '@/components/forum/CaseForumSection'
import CasePreviewView from '@/components/case/CasePreviewView'
import { CaseInterviewerMaster } from '@/components/case/CasePreviewMaster'

type CaseDocument = {
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
		.map((line) => line.trim())
		.filter((line) => line.length > 0)

	if (lines.length === 0) {
		return { transcriptLines: [], summaryTitle: null, summaryRows: [], recommendations: [] }
	}

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

	return { transcriptLines, summaryTitle, summaryRows, recommendations }
}

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
				text: normalized,
				speaker: 'candidate',
			}
		}

		return {
			text: normalized,
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
			? 'bg-[#6e4b2b] text-[#f7f0e6]'
			: tone === 'mid'
				? 'bg-[#ab8d6a] text-[#f7f0e6]'
				: 'bg-[#dcd0c3] text-[#171311]'

	return (
		<div className="space-y-2">
			<div className={`px-3 py-2.5 text-center text-[11px] font-black uppercase tracking-[0.12em] ${labelClass}`}>
				{label}
			</div>
			<div className="bg-[#f2eade] px-3 py-4 text-center text-[17px] uppercase leading-none tracking-[0.03em] text-[#211a16]">
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
					{ height: 'h-10', fill: 'bg-[#6d5b56]' },
					{ height: 'h-[3.65rem]', fill: 'bg-[#6f5437]' },
					{ height: 'h-[5.5rem]', fill: 'bg-[#f2eade]' },
				].map((bar, index) => (
					<div
						key={`difficulty-${index + 1}`}
						className={`w-full border-[3px] border-[#665143] ${bar.height} ${
							active > index ? bar.fill : 'bg-transparent'
						}`}
					/>
				))}
			</div>
			<div className="mt-4 bg-[#dcd0c3] px-3 py-2.5 text-center text-[11px] font-black uppercase tracking-[0.12em] text-[#171311]">
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
		<aside className="hidden w-[12rem] flex-shrink-0 lg:block lg:sticky lg:top-28">
			<div className="space-y-6">
				<BankingOnYouMetaField label="Case Type" value={caseTypeLabel} tone="dark" />
				<BankingOnYouMetaField label="Company" value={companyLabel} tone="light" />
				<BankingOnYouMetaField label="Round" value={roundLabel} tone="light" />
				<BankingOnYouMetaField label="Industry" value={industryLabel} tone="mid" />
				<BankingOnYouDifficulty level={difficultyLevel} label={difficultyLabel} />
			</div>
		</aside>
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
						<figure className="m-0 mx-auto mt-1 w-full min-w-[500px] max-w-[760px] overflow-hidden bg-[#f2ebe2]">
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

export default function InterviewerPage({ params }: { params: Promise<{ id: string }> }) {
	const [caseData, setCaseData] = useState<CaseDocument | null>(null)
	const [loading, setLoading] = useState(true)
	const [loadError, setLoadError] = useState('')
	const [reloadTick, setReloadTick] = useState(0)
	const [resolvedCaseId, setResolvedCaseId] = useState<string | null>(null)
	const router = useRouter()
	const searchParams = useSearchParams()
	const previewMode = searchParams.get('preview') === '1'
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
		if (explicit) return explicit
		return 'Client Not Specified'
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
			try {
				const resolvedParams = await params
				const caseId = resolvedParams.id
				setResolvedCaseId(caseId)
				const cacheKey = `compendium-case-${caseId}`
				const cachedValue = localStorage.getItem(cacheKey)
				if (cachedValue) {
					try {
						const parsed = JSON.parse(cachedValue) as CaseDocument
						if (parsed && typeof parsed.title === 'string') {
							setCaseData(parsed)
							setLoading(false)
						}
					} catch {
						localStorage.removeItem(cacheKey)
					}
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
				}
			} catch (error) {
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

	const handleSubmitFeedback = async () => {
		if (!resolvedCaseId || !caseData) return
		if (Object.values(scores).some((value) => value < 1)) {
			setSubmitError('Please rate all 4 criteria before submitting.')
			return
		}
		setSubmitting(true)
		setSubmitError('')
		const interviewerUser = await waitForAuthUser()
		if (!interviewerUser) {
			setSubmitting(false)
			router.push(`/login?redirect=${encodeURIComponent(`/case/${resolvedCaseId}/interviewer`)}`)
			return
		}

		try {
			await apiPost('/api/evaluations', {
				lobbyId: lobbyId ?? null,
				caseId: resolvedCaseId,
				scores: {
					structure: scores.structure,
					understanding: scores.understanding,
					delivery: scores.delivery,
					creativity: scores.creativity,
				},
				notes,
			})
		} catch (error) {
			setSubmitError(error instanceof Error ? error.message : 'Unable to save feedback.')
			setSubmitting(false)
			return
		}

		localStorage.setItem(
			'compendium-session-ended',
			JSON.stringify({ caseId: resolvedCaseId, lobbyId, endedAt: Date.now() }),
		)

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

	if (loading) {
		return (
			<div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center text-slate-400 font-sans">
				Loading Case Packet...
			</div>
		)
	}

	if (loadError) {
		return (
			<div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-6">
				<div className="max-w-lg w-full rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-md">
					<p className="font-semibold text-lg">Unable to load case</p>
					<p className="mt-2 text-sm text-red-600/90">{loadError}</p>
					<div className="mt-6 flex gap-3">
						<button
							onClick={() => setReloadTick((current) => current + 1)}
							className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 transition"
						>
							Retry Connection
						</button>
						<button
							onClick={() => router.push('/repository')}
							className="rounded-lg border-2 border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 transition"
						>
							Back to Repository
						</button>
					</div>
				</div>
			</div>
		)
	}

	if (!caseData) {
		return (
			<div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center text-red-500">Case not found.</div>
		)
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
					ForumSection={resolvedCaseId ? <CaseForumSection caseId={resolvedCaseId} caseTitle={caseData!.title} /> : undefined}
				/>
			)
		}

		if (!caseData) return null

		return (
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
				notes={notes}
				setNotes={setNotes}
				scores={scores}
				setScores={setScores}
				onEndCase={() => setCurrentView('feedback')}
			/>
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
								<div className="flex flex-1 flex-col gap-6 p-6 md:p-8">
									<section className="flex-shrink-0 border-b border-[#d8cdc0] pb-6">
										<div className="mb-3 flex items-center gap-3">
											<div className="h-2.5 w-2.5 rounded-full bg-[#7b5a3b]" />
											<h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#4a3f38]">
												Interviewer Notes
											</h3>
										</div>
										<textarea
											value={notes}
											onChange={(e) => setNotes(e.target.value)}
											placeholder="Record observations..."
											className="h-32 w-full resize-none rounded-[18px] border border-[#d5cabd] bg-[#f6efe5] p-4 text-[14px] italic leading-7 text-[#4a3f38] shadow-[inset_0_1px_2px_rgba(95,72,52,0.05)] transition-all placeholder:text-[#a09385] focus:border-[#4a3627] focus:outline-none focus:ring-2 focus:ring-[#4a3627]/10"
										/>
									</section>

									<section className="flex flex-col gap-4">
										<div className="border-b border-[#d8cdc0] pb-4">
											<h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#4a3f38]">
												Live Evaluation
											</h3>
										</div>
										<div className="space-y-4">
											{LIVE_EVALUATION_CRITERIA.map((criteria) => {
												const score = scores[criteria.id]
												return (
													<div
														key={criteria.id}
														className="rounded-[18px] border border-[#ded3c6] bg-[#f6efe5]/92 px-3.5 py-3 shadow-[0_18px_34px_-34px_rgba(73,53,37,0.5)]"
													>
														<div className="flex items-center justify-between gap-3">
															<span className="text-[13px] font-semibold leading-5 text-[#2d2520]">
																{criteria.label}
															</span>
															<span className="rounded-full border border-[#d5cabd] bg-[#fbf7f0] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#7f7b6a]">
																{score > 0 ? `${score}/5` : 'NR'}
															</span>
														</div>
														<div className="pb-1 pt-3">
															<input
																type="range"
																min="0"
																max="5"
																step="1"
																value={score}
																onChange={(e) =>
																	setScores({
																		...scores,
																		[criteria.id]: Number.parseInt(e.target.value, 10),
																	})
																}
																className="w-full cursor-pointer appearance-none rounded-full bg-[#cec5b9]/50 accent-[#4a3627]"
																style={{ height: '6px' }}
															/>
															<div className="mt-1.5 flex justify-between text-[9px] font-bold uppercase tracking-[0.12em] text-[#7f7b6a]">
																<span>NR</span>
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
											className="w-full rounded-[18px] bg-[#4a3627] py-4 text-[10px] font-bold uppercase tracking-[0.3em] text-[#efe8de] transition hover:bg-[#3d2c1f]"
										>
											End Case & Evaluate →
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
						Feedback submitted successfully. You can close this tab now.
					</p>
					<button
						onClick={closeOrExit}
						className="mt-8 w-full rounded-full bg-[#3D5A35] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:bg-[#34502d]"
						style={{ boxShadow: '0 6px 16px rgba(61,90,53,0.18), inset 0 1px 0 rgba(255,255,255,0.18)' }}
					>
						Close Window
					</button>
				</div>
			</div>
		)
	}

	const allScored = LIVE_EVALUATION_CRITERIA.every((c) => scores[c.id] >= 1)

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
							{editingFeedback ? 'Edit and lock your review before submitting.' : 'Review locked. Submit when you’re happy, or edit to change anything.'}
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
												step="1"
												value={score}
												onChange={(e) =>
													setScores({
														...scores,
														[criteria.id]: Number.parseInt(e.target.value, 10),
													})
												}
												className="mt-3 w-full cursor-pointer appearance-none rounded-full bg-[#cec5b9]/50 accent-[#3D5A35]"
												style={{ height: '6px' }}
											/>
											<div className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5c4033]/55">
												<span>1 — Poor</span>
												<span>5 — Excellent</span>
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
								<textarea
									rows={6}
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
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
					<div className="mt-5 rounded-xl border border-[#92400e]/22 bg-[rgba(255,245,233,0.92)] px-4 py-3">
						<p className="text-[10px] uppercase tracking-[0.18em] text-[#92400e]">
							Could not submit
						</p>
						<p className="mt-1 text-[12px] leading-relaxed text-[#5c4033]">{submitError}</p>
					</div>
				) : null}

				<button
					onClick={handleSubmitFeedback}
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

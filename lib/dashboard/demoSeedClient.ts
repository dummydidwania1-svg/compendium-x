import type { User } from 'firebase/auth'
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'
import casesCatalog from '@/data/cases.json'
import { MOCK_CASES } from '@/data/mockData'
import { MOCK_FEEDBACK } from '@/data/mockFeedback'
import { db } from '@/lib/firebase/config'

const WORKSPACE_PLACEHOLDER_URL = '/demo/workspace-placeholder.svg'
const DEMO_SEED_LABEL = 'dashboard-persona-v1'

type CatalogCase = {
  id?: number
  docId?: string
  title?: string
  industry?: string
  difficulty?: string
  case_type?: string
  caseType?: string
}

type MockCase = (typeof MOCK_CASES)[number]
type FeedbackCase = (typeof MOCK_FEEDBACK)[number]

export type DemoSeedInspection = {
  totalCases: number
  existingEvaluations: number
  existingDemoEvaluations: number
  existingRealEvaluations: number
  plannedEvaluationWrites: number
  plannedSessionWrites: number
  userEmail: string | null
}

export type DemoSeedResult = DemoSeedInspection & {
  goalTargetCases: number
}

function normalizeTitle(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function fallbackNotes(entry: MockCase) {
  const strengths: string[] = []
  const gaps: string[] = []

  if (entry.structure >= 3) strengths.push('the structure felt clearer and more sequenced')
  if (entry.analysis >= 3) strengths.push('the analysis was more grounded in logic')
  if (entry.delivery >= 3) strengths.push('communication stayed calmer through the case')
  if (entry.creativity >= 4) strengths.push('there were still distinctive ideas in the recommendation')

  if (entry.structure <= 1.5) gaps.push('making the initial framework more explicit')
  if (entry.analysis <= 1.5) gaps.push('slowing down the reasoning under pressure')
  if (entry.delivery <= 1.5) gaps.push('reducing hesitation while communicating')
  if (entry.creativity <= 2.5) gaps.push('pushing beyond the first obvious idea')

  const strengthsText =
    strengths.length > 0
      ? `Strengths: ${strengths.join(', ')}.`
      : 'Strengths: there were still moments of good instinct during the case.'
  const gapsText =
    gaps.length > 0
      ? `Focus next on ${gaps.join(', ')}.`
      : 'The main next step is making this level repeatable across more cases.'

  return `${entry.type} case at ${entry.level} difficulty. ${strengthsText} ${gapsText}`
}

function fallbackTranscript(entry: MockCase, notes: string) {
  return [
    'Interviewer: Let me give you a quick debrief.',
    `Interviewer: ${notes}`,
    `Interviewer: Relative to your other ${entry.type.toLowerCase()} cases, this one felt ${entry.score >= 3 ? 'more controlled' : 'less settled'} overall.`,
  ].join('\n')
}

function createdAtForDate(dateString: string) {
  return Timestamp.fromDate(new Date(`${dateString}T12:00:00.000Z`))
}

function buildCaseCatalog() {
  const map = new Map<
    string,
    {
      caseId: string | null
      industry: string | null
      difficulty: string | null
      caseType: string | null
    }
  >()

  for (const item of casesCatalog as CatalogCase[]) {
    const key = normalizeTitle(item.title)
    if (!key) continue
    map.set(key, {
      caseId: typeof item.docId === 'string' && item.docId.trim() ? item.docId.trim() : null,
      industry: typeof item.industry === 'string' && item.industry.trim() ? item.industry.trim() : null,
      difficulty: typeof item.difficulty === 'string' && item.difficulty.trim() ? item.difficulty.trim() : null,
      caseType:
        typeof item.case_type === 'string' && item.case_type.trim()
          ? item.case_type.trim()
          : typeof item.caseType === 'string' && item.caseType.trim()
            ? item.caseType.trim()
            : null,
    })
  }

  return map
}

function feedbackMap() {
  return new Map<string, FeedbackCase>(MOCK_FEEDBACK.map((item) => [String(item.id), item]))
}

async function inspectExisting(user: User) {
  const snapshot = await getDocs(
    query(collection(db, 'evaluations'), where('candidateId', '==', user.uid))
  )

  let existingDemoEvaluations = 0
  snapshot.forEach((docSnapshot) => {
    if (docSnapshot.data()?.demoSeed === true) {
      existingDemoEvaluations += 1
    }
  })

  return {
    existingEvaluations: snapshot.size,
    existingDemoEvaluations,
    existingRealEvaluations: snapshot.size - existingDemoEvaluations,
  }
}

export async function inspectDashboardDemoSeed(user: User): Promise<DemoSeedInspection> {
  const existing = await inspectExisting(user)
  return {
    totalCases: MOCK_CASES.length,
    existingEvaluations: existing.existingEvaluations,
    existingDemoEvaluations: existing.existingDemoEvaluations,
    existingRealEvaluations: existing.existingRealEvaluations,
    plannedEvaluationWrites: MOCK_CASES.length,
    plannedSessionWrites: MOCK_CASES.length,
    userEmail: user.email ?? null,
  }
}

export async function seedDashboardDemoForUser(
  user: User,
  options?: { goalTargetCases?: number }
): Promise<DemoSeedResult> {
  const goalTargetCases = options?.goalTargetCases ?? 50
  const catalog = buildCaseCatalog()
  const feedbackById = feedbackMap()
  const batch = writeBatch(db)

  const profileRef = doc(db, 'profiles', user.uid)
  batch.set(
    profileRef,
    {
      goalTargetCases,
      demoSeedLabel: DEMO_SEED_LABEL,
      demoSeededAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  )

  for (const entry of MOCK_CASES) {
    const titleKey = normalizeTitle(entry.name)
    const caseMeta = catalog.get(titleKey) ?? null
    const feedback = feedbackById.get(String(entry.id)) ?? null
    const notes = feedback?.notes?.trim() || fallbackNotes(entry)
    const transcript = entry.hasTranscript
      ? feedback?.verbal?.trim() || fallbackTranscript(entry, notes)
      : null
    const createdAt = createdAtForDate(entry.date)
    const evaluationId = `demo-eval-${user.uid}-${entry.id}`
    const lobbyId = `demo-lobby-${user.uid}-${entry.id}`
    const workspaceImageUrls = entry.hasSnapshot ? [WORKSPACE_PLACEHOLDER_URL] : []

    batch.set(
      doc(db, 'evaluations', evaluationId),
      {
        caseId: caseMeta?.caseId ?? null,
        caseTitle: entry.name,
        caseType: caseMeta?.caseType ?? entry.type,
        difficulty: caseMeta?.difficulty ?? entry.level,
        industry: caseMeta?.industry ?? null,
        lobbyId,
        candidateId: user.uid,
        candidateName: user.displayName || user.email || user.uid,
        interviewerId: 'demo-seed',
        interviewerEmail: 'demo-seed@compendiumx.local',
        structureScore: entry.structure,
        understandingScore: entry.analysis,
        deliveryScore: entry.delivery,
        creativityScore: entry.creativity,
        notes,
        interviewerObservations: notes,
        workspaceImageUrls,
        createdAt,
        updatedAt: createdAt,
        demoSeed: true,
        demoSeedLabel: DEMO_SEED_LABEL,
        demoSeedMockId: entry.id,
      },
      { merge: true }
    )

    batch.set(
      doc(db, 'sessions', lobbyId),
      {
        candidateId: user.uid,
        candidateEmail: user.email ?? null,
        interviewerId: 'demo-seed',
        role: 'candidate',
        mode: 'remote',
        caseId: caseMeta?.caseId ?? null,
        status: 'completed',
        selectedCaseId: caseMeta?.caseId ?? null,
        completedAt: createdAt,
        updatedAt: createdAt,
        demoSeed: true,
        demoSeedLabel: DEMO_SEED_LABEL,
        demoSeedMockId: entry.id,
        recording: {
          status: transcript ? 'uploaded' : 'not_recorded',
          mode: 'remote',
          transcriptStatus: transcript ? 'completed' : 'not_requested',
          transcript,
          transcriptPreview: transcript ? transcript.slice(0, 1000) : null,
          transcriptError: null,
          transcriptModel: transcript ? 'demo-seed' : null,
          audioUrl: null,
          updatedAt: createdAt,
        },
      },
      { merge: true }
    )
  }

  await batch.commit()

  const existing = await inspectExisting(user)
  return {
    totalCases: MOCK_CASES.length,
    existingEvaluations: existing.existingEvaluations,
    existingDemoEvaluations: existing.existingDemoEvaluations,
    existingRealEvaluations: existing.existingRealEvaluations,
    plannedEvaluationWrites: MOCK_CASES.length,
    plannedSessionWrites: MOCK_CASES.length,
    userEmail: user.email ?? null,
    goalTargetCases,
  }
}

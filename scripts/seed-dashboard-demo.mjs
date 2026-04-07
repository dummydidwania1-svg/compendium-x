import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const serviceAccountPath = path.resolve(projectRoot, 'serviceAccountKey.json')
const mockDataPath = path.resolve(projectRoot, 'data', 'mockData.ts')
const mockFeedbackPath = path.resolve(projectRoot, 'data', 'mockFeedback.ts')
const localCasesPath = path.resolve(projectRoot, 'data', 'cases.json')
const WORKSPACE_PLACEHOLDER_URL = '/demo/workspace-placeholder.svg'
const DEMO_SEED_LABEL = 'dashboard-persona-v1'
const PARAM_WEIGHTS = {
  structure: 0.3,
  delivery: 0.3,
  analysis: 0.2,
  creativity: 0.2,
}

function printUsage() {
  console.log(`
Seed the tailored dashboard mock history into one Firebase user account.

Usage:
  node scripts/seed-dashboard-demo.mjs --email demo@example.com
  node scripts/seed-dashboard-demo.mjs --uid FIREBASE_UID
  node scripts/seed-dashboard-demo.mjs --email demo@example.com --goal-target 50 --dry-run

Options:
  --email <email>         Resolve the Firebase Auth user by email
  --uid <uid>             Resolve the Firebase Auth user by uid
  --goal-target <number>  Goal target to store on the profile (default: 50)
  --dry-run               Print what would be written without writing it
  --help                  Show this help

Notes:
  - This script only seeds one user.
  - It writes deterministic demo evaluations and sessions, so re-running updates the same demo docs.
  - It does not delete a user's real history. Use a fresh/demo account if you want a pure demo persona.
`)
}

function parseArgs(argv) {
  const options = {
    email: '',
    uid: '',
    goalTarget: 50,
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--help' || current === '-h') {
      printUsage()
      process.exit(0)
    }

    if (current === '--email') {
      options.email = argv[index + 1] ?? ''
      index += 1
      continue
    }

    if (current === '--uid') {
      options.uid = argv[index + 1] ?? ''
      index += 1
      continue
    }

    if (current === '--goal-target') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10)
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`Invalid --goal-target value: ${argv[index + 1] ?? ''}`)
      }
      options.goalTarget = value
      index += 1
      continue
    }

    if (current === '--dry-run') {
      options.dryRun = true
      continue
    }

    throw new Error(`Unknown argument: ${current}`)
  }

  if (!options.email && !options.uid) {
    throw new Error('Provide either --email or --uid.')
  }

  if (options.email && options.uid) {
    throw new Error('Use either --email or --uid, not both.')
  }

  return options
}

function extractExportArray(filePath, exportName) {
  const source = fs.readFileSync(filePath, 'utf8')
  const pattern = new RegExp(`export const ${exportName} = (\\[[\\s\\S]*?\\n\\]);`)
  const match = source.match(pattern)
  if (!match) {
    throw new Error(`Unable to find export "${exportName}" in ${filePath}`)
  }

  const literal = match[1]
    .replace(/^\s*\/\/.*$/gm, '')
    .trim()
    .replace(/;$/, '')

  return vm.runInNewContext(literal)
}

function normalizeTitle(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function computeWeightedScore(entry) {
  return +(
    entry.structure * PARAM_WEIGHTS.structure +
    entry.delivery * PARAM_WEIGHTS.delivery +
    entry.analysis * PARAM_WEIGHTS.analysis +
    entry.creativity * PARAM_WEIGHTS.creativity
  ).toFixed(1)
}

function timestampForDate(dateString) {
  return admin.firestore.Timestamp.fromDate(new Date(`${dateString}T12:00:00.000Z`))
}

function sentenceCase(value) {
  return String(value ?? '')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase()
      if (index === 0) return lower.charAt(0).toUpperCase() + lower.slice(1)
      return lower
    })
    .join(' ')
}

function buildFallbackNotes(entry) {
  const strengths = []
  const gaps = []

  if (entry.structure >= 3) strengths.push('the structure was clear and sequenced')
  if (entry.analysis >= 3) strengths.push('the analysis felt grounded in logic')
  if (entry.delivery >= 3) strengths.push('communication stayed calm and interviewer-led')
  if (entry.creativity >= 4) strengths.push('creative thinking surfaced at the right moments')

  if (entry.structure <= 1.5) gaps.push('the opening framework was not yet fully MECE')
  if (entry.analysis <= 1.5) gaps.push('the analysis lost rigor once the case got more quantitative')
  if (entry.delivery <= 1.5) gaps.push('communication became hesitant under pressure')
  if (entry.creativity <= 2.5) gaps.push('ideas stayed too standard and could be pushed further')

  const strengthsText =
    strengths.length > 0
      ? `Strengths: ${strengths.join(', ')}.`
      : 'Strengths: there were still isolated moments of good instinct.'

  const gapsText =
    gaps.length > 0
      ? `Focus next on ${gaps.join(', ')}.`
      : 'The main opportunity now is making this level repeatable across more cases.'

  return `${sentenceCase(entry.type)} case at ${entry.level.toLowerCase()} difficulty. ${strengthsText} ${gapsText}`
}

function buildFallbackTranscript(entry, notes) {
  return [
    'Interviewer: Let me give you a quick debrief.',
    `Interviewer: ${notes}`,
    `Interviewer: Relative to your other ${entry.type.toLowerCase()} cases, this one felt ${entry.score >= 3 ? 'more controlled' : 'less settled'} overall.`,
  ].join('\n')
}

function loadLocalCaseCatalog() {
  if (!fs.existsSync(localCasesPath)) return new Map()
  const parsed = JSON.parse(fs.readFileSync(localCasesPath, 'utf8'))
  const map = new Map()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const titleKey = normalizeTitle(item.title)
    if (!titleKey) continue
    map.set(titleKey, {
      caseId: typeof item.docId === 'string' && item.docId.trim() ? item.docId.trim() : null,
      industry: typeof item.industry === 'string' && item.industry.trim() ? item.industry.trim() : null,
      difficulty: typeof item.difficulty === 'string' && item.difficulty.trim() ? item.difficulty.trim() : null,
      caseType: typeof item.case_type === 'string' && item.case_type.trim() ? item.case_type.trim() : null,
    })
  }
  return map
}

async function loadRemoteCaseCatalog(db) {
  const snapshot = await db.collection('cases').get()
  const map = new Map()
  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data()
    const titleKey = normalizeTitle(data.title)
    if (!titleKey) return
    map.set(titleKey, {
      caseId: docSnapshot.id,
      industry: typeof data.industry === 'string' && data.industry.trim() ? data.industry.trim() : null,
      difficulty: typeof data.difficulty === 'string' && data.difficulty.trim() ? data.difficulty.trim() : null,
      caseType:
        typeof data.case_type === 'string' && data.case_type.trim()
          ? data.case_type.trim()
          : typeof data.caseType === 'string' && data.caseType.trim()
            ? data.caseType.trim()
            : null,
    })
  })
  return map
}

async function resolveUser(auth, options) {
  if (options.uid) return auth.getUser(options.uid)
  return auth.getUserByEmail(options.email)
}

function buildDemoRecords(mockCases, feedbackById, caseCatalog, userRecord) {
  return mockCases.map((entry) => {
    const titleKey = normalizeTitle(entry.name)
    const caseMeta = caseCatalog.get(titleKey) ?? null
    const feedback = feedbackById.get(entry.id) ?? null
    const notes = feedback?.notes?.trim() || buildFallbackNotes(entry)
    const transcript = entry.hasTranscript
      ? (feedback?.verbal?.trim() || buildFallbackTranscript(entry, notes))
      : null
    const createdAt = timestampForDate(entry.date)
    const evaluationId = `demo-eval-${userRecord.uid}-${entry.id}`
    const lobbyId = `demo-lobby-${userRecord.uid}-${entry.id}`
    const workspaceImageUrls = entry.hasSnapshot ? [WORKSPACE_PLACEHOLDER_URL] : []

    return {
      evaluationId,
      lobbyId,
      createdAt,
      evaluation: {
        caseId: caseMeta?.caseId ?? null,
        caseTitle: entry.name,
        caseType: caseMeta?.caseType ?? entry.type,
        difficulty: caseMeta?.difficulty ?? entry.level,
        industry: caseMeta?.industry ?? null,
        lobbyId,
        candidateId: userRecord.uid,
        candidateName: userRecord.displayName || userRecord.email || userRecord.uid,
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
      session: {
        candidateId: userRecord.uid,
        candidateEmail: userRecord.email || null,
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
          storagePath: null,
          mimeType: transcript ? 'text/plain' : null,
          updatedAt: createdAt,
        },
      },
    }
  })
}

async function countUserEvaluations(db, uid) {
  const snapshot = await db.collection('evaluations').where('candidateId', '==', uid).get()
  let demoSeedCount = 0
  snapshot.forEach((docSnapshot) => {
    if (docSnapshot.data()?.demoSeed === true) {
      demoSeedCount += 1
    }
  })
  return {
    total: snapshot.size,
    demoSeed: demoSeedCount,
    real: snapshot.size - demoSeedCount,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account key not found: ${serviceAccountPath}`)
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  }

  const db = admin.firestore()
  const auth = admin.auth()
  const userRecord = await resolveUser(auth, options)

  const mockCases = extractExportArray(mockDataPath, 'MOCK_CASES').map((entry) => ({
    ...entry,
    score: computeWeightedScore(entry),
  }))
  const mockFeedback = extractExportArray(mockFeedbackPath, 'MOCK_FEEDBACK')
  const feedbackById = new Map(mockFeedback.map((item) => [String(item.id), item]))

  const remoteCaseCatalog = await loadRemoteCaseCatalog(db)
  const fallbackCaseCatalog = loadLocalCaseCatalog()
  const mergedCaseCatalog = new Map([...fallbackCaseCatalog, ...remoteCaseCatalog])

  const demoRecords = buildDemoRecords(mockCases, feedbackById, mergedCaseCatalog, userRecord)
  const existing = await countUserEvaluations(db, userRecord.uid)

  console.log(`\nTarget user: ${userRecord.email || userRecord.uid}`)
  console.log(`Existing evaluations: ${existing.total} (${existing.real} real, ${existing.demoSeed} demo-seeded)`)
  console.log(`Demo evaluations to upsert: ${demoRecords.length}`)
  console.log(`Goal target to set: ${options.goalTarget}`)

  if (options.dryRun) {
    console.log('\nDry run only. No Firestore writes were made.')
    return
  }

  const batch = db.batch()
  const profileRef = db.collection('profiles').doc(userRecord.uid)
  batch.set(
    profileRef,
    {
      goalTargetCases: options.goalTarget,
      demoSeedLabel: DEMO_SEED_LABEL,
      demoSeededAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  for (const record of demoRecords) {
    batch.set(db.collection('evaluations').doc(record.evaluationId), record.evaluation, { merge: true })
    batch.set(db.collection('sessions').doc(record.lobbyId), record.session, { merge: true })
  }

  await batch.commit()

  console.log('\nDashboard demo seed complete.')
  console.log(`Seed label: ${DEMO_SEED_LABEL}`)
  console.log(`User uid: ${userRecord.uid}`)
  console.log(`Evaluations upserted: ${demoRecords.length}`)
  console.log(`Sessions upserted: ${demoRecords.length}`)
}

main().catch((error) => {
  console.error('\nDashboard demo seed failed.')
  console.error(error)
  process.exit(1)
})

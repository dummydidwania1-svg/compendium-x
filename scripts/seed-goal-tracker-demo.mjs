import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const serviceAccountPath = path.resolve(projectRoot, 'serviceAccountKey.json')

const CASE_TYPES = ['Profitability', 'Market Entry', 'Growth', 'Pricing', 'Unconventional', 'Guesstimate']
const DEMO_SEED_LABEL = 'goal-tracker-demo-v1'

function printUsage() {
  console.log(`
Seed a Goal Tracker test config + a realistic spread of completed sessions
for one Firebase user account, so the Goal Tracker card and its AI Insight
layer both have enough data to be meaningfully testable.

Usage:
  node scripts/seed-goal-tracker-demo.mjs --email test@example.com
  node scripts/seed-goal-tracker-demo.mjs --uid FIREBASE_UID [--sessions 24] [--days 35] [--dry-run]

Options:
  --email <email>      Resolve the Firebase Auth user by email
  --uid <uid>           Resolve the Firebase Auth user by uid
  --sessions <number>  Number of completed sessions to seed (default: 24)
  --days <number>       Spread sessions across this many past days (default: 35)
  --dry-run             Print what would be written without writing it
  --help                Show this help

What gets written:
  - goals/{uid}: a Flow 1 goal (total + deadline) — 40 cases by ~5 weeks out,
    startDate 35 days ago so countPastCases picks up the seeded history.
  - sessions/{lobbyId}: N completed sessions with real caseId links (pulled
    from the live 'cases' collection), spread unevenly across --days so
    day-of-week/momentum/streak patterns are genuinely present (not just
    evenly spaced noise).
  - evaluations/{id}: one evaluation per session with real 4-dimension scores
    (a mild upward trend baked in, so score-correlation insight shapes have
    something real to find), matching lobbyId so countMode:'rated' also works.

Re-running upserts the same demo-seeded docs (idempotent, tagged demoSeedLabel).
`)
}

function parseArgs(argv) {
  const options = { email: '', uid: '', sessions: 24, days: 35, dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') { printUsage(); process.exit(0) }
    if (arg === '--email') { options.email = argv[i + 1] ?? ''; i += 1; continue }
    if (arg === '--uid') { options.uid = argv[i + 1] ?? ''; i += 1; continue }
    if (arg === '--sessions') { options.sessions = Number.parseInt(argv[i + 1] ?? '', 10); i += 1; continue }
    if (arg === '--days') { options.days = Number.parseInt(argv[i + 1] ?? '', 10); i += 1; continue }
    if (arg === '--dry-run') { options.dryRun = true; continue }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.email && !options.uid) throw new Error('Provide either --email or --uid.')
  if (options.email && options.uid) throw new Error('Use either --email or --uid, not both.')
  if (!Number.isFinite(options.sessions) || options.sessions < 1) throw new Error('Invalid --sessions value.')
  if (!Number.isFinite(options.days) || options.days < 7) throw new Error('Invalid --days value (min 7).')
  return options
}

function toDMY(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

/** Deterministic pseudo-random in [0,1), seeded so re-runs are stable. */
function seededRandom(seed) {
  let x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

async function resolveUser(auth, options) {
  if (options.uid) return auth.getUser(options.uid)
  return auth.getUserByEmail(options.email)
}

async function loadCaseCatalog(db) {
  const snapshot = await db.collection('cases').get()
  const byType = new Map()
  snapshot.forEach((doc) => {
    const data = doc.data()
    const type = typeof data.case_type === 'string' && data.case_type.trim() ? data.case_type.trim() : null
    if (!type) return
    if (!byType.has(type)) byType.set(type, [])
    byType.get(type).push({ caseId: doc.id, title: data.title ?? 'Untitled Case' })
  })
  return byType
}

/**
 * Builds N session+evaluation pairs spread across `days` with deliberate
 * patterns (not uniform noise), so the AI-insight shapes have real signal:
 *  - Clustered on weekday evenings (day-of-week + time-of-day clustering).
 *  - A mild score uptrend over time (pace-vs-score / consistency shapes).
 *  - Heavier weighting on 2-3 case types (type concentration / pair clustering).
 */
function buildSeedPlan(sessionCount, dayspan, caseCatalog, userRecord) {
  const availableTypes = CASE_TYPES.filter((t) => caseCatalog.has(t) && caseCatalog.get(t).length > 0)
  if (availableTypes.length === 0) {
    throw new Error('No cases found in the "cases" collection for any of the known case types — seed the case library first.')
  }
  // Weight the first two available types heavier, to create a real type-concentration pattern.
  const weighted = [
    ...Array(5).fill(availableTypes[0]),
    ...Array(3).fill(availableTypes[Math.min(1, availableTypes.length - 1)]),
    ...availableTypes.slice(2),
  ]

  const now = new Date()
  const records = []

  for (let i = 0; i < sessionCount; i += 1) {
    // Spread sessions with a mild recency bias (more sessions in recent days
    // than the distant past) plus weekday clustering.
    const rand = seededRandom(i * 7.13 + 1)
    const dayOffset = Math.floor((1 - Math.pow(rand, 1.4)) * dayspan)
    const date = new Date(now)
    date.setDate(date.getDate() - dayOffset)
    // Bias toward weekday evenings: push weekend sessions to the nearest weekday, set hour 18-21.
    if (date.getDay() === 0) date.setDate(date.getDate() + 1)
    if (date.getDay() === 6) date.setDate(date.getDate() - 1)
    const hour = 18 + Math.floor(seededRandom(i * 3.7 + 2) * 4)
    date.setHours(hour, Math.floor(seededRandom(i * 1.9) * 60), 0, 0)

    const type = weighted[Math.floor(seededRandom(i * 11.3 + 3) * weighted.length)]
    const catalog = caseCatalog.get(type)
    const caseEntry = catalog[Math.floor(seededRandom(i * 5.1 + 4) * catalog.length)]

    // Mild upward score trend across the seeded window (older = slightly lower).
    const recencyFactor = 1 - dayOffset / dayspan // 0 (oldest) -> 1 (newest)
    const base = 2.6 + recencyFactor * 1.1
    const jitter = (seededRandom(i * 2.3 + 5) - 0.5) * 0.8
    const clamp = (v) => Math.max(0.5, Math.min(5, +v.toFixed(1)))
    const structureScore = clamp(base + jitter)
    const understandingScore = clamp(base + jitter * 0.8)
    const deliveryScore = clamp(base + jitter * 1.2)
    const creativityScore = clamp(base + jitter * 0.6)

    const lobbyId = `goaltest-lobby-${userRecord.uid}-${i}`
    const evaluationId = `goaltest-eval-${userRecord.uid}-${i}`
    const ts = admin.firestore.Timestamp.fromDate(date)

    records.push({
      lobbyId,
      evaluationId,
      date,
      session: {
        lobbyId,
        candidateId: userRecord.uid,
        candidateEmail: userRecord.email || null,
        status: 'completed',
        sessionMode: 'remote',
        caseId: caseEntry.caseId,
        createdAt: ts,
        updatedAt: ts,
        completedAt: ts,
        completedBy: userRecord.uid,
        demoSeed: true,
        demoSeedLabel: DEMO_SEED_LABEL,
      },
      evaluation: {
        caseId: caseEntry.caseId,
        caseTitle: caseEntry.title,
        caseType: type,
        lobbyId,
        candidateId: userRecord.uid,
        interviewerId: 'goal-tracker-demo-seed',
        candidateName: userRecord.displayName || userRecord.email || userRecord.uid,
        interviewerEmail: 'goal-tracker-demo-seed@compendiumx.local',
        structureScore,
        understandingScore,
        deliveryScore,
        creativityScore,
        isUnrated: false,
        notes: `Seeded evaluation for Goal Tracker testing (${type}).`,
        createdAt: ts,
        updatedAt: ts,
        demoSeed: true,
        demoSeedLabel: DEMO_SEED_LABEL,
      },
    })
  }

  return records.sort((a, b) => a.date - b.date)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account key not found: ${serviceAccountPath}`)
  }
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  }

  const db = admin.firestore()
  const auth = admin.auth()
  const userRecord = await resolveUser(auth, options)

  const caseCatalog = await loadCaseCatalog(db)
  const records = buildSeedPlan(options.sessions, options.days, caseCatalog, userRecord)

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - options.days)
  startDate.setHours(0, 0, 0, 0)

  const endDate = new Date()
  endDate.setDate(endDate.getDate() + 21) // ~3 weeks from now, so the goal is mid-flight, not fresh or overdue
  endDate.setHours(0, 0, 0, 0)

  const goalConfig = {
    hasEndDate: true,
    endDate: toDMY(endDate),
    hasRecurring: false,
    recurringCount: 0,
    recurringEvery: 0,
    recurringUnit: 'weeks',
    totalCases: 40,
    hasPerType: false,
    perType: {},
    startDate: toDMY(startDate),
    countPastCases: true,
    countMode: 'completed',
    excludedTypes: [],
    excludedSessionIds: [],
    goalKind: 'flat',
  }

  console.log(`\nTarget user: ${userRecord.email || userRecord.uid} (${userRecord.uid})`)
  console.log(`Goal: Flow 1 (total + deadline) — ${goalConfig.totalCases} cases, startDate ${goalConfig.startDate}, endDate ${goalConfig.endDate}`)
  console.log(`Sessions to seed: ${records.length}, spread across the last ${options.days} days`)
  console.log(`Case types used: ${[...new Set(records.map((r) => r.evaluation.caseType))].join(', ')}`)

  if (options.dryRun) {
    console.log('\nDry run only. No Firestore writes were made.')
    console.log('Sample record:', JSON.stringify(records[0], null, 2))
    return
  }

  const batch = db.batch()
  batch.set(
    db.collection('goals').doc(userRecord.uid),
    { ...goalConfig, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: false },
  )
  for (const record of records) {
    batch.set(db.collection('sessions').doc(record.lobbyId), record.session, { merge: true })
    batch.set(db.collection('evaluations').doc(record.evaluationId), record.evaluation, { merge: true })
  }
  await batch.commit()

  console.log('\nGoal Tracker demo seed complete.')
  console.log(`Seed label: ${DEMO_SEED_LABEL}`)
  console.log(`Sessions + evaluations upserted: ${records.length}`)
  console.log(`Goal config written to goals/${userRecord.uid}`)
}

main().catch((error) => {
  console.error('\nGoal Tracker demo seed failed.')
  console.error(error)
  process.exit(1)
})

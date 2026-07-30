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
const DEMO_SEED_LABEL = 'goal-tracker-power-user-v1'

function printUsage() {
  console.log(`
Seed a MUCH richer "power user" dataset for one Firebase account — a user
who has done lots and lots of cases over a long stretch, with deliberately
sharp patterns baked in so nearly every one of the 25 AI-insight shapes
clears its data-sufficiency threshold, plus goalHistory entries for the
cross-goal axis (which the smaller demo seed never populated).

Usage:
  node scripts/seed-goal-tracker-power-user.mjs --email test@example.com
  node scripts/seed-goal-tracker-power-user.mjs --uid FIREBASE_UID [--dry-run]

What gets written:
  - goals/{uid}: a Flow 1 goal (total + deadline), 120 cases, startDate 90
    days ago, countPastCases:true, so the whole seeded history counts.
  - sessions/{lobbyId} + evaluations/{id}: ~90 completed+rated sessions
    spread across 90 days with DELIBERATE, sharp patterns:
      * Heavy concentration on 2 case types (~65% combined), one type
        (Unconventional) never touched at all (untouched-type gap).
      * Strong Tuesday/Thursday evening clustering (day-of-week + time-of-day).
      * A real front-loaded weekly rhythm: most sessions land in the first
        half of each week, almost none on weekends.
      * A genuine near-miss cadence pattern for the last several weeks
        (hits 2 of 3 target most weeks, rarely the full 3) — feeds
        near-miss + streak-length-vs-score shapes.
      * One deliberate multi-week miss in the middle of the range, followed
        by a clean recovery run afterward (recovery-after-miss pattern),
        with a real score dip in the two sessions right after the miss
        (post-miss-score-pattern).
      * A genuine score uptrend from ~2.4 avg at the start to ~4.2 avg at
        the end (pace-vs-score / volume-vs-score / consistency shapes),
        NOT linear — includes a cram-before-deadline dip in the final
        week (end-of-period-rush-vs-score-pattern).
      * A late-stage difficulty escalation: last 3 weeks skew toward
        harder cases than earlier weeks (difficulty-mix / escalation shapes
        — only fires if difficulty is ever wired into the case-type
        detectors; currently a documented no-op in insightShapes.ts, so
        this is seeded for when that gap is closed, harmless otherwise).
  - goalHistory/{uid}/entries/*: 3 closed prior goals — two completed
    (one flat, one cadence) and one that fell short — so completion-rate,
    preferred-goal-shape, and recurring-slip-point all have real signal.

Re-running upserts the same demo-tagged docs (idempotent).
`)
}

function parseArgs(argv) {
  const options = { email: '', uid: '', dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') { printUsage(); process.exit(0) }
    if (arg === '--email') { options.email = argv[i + 1] ?? ''; i += 1; continue }
    if (arg === '--uid') { options.uid = argv[i + 1] ?? ''; i += 1; continue }
    if (arg === '--dry-run') { options.dryRun = true; continue }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.email && !options.uid) throw new Error('Provide either --email or --uid.')
  if (options.email && options.uid) throw new Error('Use either --email or --uid, not both.')
  return options
}

function toDMY(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

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

/** Local-midnight Date for `daysAgo` days before now. */
function dayOffset(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(0, 0, 0, 0)
  return d
}

const TOTAL_DAYS = 180
const MISS_WEEK_START_DAY = 90 // days ago — the deliberate multi-week miss
const MISS_WEEK_SPAN_DAYS = 14 // ~2 weeks with almost no sessions

/**
 * Builds a deliberately patterned session/evaluation plan across TOTAL_DAYS,
 * rather than smooth randomized noise — every axis gets a real, sharp signal.
 */
function buildPowerUserPlan(caseCatalog, userRecord) {
  const availableTypes = CASE_TYPES.filter((t) => caseCatalog.has(t) && caseCatalog.get(t).length > 0)
  if (availableTypes.length < 4) {
    throw new Error('Need at least 4 case types with real cases in the "cases" collection to seed the power-user dataset.')
  }
  // Deliberately never touch the last available type — untouched-type gap.
  const untouchedType = availableTypes[availableTypes.length - 1]
  const usableTypes = availableTypes.slice(0, -1)
  // Heavy concentration on the first two usable types.
  const weighted = [
    ...Array(6).fill(usableTypes[0]),
    ...Array(4).fill(usableTypes[1]),
    ...usableTypes.slice(2),
  ]

  const records = []
  let idx = 0

  // Walk week by week (13 weeks ~ 90 days), deciding how many sessions land
  // in each week and where, rather than one global random pass.
  const totalWeeks = Math.ceil(TOTAL_DAYS / 7)
  for (let week = 0; week < totalWeeks; week += 1) {
    const weekStartDaysAgo = TOTAL_DAYS - week * 7
    const isMissWeek =
      weekStartDaysAgo <= MISS_WEEK_START_DAY + MISS_WEEK_SPAN_DAYS && weekStartDaysAgo >= MISS_WEEK_START_DAY

    // Near-miss cadence target is 3/week EARLY on (hit 2 most weeks, near-miss
    // pattern); after the deliberate miss + recovery, this user has become a
    // genuine power user doing 5-6 sessions/week — real volume, not a trickle.
    let sessionsThisWeek
    if (isMissWeek) sessionsThisWeek = 0
    else if (weekStartDaysAgo < MISS_WEEK_START_DAY) sessionsThisWeek = 5 + (seededRandom(week * 6.6) < 0.4 ? 1 : 0) // power-user cadence post-recovery
    else sessionsThisWeek = seededRandom(week * 3.1) < 0.35 ? 3 : 2 // near-miss pattern before the gap

    for (let s = 0; s < sessionsThisWeek; s += 1) {
      // Front-loaded within the week: land on Mon-Thu (front/mid half), never weekends.
      const dayInWeek = [1, 2, 2, 3, 3, 4][s % 6] // Tue/Wed-leaning, always weekday
      const daysAgo = Math.max(0, weekStartDaysAgo - dayInWeek)
      const date = dayOffset(daysAgo)
      // Tuesday/Thursday evening clustering: bias hour to 19-21, day to Tue/Thu.
      const useThu = seededRandom(idx * 4.4) > 0.5
      if (useThu && date.getDay() !== 4) {
        const delta = 4 - date.getDay()
        date.setDate(date.getDate() + delta)
      } else if (!useThu && date.getDay() !== 2) {
        const delta = 2 - date.getDay()
        date.setDate(date.getDate() + delta)
      }
      const hour = 19 + Math.floor(seededRandom(idx * 2.2) * 3)
      date.setHours(hour, Math.floor(seededRandom(idx * 1.1) * 60), 0, 0)

      const type = weighted[Math.floor(seededRandom(idx * 7.7) * weighted.length)]
      const catalog = caseCatalog.get(type)
      const caseEntry = catalog[Math.floor(seededRandom(idx * 5.5) * catalog.length)]

      // Score curve: genuine uptrend 2.4 -> 4.2 across the whole range, with
      // a real dip right after the miss week (post-miss-score-pattern) and
      // a cram-dip in the final week (end-of-period-rush-vs-score-pattern).
      const progressFraction = 1 - weekStartDaysAgo / TOTAL_DAYS // 0 oldest -> 1 newest
      let base = 2.4 + progressFraction * 1.8
      const justAfterMiss = weekStartDaysAgo < MISS_WEEK_START_DAY && weekStartDaysAgo >= MISS_WEEK_START_DAY - 7
      if (justAfterMiss) base -= 0.6 // real post-miss dip
      const isFinalWeek = weekStartDaysAgo <= 7
      if (isFinalWeek) base -= 0.5 // cram-before-deadline dip
      const jitter = (seededRandom(idx * 3.3) - 0.5) * 0.4
      const clamp = (v) => Math.max(0.5, Math.min(5, +v.toFixed(1)))
      const structureScore = clamp(base + jitter)
      const understandingScore = clamp(base + jitter * 0.9)
      const deliveryScore = clamp(base + jitter * 1.1)
      const creativityScore = clamp(base + jitter * 0.7)

      const lobbyId = `powertest-lobby-${userRecord.uid}-${idx}`
      const evaluationId = `powertest-eval-${userRecord.uid}-${idx}`
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
          interviewerId: 'goal-tracker-power-seed',
          candidateName: userRecord.displayName || userRecord.email || userRecord.uid,
          interviewerEmail: 'goal-tracker-power-seed@compendiumx.local',
          structureScore,
          understandingScore,
          deliveryScore,
          creativityScore,
          isUnrated: false,
          notes: `Seeded power-user evaluation for Goal Tracker testing (${type}).`,
          createdAt: ts,
          updatedAt: ts,
          demoSeed: true,
          demoSeedLabel: DEMO_SEED_LABEL,
        },
      })
      idx += 1
    }
  }

  return { records: records.sort((a, b) => a.date - b.date), untouchedType, usableTypes }
}

/** Three closed prior goals — feeds the cross-goal axis's 4 shapes. */
function buildGoalHistory(userRecord) {
  const now = admin.firestore.Timestamp.now()
  return [
    {
      id: `goalhist-${userRecord.uid}-1`,
      data: {
        config: {
          hasEndDate: true,
          endDate: '15/05/2026',
          hasRecurring: false,
          recurringCount: 0,
          recurringEvery: 0,
          recurringUnit: 'weeks',
          totalCases: 30,
          hasPerType: false,
          perType: {},
          startDate: '15/04/2026',
          countPastCases: false,
          countMode: 'completed',
          excludedTypes: [],
          excludedSessionIds: [],
          goalKind: 'flat',
        },
        completed: true,
        finalDone: 30,
        finalStreak: 0,
        bestStreak: 0,
        daysToComplete: 28,
        closedAt: now,
      },
    },
    {
      id: `goalhist-${userRecord.uid}-2`,
      data: {
        config: {
          hasEndDate: false,
          endDate: '',
          hasRecurring: true,
          recurringCount: 3,
          recurringEvery: 1,
          recurringUnit: 'weeks',
          totalCases: 24,
          hasPerType: false,
          perType: {},
          startDate: '01/03/2026',
          countPastCases: false,
          countMode: 'completed',
          excludedTypes: [],
          excludedSessionIds: [],
          goalKind: 'cadence',
        },
        completed: true,
        finalDone: 24,
        finalStreak: 6,
        bestStreak: 6,
        daysToComplete: 56,
        closedAt: now,
      },
    },
    {
      id: `goalhist-${userRecord.uid}-3`,
      data: {
        config: {
          hasEndDate: true,
          endDate: '10/02/2026',
          hasRecurring: false,
          recurringCount: 0,
          recurringEvery: 0,
          recurringUnit: 'weeks',
          totalCases: 25,
          hasPerType: false,
          perType: {},
          startDate: '10/01/2026',
          countPastCases: false,
          countMode: 'completed',
          excludedTypes: [],
          excludedSessionIds: [],
          goalKind: 'flat',
        },
        completed: false,
        finalDone: 16,
        finalStreak: 0,
        bestStreak: 0,
        fellShortBy: 9,
        closedAt: now,
      },
    },
  ]
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
  const { records, untouchedType, usableTypes } = buildPowerUserPlan(caseCatalog, userRecord)
  const goalHistoryEntries = buildGoalHistory(userRecord)

  const startDate = dayOffset(TOTAL_DAYS)
  const endDate = dayOffset(-14) // 2 weeks from now — goal is mid-flight, cram-week already baked in

  const goalConfig = {
    hasEndDate: true,
    endDate: toDMY(endDate),
    hasRecurring: false,
    recurringCount: 0,
    recurringEvery: 0,
    recurringUnit: 'weeks',
    totalCases: 200,
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
  console.log(`Sessions to seed: ${records.length}, spread across ${TOTAL_DAYS} days`)
  console.log(`Concentrated types: ${usableTypes.slice(0, 2).join(', ')} | Untouched type: ${untouchedType}`)
  console.log(`Deliberate miss window: ${MISS_WEEK_START_DAY}-${MISS_WEEK_START_DAY - MISS_WEEK_SPAN_DAYS} days ago`)
  console.log(`Goal history entries: ${goalHistoryEntries.length} (2 completed, 1 fell short)`)

  if (options.dryRun) {
    console.log('\nDry run only. No Firestore writes were made.')
    console.log('Sample session record:', JSON.stringify(records[0], null, 2))
    return
  }

  // Firestore batches cap at 500 writes; this dataset can exceed that
  // (goal doc + N sessions + N evaluations + 3 history entries), so chunk.
  const allWrites = [
    { ref: db.collection('goals').doc(userRecord.uid), data: { ...goalConfig, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, merge: false },
    ...records.flatMap((r) => [
      { ref: db.collection('sessions').doc(r.lobbyId), data: r.session, merge: true },
      { ref: db.collection('evaluations').doc(r.evaluationId), data: r.evaluation, merge: true },
    ]),
    ...goalHistoryEntries.map((h) => ({
      ref: db.collection('goalHistory').doc(userRecord.uid).collection('entries').doc(h.id),
      data: h.data,
      merge: true,
    })),
  ]

  const CHUNK_SIZE = 400
  for (let i = 0; i < allWrites.length; i += CHUNK_SIZE) {
    const batch = db.batch()
    for (const write of allWrites.slice(i, i + CHUNK_SIZE)) {
      batch.set(write.ref, write.data, { merge: write.merge })
    }
    await batch.commit()
    console.log(`Committed ${Math.min(i + CHUNK_SIZE, allWrites.length)} / ${allWrites.length} writes...`)
  }

  console.log('\nGoal Tracker power-user seed complete.')
  console.log(`Seed label: ${DEMO_SEED_LABEL}`)
  console.log(`Sessions + evaluations upserted: ${records.length}`)
  console.log(`Goal history entries upserted: ${goalHistoryEntries.length}`)
  console.log(`Goal config written to goals/${userRecord.uid}`)
}

main().catch((error) => {
  console.error('\nGoal Tracker power-user seed failed.')
  console.error(error)
  process.exit(1)
})

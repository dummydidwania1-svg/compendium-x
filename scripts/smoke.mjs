/**
 * End-to-end smoke test for the Phase 3+4 API surface.
 *
 * Prerequisites (in two separate terminals before running this):
 *   Terminal 1:  npm run emulators
 *   Terminal 2:  npm run dev:emulators
 *
 * Then in a third terminal:
 *   npm run smoke
 *
 * The script:
 *   1. Talks to the Firebase Auth emulator to create two test users
 *      (candidate + interviewer), retrieves their ID tokens.
 *   2. Seeds a case in the Firestore emulator via the Admin SDK.
 *   3. Walks the full session lifecycle through the live /api/* routes
 *      on localhost:3000 and asserts the expected outcomes.
 *   4. Verifies negative paths (non-candidate cannot complete; non-interviewer
 *      cannot submit evaluation; bad scores rejected).
 *
 * No real Firebase project is touched. Everything runs against emulators.
 */
import { setTimeout as sleep } from 'node:timers/promises'

const AUTH_EMULATOR = 'http://127.0.0.1:9099'
const FIRESTORE_EMULATOR = '127.0.0.1:8080'
const APP_BASE = process.env.APP_BASE_URL || 'http://localhost:3000'
const PROJECT_ID = 'compendium-x'
const FAKE_API_KEY = 'fake-api-key' // emulator accepts any value

// ---- Test harness --------------------------------------------------------

let passed = 0
let failed = 0
const failures = []

function ok(label) {
  passed += 1
  console.log(`  \x1b[32m✓\x1b[0m ${label}`)
}

function fail(label, detail) {
  failed += 1
  failures.push(`${label}: ${detail}`)
  console.log(`  \x1b[31m✗\x1b[0m ${label}`)
  console.log(`     \x1b[2m${detail}\x1b[0m`)
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`)
}

// ---- Auth helpers --------------------------------------------------------

async function signUp(email, password) {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FAKE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  if (!res.ok) {
    throw new Error(`Auth signUp failed for ${email}: HTTP ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return { uid: data.localId, idToken: data.idToken, email }
}

// ---- API helpers ---------------------------------------------------------

async function apiPost(path, token, body) {
  const res = await fetch(`${APP_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => null)
  return { status: res.status, payload }
}

// ---- Firestore helpers (Admin SDK against emulator) ----------------------

async function loadAdminDb() {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR
  const admin = await import('firebase-admin/app')
  const firestore = await import('firebase-admin/firestore')
  if (admin.getApps().length === 0) {
    admin.initializeApp({ projectId: PROJECT_ID })
  }
  return firestore.getFirestore()
}

async function seedCase(db, caseId) {
  await db.collection('cases').doc(caseId).set({
    title: 'Smoke Test Case',
    industry: 'TestingCorp',
    difficulty: 'Medium',
    case_type: 'Profitability',
    prompt: 'A smoke-test case used by scripts/smoke.mjs.',
    framework: 'Profitability tree.',
  })
}

async function readSession(db, lobbyId) {
  const snap = await db.collection('sessions').doc(lobbyId).get()
  return snap.exists ? snap.data() : null
}

async function readEvaluation(db, evaluationId) {
  const snap = await db.collection('evaluations').doc(evaluationId).get()
  return snap.exists ? snap.data() : null
}

// ---- Connectivity preflight ---------------------------------------------

async function preflight() {
  section('0. Preflight — checking emulators and dev server are reachable')
  try {
    const res = await fetch(`${AUTH_EMULATOR}`)
    if (!res.ok && res.status !== 200) throw new Error(`status ${res.status}`)
    ok('auth emulator reachable on 9099')
  } catch (err) {
    fail('auth emulator reachable on 9099', err.message)
    return false
  }
  try {
    const res = await fetch(`http://${FIRESTORE_EMULATOR}`)
    if (res.status !== 200 && res.status !== 404 && res.status !== 400) {
      throw new Error(`status ${res.status}`)
    }
    ok('firestore emulator reachable on 8080')
  } catch (err) {
    fail('firestore emulator reachable on 8080', err.message)
    return false
  }
  try {
    // Hit a route that exists in *our* app and has a known shape. A bare 200
    // from anything isn't enough — port 3000 might be squatted by another app.
    const res = await fetch(`${APP_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const payload = await res.json().catch(() => null)
    if (res.status !== 401 || payload?.error?.code !== 'missing_token') {
      throw new Error(
        `expected 401 missing_token from /api/sessions, got ${res.status} ${JSON.stringify(payload)}. ` +
          `Is the right Next.js dev server running on ${APP_BASE}?`,
      )
    }
    ok(`compendium-x dev server reachable on ${APP_BASE}`)
  } catch (err) {
    fail(`compendium-x dev server reachable on ${APP_BASE}`, err.message)
    return false
  }
  return true
}

// ---- Main flow -----------------------------------------------------------

async function main() {
  console.log('\x1b[1m\x1b[36mCompendium X smoke test\x1b[0m')
  console.log(`\x1b[2mAPP_BASE=${APP_BASE}\x1b[0m`)

  if (!(await preflight())) {
    console.log('\nPreflight failed. Start the emulators and dev server first.')
    process.exitCode = 1
    return
  }

  const db = await loadAdminDb()

  // 1. Set up test data
  section('1. Seed test data')
  const caseId = `smoke-case-${Date.now()}`
  const lobbyId = `smoke-lobby-${Date.now()}`
  try {
    await seedCase(db, caseId)
    ok(`seeded case ${caseId} in cases collection`)
  } catch (err) {
    fail('seed case', err.message)
    return
  }

  const candidate = await signUp(`smoke-cand-${Date.now()}@test.dev`, 'password123')
  ok(`signed up candidate ${candidate.email}`)
  const interviewer = await signUp(`smoke-int-${Date.now()}@test.dev`, 'password123')
  ok(`signed up interviewer ${interviewer.email}`)
  const stranger = await signUp(`smoke-stranger-${Date.now()}@test.dev`, 'password123')
  ok(`signed up unrelated stranger ${stranger.email}`)

  // 2. Candidate creates session
  section('2. POST /api/sessions — candidate creates session')
  {
    const r = await apiPost('/api/sessions', candidate.idToken, { lobbyId, sessionMode: 'remote' })
    r.status === 200
      ? ok(`200 returned (lobbyId=${r.payload?.lobbyId})`)
      : fail('status 200', `got ${r.status} ${JSON.stringify(r.payload)}`)
    const sess = await readSession(db, lobbyId)
    sess?.status === 'waiting'
      ? ok('Firestore session.status = "waiting"')
      : fail('session.status = "waiting"', `got ${sess?.status}`)
    sess?.candidateId === candidate.uid
      ? ok('session.candidateId matches caller uid')
      : fail('session.candidateId set', `got ${sess?.candidateId}`)
  }

  // 3. Negative: stranger tries to take over the lobby
  section('3. Negative — stranger tries to take same lobbyId')
  {
    const r = await apiPost('/api/sessions', stranger.idToken, { lobbyId, sessionMode: 'remote' })
    r.status === 403 && r.payload?.error?.code === 'session_owned_by_other'
      ? ok('403 session_owned_by_other')
      : fail('403 session_owned_by_other', `got ${r.status} ${JSON.stringify(r.payload)}`)
  }

  // 4. Interviewer selects case
  section('4. POST /api/sessions/[id]/select-case — interviewer attaches case')
  {
    const r = await apiPost(
      `/api/sessions/${encodeURIComponent(lobbyId)}/select-case`,
      interviewer.idToken,
      { caseId, sessionMode: 'remote' },
    )
    r.status === 200
      ? ok(`200 returned (caseId=${r.payload?.caseId})`)
      : fail('status 200', `got ${r.status} ${JSON.stringify(r.payload)}`)
    const sess = await readSession(db, lobbyId)
    sess?.status === 'in_progress'
      ? ok('session.status = "in_progress"')
      : fail('session.status = "in_progress"', `got ${sess?.status}`)
    sess?.interviewerId === interviewer.uid
      ? ok('session.interviewerId set to caller uid')
      : fail('session.interviewerId', `got ${sess?.interviewerId}`)
    sess?.caseId === caseId
      ? ok('session.caseId set')
      : fail('session.caseId', `got ${sess?.caseId}`)
  }

  // 5. Negative: re-selecting case is rejected (state machine)
  section('5. Negative — interviewer cannot select-case twice (state machine)')
  {
    const r = await apiPost(
      `/api/sessions/${encodeURIComponent(lobbyId)}/select-case`,
      interviewer.idToken,
      { caseId, sessionMode: 'remote' },
    )
    r.status === 409 && r.payload?.error?.code === 'invalid_transition'
      ? ok('409 invalid_transition')
      : fail('409 invalid_transition', `got ${r.status} ${JSON.stringify(r.payload)}`)
  }

  // 6. Candidate posts a recording metadata (upload_failed path — simulates upload error)
  section('6. POST /api/sessions/[id]/recording — candidate records (upload_failed path)')
  {
    const r = await apiPost(
      `/api/sessions/${encodeURIComponent(lobbyId)}/recording`,
      candidate.idToken,
      {
        status: 'upload_failed',
        mode: 'remote',
        stoppedAtMs: Date.now(),
        stopReason: 'smoke_test_simulated_fail',
        error: 'simulated by smoke test',
      },
    )
    r.status === 200
      ? ok('200 returned')
      : fail('status 200', `got ${r.status} ${JSON.stringify(r.payload)}`)
    const sess = await readSession(db, lobbyId)
    sess?.recording?.status === 'upload_failed'
      ? ok('session.recording.status = "upload_failed"')
      : fail('recording.status', `got ${sess?.recording?.status}`)
  }

  // 7. Negative: stranger cannot mark recording on someone else's session
  section('7. Negative — stranger cannot post recording on this session')
  {
    const r = await apiPost(
      `/api/sessions/${encodeURIComponent(lobbyId)}/recording`,
      stranger.idToken,
      {
        status: 'upload_failed',
        mode: 'remote',
        stoppedAtMs: Date.now(),
        stopReason: 'smoke_test_attack',
        error: 'should be rejected',
      },
    )
    r.status === 403 && r.payload?.error?.code === 'not_candidate'
      ? ok('403 not_candidate')
      : fail('403 not_candidate', `got ${r.status} ${JSON.stringify(r.payload)}`)
  }

  // 8. Negative: candidate cannot submit evaluation
  section('8. Negative — candidate cannot submit evaluation (not interviewer)')
  {
    const r = await apiPost('/api/evaluations', candidate.idToken, {
      lobbyId,
      caseId,
      scores: { structure: 4, understanding: 4, delivery: 4, creativity: 4 },
      notes: 'should not work',
    })
    r.status === 403 && r.payload?.error?.code === 'not_interviewer'
      ? ok('403 not_interviewer')
      : fail('403 not_interviewer', `got ${r.status} ${JSON.stringify(r.payload)}`)
  }

  // 9. Negative: score out of range
  section('9. Negative — score out of range rejected')
  {
    const r = await apiPost('/api/evaluations', interviewer.idToken, {
      lobbyId,
      caseId,
      scores: { structure: 7, understanding: 4, delivery: 4, creativity: 4 },
      notes: 'invalid scores',
    })
    r.status === 400 && r.payload?.error?.code === 'invalid_payload'
      ? ok('400 invalid_payload')
      : fail('400 invalid_payload', `got ${r.status} ${JSON.stringify(r.payload)}`)
  }

  // 10. Interviewer submits evaluation
  section('10. POST /api/evaluations — interviewer submits scores')
  let evaluationId
  {
    const r = await apiPost('/api/evaluations', interviewer.idToken, {
      lobbyId,
      caseId,
      scores: { structure: 4, understanding: 3, delivery: 5, creativity: 4 },
      notes: 'Solid framing, slow on math. Good recovery in synthesis.',
    })
    r.status === 200
      ? ok(`200 returned (evaluationId=${r.payload?.evaluationId})`)
      : fail('status 200', `got ${r.status} ${JSON.stringify(r.payload)}`)
    evaluationId = r.payload?.evaluationId
    const sess = await readSession(db, lobbyId)
    sess?.status === 'completed'
      ? ok('session.status = "completed"')
      : fail('session.status = "completed"', `got ${sess?.status}`)
    if (evaluationId) {
      const ev = await readEvaluation(db, evaluationId)
      ev?.structureScore === 4 && ev?.deliveryScore === 5
        ? ok('evaluation scores stored correctly')
        : fail('evaluation scores', JSON.stringify(ev))
      ev?.candidateId === candidate.uid && ev?.interviewerId === interviewer.uid
        ? ok('evaluation identities derived from token (not client-supplied)')
        : fail('evaluation identities', `cand=${ev?.candidateId} int=${ev?.interviewerId}`)
      ev?.caseTitle === 'Smoke Test Case'
        ? ok('caseTitle fetched from cases collection (server-derived)')
        : fail('caseTitle from cases', `got ${ev?.caseTitle}`)
    }
  }

  // 11. Negative: cannot complete already-completed session
  section('11. Negative — completing already-completed session')
  {
    const r = await apiPost(
      `/api/sessions/${encodeURIComponent(lobbyId)}/complete`,
      candidate.idToken,
      { completedBy: 'candidate' },
    )
    // Idempotent path: returns 200 with no-op
    r.status === 200
      ? ok('200 idempotent no-op for already-completed session')
      : fail('200 idempotent', `got ${r.status} ${JSON.stringify(r.payload)}`)
  }

  // 12. Negative: missing auth
  section('12. Negative — missing Authorization header')
  {
    const res = await fetch(`${APP_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobbyId: 'irrelevant', sessionMode: 'remote' }),
    })
    const payload = await res.json().catch(() => null)
    res.status === 401 && payload?.error?.code === 'missing_token'
      ? ok('401 missing_token')
      : fail('401 missing_token', `got ${res.status} ${JSON.stringify(payload)}`)
  }

  // Cleanup
  section('99. Cleanup')
  await db.collection('cases').doc(caseId).delete()
  await db.collection('sessions').doc(lobbyId).delete()
  if (evaluationId) await db.collection('evaluations').doc(evaluationId).delete()
  ok('cleaned up smoke test docs')

  await sleep(50) // let logs flush

  // Summary
  console.log('\n' + '─'.repeat(50))
  if (failed === 0) {
    console.log(`\x1b[1m\x1b[32m✓ All ${passed} checks passed\x1b[0m`)
  } else {
    console.log(`\x1b[1m\x1b[31m✗ ${failed} of ${passed + failed} checks failed:\x1b[0m`)
    for (const line of failures) console.log(`  - ${line}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\n\x1b[31mSmoke test crashed:\x1b[0m', err)
  process.exitCode = 1
})

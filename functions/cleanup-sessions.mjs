/**
 * cleanup-sessions.mjs
 *
 * One-off maintenance sweep over the last 180 days of sessions.
 *
 *   1. DELETE empty/fake "waiting" lobbies — lobby links that were created but
 *      never ran a case (no caseId, no audio anywhere, no evaluation, no
 *      recordings subcollection). These are pure noise.
 *
 *   2. FIX stuck local (same-device) sessions — session is over
 *      (completed / fallback_unrated / abandoned) but the EMBEDDED
 *      recording.transcriptStatus is still 'recording' with real flushed audio.
 *      Promote it to 'pending' so the transcribeRecording Cloud Function fires.
 *
 *   3. FIX stuck remote (dual-mic) tracks — a recordings/{role} subcollection
 *      track stuck at transcriptStatus 'recording' with audio present, on a
 *      session that is over. Promote to 'pending' so transcribeParticipantRecording
 *      fires; the merge function then finalizes mergedTranscriptStatus.
 *
 * SAFE BY DEFAULT: runs in DRY-RUN and only prints what it *would* do.
 * Pass --apply to actually write/delete.
 *
 *   node functions/cleanup-sessions.mjs           # dry run (no writes)
 *   node functions/cleanup-sessions.mjs --apply   # perform the cleanup
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : path.join(projectRoot, 'serviceAccountKey.json')

if (!existsSync(credentialPath)) {
  console.error(`Service account file not found at ${credentialPath}`)
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const DAYS = 180
const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000

const sa = JSON.parse(readFileSync(credentialPath, 'utf8'))
initializeApp({ credential: cert(sa), projectId: process.env.FIREBASE_PROJECT_ID || 'compendium-x' })
const db = getFirestore()

const stampMs = (d) => d?.updatedAt?.toMillis?.() ?? d?.createdAt?.toMillis?.() ?? 0
const hasAnyAudio = (d) =>
  Boolean(d.recording?.audioUrl || d.candidateAudioUrl || d.interviewerAudioUrl)

async function deleteSessionDeep(ref) {
  // Delete known subcollections first, then the doc.
  for (const sub of ['recordings']) {
    const subSnap = await ref.collection(sub).get()
    for (const s of subSnap.docs) await s.ref.delete()
  }
  await ref.delete()
}

async function run() {
  console.log(`\n${APPLY ? '*** APPLY MODE — writing changes ***' : '--- DRY RUN (no writes) — pass --apply to execute ---'}`)
  console.log(`Window: last ${DAYS} days\n`)

  const snap = await db.collection('sessions').get()
  const all = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, d: d.data() }))
    .filter((x) => stampMs(x.d) >= cutoff)

  console.log(`Sessions in window: ${all.length}\n`)

  /* ---------- Group 1: delete empty/fake waiting lobbies ---------- */
  const emptyWaitingCandidates = all.filter(
    (x) => x.d.status === 'waiting' && !x.d.caseId && !hasAnyAudio(x.d),
  )

  let deleted = 0
  let skippedHadData = 0
  console.log(`Group 1 — empty "waiting" lobby candidates: ${emptyWaitingCandidates.length}`)
  for (const x of emptyWaitingCandidates) {
    // Final safety before delete: never delete if an evaluation or a recordings
    // subcollection exists (would mean a real session hid behind a stale status).
    const [ev, rec] = await Promise.all([
      db.collection('evaluations').where('lobbyId', '==', x.id).limit(1).get(),
      x.ref.collection('recordings').limit(1).get(),
    ])
    if (!ev.empty || !rec.empty) {
      skippedHadData++
      console.log(`  [skip] ${x.id} — has ${!ev.empty ? 'evaluation' : ''}${!ev.empty && !rec.empty ? '+' : ''}${!rec.empty ? 'recordings' : ''}, not empty`)
      continue
    }
    if (APPLY) {
      try {
        await deleteSessionDeep(x.ref)
      } catch (e) {
        console.log(`  [error] ${x.id} — delete failed (${e.message}), will retry on next run`)
        continue
      }
    }
    deleted++
  }
  console.log(`  -> ${APPLY ? 'deleted' : 'would delete'}: ${deleted}${skippedHadData ? `, skipped (had data): ${skippedHadData}` : ''}\n`)

  /* ---------- Group 2: fix stuck local (embedded) transcripts ---------- */
  const localStuck = all.filter(
    (x) =>
      x.d.sessionMode === 'local' &&
      x.d.recording?.transcriptStatus === 'recording' &&
      x.d.recording?.audioUrl,
  )
  console.log(`Group 2 — stuck local embedded transcripts (recording -> pending): ${localStuck.length}`)
  let localFixed = 0
  for (const x of localStuck) {
    console.log(`  ${APPLY ? '[fix]' : '[would fix]'} ${x.id} — status:${x.d.status} stopReason:${x.d.recording?.stopReason}`)
    if (APPLY) {
      try {
        await x.ref.set(
          { recording: { transcriptStatus: 'pending' }, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      } catch (e) {
        console.log(`  [error] ${x.id} — promote failed (${e.message}), will retry on next run`)
        continue
      }
    }
    localFixed++
  }
  console.log(`  -> ${APPLY ? 'fixed' : 'would fix'}: ${localFixed}\n`)

  /* ---------- Group 3: fix stuck remote subcollection tracks ---------- */
  // A remote session whose merge never finalized: look at each recordings/{role}
  // track and promote any stuck at 'recording' (with audio) to 'pending'.
  const remoteCandidates = all.filter(
    (x) =>
      x.d.sessionMode === 'remote' &&
      x.d.mergedTranscriptStatus !== 'completed' &&
      x.d.mergedTranscriptStatus !== 'failed',
  )
  console.log(`Group 3 — remote sessions with non-final merge: ${remoteCandidates.length}`)
  let trackFixed = 0
  const affectedRemote = new Set()
  for (const x of remoteCandidates) {
    const recSnap = await x.ref.collection('recordings').get()
    for (const t of recSnap.docs) {
      const td = t.data()
      if (td.transcriptStatus === 'recording' && td.audioUrl) {
        console.log(`  ${APPLY ? '[fix]' : '[would fix]'} ${x.id}/${t.id} — track recording -> pending`)
        if (APPLY) {
          try {
            await t.ref.set(
              { transcriptStatus: 'pending', updatedAt: FieldValue.serverTimestamp() },
              { merge: true },
            )
          } catch (e) {
            console.log(`  [error] ${x.id}/${t.id} — promote failed (${e.message}), will retry on next run`)
            continue
          }
        }
        trackFixed++
        affectedRemote.add(x.id)
      }
    }
  }
  console.log(`  -> ${APPLY ? 'fixed' : 'would fix'} tracks: ${trackFixed} across ${affectedRemote.size} sessions\n`)

  console.log('=== Summary ===')
  console.log(`Empty waiting lobbies ${APPLY ? 'deleted' : 'to delete'}: ${deleted}`)
  console.log(`Local transcripts ${APPLY ? 'promoted' : 'to promote'}: ${localFixed}`)
  console.log(`Remote tracks ${APPLY ? 'promoted' : 'to promote'}: ${trackFixed}`)
  if (!APPLY) console.log('\nRe-run with --apply to execute.')
  process.exit(0)
}

run().catch((err) => { console.error(err); process.exit(1) })

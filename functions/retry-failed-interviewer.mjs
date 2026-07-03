/**
 * retry-failed-interviewer.mjs
 *
 * One-shot admin script: resets any interviewer recording tracks that are
 * stuck in 'failed' (due to HTTP 403 token invalidation) back to 'pending',
 * triggering a fresh transcription attempt via transcribeParticipantRecording.
 *
 * Run from the project root:
 *   node functions/retry-failed-interviewer.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const sa = JSON.parse(readFileSync('C:/Users/Pratik/AppData/Local/Temp/gmail_key_nobom.json', 'utf8'))
initializeApp({ credential: cert(sa), projectId: 'compendium-x' })
const db = getFirestore()

// Optional: target a specific session only
const TARGET_SESSION = process.argv[2] ?? null

let snapshot
if (TARGET_SESSION) {
  const trackRef = db.collection('sessions').doc(TARGET_SESSION).collection('recordings').doc('interviewer')
  const snap = await trackRef.get()
  snapshot = snap.exists ? [{ ref: trackRef, data: () => snap.data(), id: TARGET_SESSION }] : []
} else {
  // Find all sessions that still need merging
  const sessionSnap = await db.collection('sessions')
    .where('candidateTranscriptStatus', '==', 'completed')
    .get()

  snapshot = []
  for (const doc of sessionSnap.docs) {
    const d = doc.data()
    if (d.mergedTranscriptStatus === 'completed') continue
    const trackRef = doc.ref.collection('recordings').doc('interviewer')
    const trackSnap = await trackRef.get()
    if (trackSnap.exists && trackSnap.data()?.transcriptStatus === 'failed') {
      snapshot.push({ ref: trackRef, data: () => trackSnap.data(), id: doc.id })
    }
  }
}

let retried = 0
for (const entry of snapshot) {
  const track = entry.data()
  if (track.transcriptStatus !== 'failed') {
    console.log(`[skip] ${entry.id} — status is '${track.transcriptStatus}', not 'failed'`)
    continue
  }
  if (!track.storagePath) {
    console.log(`[skip] ${entry.id} — no storagePath on interviewer track`)
    continue
  }
  await entry.ref.set(
    {
      transcriptStatus: 'pending',
      transcriptError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  retried++
  console.log(`[retried] ${entry.id} — interviewer track → pending (storagePath: ${track.storagePath})`)
}

console.log(`\nDone. Reset ${retried} failed track(s) to pending.`)

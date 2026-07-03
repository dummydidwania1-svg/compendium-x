/**
 * fix-stuck-sessions.mjs
 *
 * One-shot admin script: promotes every interviewer recording track that is
 * stuck in 'recording' (periodic-flush state, final upload never arrived) to
 * 'pending', triggering the transcribeParticipantRecording Cloud Function
 * immediately rather than waiting for the finalizePendingMerges sweep.
 *
 * Run from the project root:
 *   node functions/fix-stuck-sessions.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const sa = JSON.parse(readFileSync('C:/Users/Pratik/AppData/Local/Temp/gmail_key_nobom.json', 'utf8'))
initializeApp({ credential: cert(sa), projectId: 'compendium-x' })
const db = getFirestore()

// Find all sessions where the candidate transcript is done but the overall
// merge is still partial (or pending) — these are candidates for a stuck
// interviewer track.
const snapshot = await db
  .collection('sessions')
  .where('candidateTranscriptStatus', '==', 'completed')
  .get()

let checked = 0
let promoted = 0

for (const sessionDoc of snapshot.docs) {
  const data = sessionDoc.data()
  const mergedStatus = data.mergedTranscriptStatus

  // Skip sessions that are already fully merged.
  if (mergedStatus === 'completed' || mergedStatus === 'processing') continue

  const interviewerTrackRef = sessionDoc.ref.collection('recordings').doc('interviewer')
  const trackSnap = await interviewerTrackRef.get()

  if (!trackSnap.exists) continue

  const track = trackSnap.data()
  checked++

  // Only promote if the track has audio (periodic flush succeeded) but
  // transcription was never queued (stuck in 'recording').
  if (track.transcriptStatus !== 'recording') {
    console.log(`[skip] ${sessionDoc.id} — interviewer status: ${track.transcriptStatus}`)
    continue
  }
  if (!track.audioUrl) {
    console.log(`[skip] ${sessionDoc.id} — no audioUrl on interviewer track`)
    continue
  }

  await interviewerTrackRef.set(
    { transcriptStatus: 'pending', updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
  promoted++
  console.log(`[promoted] ${sessionDoc.id} — interviewer track → pending (audioUrl present)`)
}

console.log(`\nDone. Checked ${checked} stuck candidates, promoted ${promoted}.`)

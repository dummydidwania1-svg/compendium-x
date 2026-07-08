/**
 * fix-mistagged-local-sessions.mjs
 * For each mistagged local session: clear the remote-mode-only root fields and
 * re-arm the embedded pipeline from the last-flushed candidate track so the
 * REAL local pipeline decides the terminal state (completed w/ diarization, or
 * failed for zero-byte/silent). Run the audit first and review.
 *   node functions/fix-mistagged-local-sessions.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const sa = JSON.parse(readFileSync('C:/Users/Pratik/AppData/Local/Temp/gmail_key_nobom.json', 'utf8'))
initializeApp({ credential: cert(sa), projectId: 'compendium-x' })
const db = getFirestore()

const snapshot = await db.collection('sessions').where('sessionMode', '==', 'local').get()

let fixed = 0
for (const sessionDoc of snapshot.docs) {
  const recs = await sessionDoc.ref.collection('recordings').get()
  if (recs.empty) continue

  const cand = recs.docs.find((r) => r.id === 'candidate') ?? recs.docs[0]
  const c = cand.data()

  // Clear the remote-mode-only fields the mistag wrote onto the session root.
  const clear = {
    mergedAudioStatus: FieldValue.delete(),
    mergedAudioReason: FieldValue.delete(),
    mergedTranscriptStatus: FieldValue.delete(),
    mergedTranscriptReason: FieldValue.delete(),
    mergedTranscriptError: FieldValue.delete(),
    candidateAudioUrl: FieldValue.delete(),
    candidateTranscriptStatus: FieldValue.delete(),
    candidateTranscriptCompletedAt: FieldValue.delete(),
    interviewerTranscriptStatus: FieldValue.delete(),
    interviewerTranscriptCompletedAt: FieldValue.delete(),
  }

  if (c.audioUrl && c.storagePath) {
    // Real partial audio exists → re-arm embedded transcription ('pending'
    // triggers transcribeRecording, which will complete-w/-diarization or fail).
    await sessionDoc.ref.set({
      ...clear,
      recording: {
        audioUrl: c.audioUrl,
        storagePath: c.storagePath,
        mimeType: c.mimeType ?? 'audio/webm',
        byteSize: c.byteSize ?? 0,
        stopReason: c.stopReason ?? 'page_hide',
        transcriptStatus: 'pending',
        transcriptError: null,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  } else {
    // No usable audio (e.g. 6luk8c) → terminal 'failed', mirroring the embedded throw.
    await sessionDoc.ref.set({
      ...clear,
      recording: {
        transcriptStatus: 'failed',
        transcriptError: 'Audio artifact is empty.',
        transcriptFailedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  fixed++
  console.log(`[fixed] ${sessionDoc.id} (${c.audioUrl ? 're-armed' : 'failed'})`)
}
console.log(`\nDone. Fixed ${fixed} sessions.`)
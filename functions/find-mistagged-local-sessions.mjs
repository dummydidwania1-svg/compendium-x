/**
 * find-mistagged-local-sessions.mjs  (READ-ONLY)
 * Lists every sessionMode:'local' session that wrongly has a recordings/*
 * subcollection doc (the mistag), plus the remote-mode fields to be cleared.
 *   node functions/find-mistagged-local-sessions.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const sa = JSON.parse(readFileSync('C:/Users/Pratik/AppData/Local/Temp/gmail_key_nobom.json', 'utf8'))
initializeApp({ credential: cert(sa), projectId: 'compendium-x' })
const db = getFirestore()

const snapshot = await db.collection('sessions').where('sessionMode', '==', 'local').get()

let scanned = 0
let mistagged = 0
for (const sessionDoc of snapshot.docs) {
  scanned++
  const recs = await sessionDoc.ref.collection('recordings').get()
  if (recs.empty) continue
  mistagged++
  const d = sessionDoc.data()
  console.log(`[mistagged] ${sessionDoc.id}`)
  console.log(`    recordings docs   : ${recs.docs.map((r) => r.id).join(', ')}`)
  console.log(`    stopReason        : ${d.recording?.stopReason ?? '(none)'}`)
  console.log(`    recording.status  : ${d.recording?.transcriptStatus ?? '(none)'}`)
  console.log(`    mergedAudioStatus : ${d.mergedAudioStatus ?? '(none)'}`)
  console.log(`    mergedTransStatus : ${d.mergedTranscriptStatus ?? '(none)'}`)
  console.log(`    candidateTransSt. : ${d.candidateTranscriptStatus ?? '(none)'}`)
}
console.log(`\nDone. Scanned ${scanned} local sessions, ${mistagged} mistagged.`)
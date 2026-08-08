// Diagnostic (read-only, no writes): scans the `goals` collection for any
// document with totalCases <= 0. Before the resolveTotalState fix in
// lib/goalTracker/engine.ts, such a goal would render as "complete" the
// instant it was created, regardless of actual progress.
//
// Usage: node scripts/check-zero-total-goals.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const serviceAccountPath = path.resolve(projectRoot, 'serviceAccountKey.json')

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Service account key not found: ${serviceAccountPath}`)
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

const snap = await db.collection('goals').get()
console.log(`Scanned ${snap.size} goal(s).`)

const affected = []
for (const doc of snap.docs) {
  const data = doc.data()
  const total = typeof data.totalCases === 'number' ? data.totalCases : undefined
  if (total === undefined || total <= 0) {
    affected.push({ uid: doc.id, totalCases: total, goalKind: data.goalKind, hasEndDate: data.hasEndDate, startDate: data.startDate })
  }
}

if (affected.length === 0) {
  console.log('No goals found with totalCases <= 0. Nothing to fix.')
} else {
  console.log(`Found ${affected.length} goal(s) with totalCases <= 0:`)
  for (const g of affected) {
    console.log(`  uid=${g.uid} totalCases=${g.totalCases} goalKind=${g.goalKind} hasEndDate=${g.hasEndDate} startDate=${g.startDate}`)
  }
  console.log('\nThis script makes no changes. Review each uid above before deciding how to fix it manually.')
}

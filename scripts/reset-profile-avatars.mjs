// One-time migration: clears photoURL and avatarPreset on every profile so
// everyone falls back cleanly to their live Google photo (or initials, for
// email/password users) under the fixed avatar logic. Needed because the
// pre-fix "Use Google photo" flow could leave a stale photoURL sitting on a
// profile that the app couldn't otherwise distinguish from a real upload.
//
// Usage: node scripts/reset-profile-avatars.mjs [--dry-run]
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const serviceAccountPath = path.resolve(projectRoot, 'serviceAccountKey.json')

const dryRun = process.argv.includes('--dry-run')

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Service account key not found: ${serviceAccountPath}`)
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

const snap = await db.collection('profiles').get()
console.log(`Found ${snap.size} profile(s).${dryRun ? ' (dry run — no writes)' : ''}`)

let touched = 0
let batch = db.batch()
let batchCount = 0

for (const doc of snap.docs) {
  const data = doc.data()
  const hasPhoto = typeof data.photoURL === 'string' && data.photoURL.length > 0
  const hasPreset = typeof data.avatarPreset === 'string' && data.avatarPreset.length > 0
  if (!hasPhoto && !hasPreset) continue

  touched += 1
  console.log(`  ${doc.id}: photoURL=${hasPhoto ? 'set' : 'unset'} avatarPreset=${data.avatarPreset ?? 'unset'}`)
  if (dryRun) continue

  batch.set(doc.ref, { photoURL: null, avatarPreset: null }, { merge: true })
  batchCount += 1
  if (batchCount >= 450) {
    await batch.commit()
    batch = db.batch()
    batchCount = 0
  }
}

if (!dryRun && batchCount > 0) {
  await batch.commit()
}

console.log(`${dryRun ? 'Would reset' : 'Reset'} ${touched} of ${snap.size} profile(s).`)
